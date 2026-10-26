import { describe, expect, it } from 'vitest'
import { buildIssueStats, type DeliveryStatRow } from './gilyonotStats'

const row = (p: Partial<DeliveryStatRow>): DeliveryStatRow => ({
  status: 'sent', sent_at: null, delivered_at: null, opened_at: null, downloaded_at: null, bounced_at: null, complained_at: null, ...p,
})

describe('buildIssueStats', () => {
  it('ריק: בלי ציר זמן', () => {
    const s = buildIssueStats([row({ status: 'pending' })], new Date('2026-10-20T10:00:00Z'))
    expect(s).toMatchObject({ total: 1, pending: 1, failed: 0, timeline: [] })
  })

  it('סופר ומצטבר לפי שעה', () => {
    const rows = [
      row({ sent_at: '2026-10-20T08:05:00Z', delivered_at: '2026-10-20T08:06:00Z', opened_at: '2026-10-20T09:30:00Z', downloaded_at: '2026-10-20T09:31:00Z' }),
      row({ sent_at: '2026-10-20T08:10:00Z', bounced_at: '2026-10-20T08:11:00Z' }),
      row({ status: 'failed' }),
    ]
    const s = buildIssueStats(rows, new Date('2026-10-20T10:15:00Z'))
    expect(s.counts).toEqual({ sent: 2, delivered: 1, opened: 1, clicked: 0, downloaded: 1, unsubscribed: 0, bounced: 1, complained: 0 })
    expect(s.failed).toBe(1)
    expect(s.bucket).toBe('hour')
    expect(s.timeline.map(p => p.t)).toEqual(['2026-10-20T08:00:00.000Z', '2026-10-20T09:00:00.000Z', '2026-10-20T10:00:00.000Z'])
    expect(s.timeline.map(p => p.opened)).toEqual([0, 1, 1])
    expect(s.timeline.at(-1)).toMatchObject({ sent: 2, delivered: 1, bounced: 1, downloaded: 1 })
  })

  it('פתיחות לפי שעה ביממה בשעון ישראל', () => {
    const s = buildIssueStats([row({ sent_at: '2026-10-20T08:00:00Z', opened_at: '2026-10-20T09:30:00Z', clicked_at: '2026-10-20T21:30:00Z' })], new Date('2026-10-21T00:00:00Z'))
    expect(s.byHour).toHaveLength(24)
    expect(s.byHour[12].opened).toBe(1)
    expect(s.byHour[0].clicked).toBe(1)
  })

  it('אחרי יותר משלושה ימים עובר לדליים של יום', () => {
    const s = buildIssueStats([row({ sent_at: '2026-10-10T08:00:00Z', opened_at: '2026-10-15T08:00:00Z' })], new Date('2026-10-20T08:00:00Z'))
    expect(s.bucket).toBe('day')
    expect(s.timeline).toHaveLength(11)
    expect(s.timeline.at(-1)).toMatchObject({ sent: 1, opened: 1 })
  })
})
