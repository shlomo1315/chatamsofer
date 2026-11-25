import { describe, expect, it } from 'vitest'
import { buildEngagement, buildLiveView, LIVE_MINUTES, pctOfSent } from './gilyonotLive'

const T0 = Date.parse('2026-11-18T19:18:00Z')
/** שני מיילים בשנייה מ-T0, למשך n שניות */
const run = (from: number, secs: number) => Array.from({ length: secs * 2 }, (_, i) => from + Math.floor(i / 2) * 1000)

describe('buildLiveView', () => {
  it('מחשב קצב וזמן לסיום משליחה רציפה', () => {
    const times = run(T0, 600)
    const v = buildLiveView(times, 1200, { now: new Date(T0 + 600_000), status: 'sending' })
    expect(v.rate).toBe(2)
    expect(v.etaSec).toBeGreaterThanOrEqual(600)
    expect(v.etaSec).toBeLessThan(610)
    expect(v.active).toBe(true)
    expect(v.gaps).toEqual([])
    expect(v.minutes).toHaveLength(LIVE_MINUTES)
    expect(v.minutes[1].count).toBe(120)
  })

  it('מזהה עצירה באמצע ואת הנמען שממנו השליחה המשיכה', () => {
    const before = run(T0, 300) // 600 מיילים
    const after = run(T0 + 300_000 + 4 * 60_000, 60)
    const v = buildLiveView([...after, ...before], 100, { now: new Date(T0 + 10 * 60_000 + 10_000), status: 'sending' })
    expect(v.gaps).toHaveLength(1)
    expect(v.gaps[0].minutes).toBe(4)
    expect(v.gaps[0].resumedAt).toBe(601)
    expect(v.minutes.some(m => m.gap)).toBe(true)
  })

  it('עצירה שעדיין נמשכת: אין קצב ואין זמן משוער', () => {
    const v = buildLiveView(run(T0, 60), 500, { now: new Date(T0 + 20 * 60_000), status: 'sending' })
    expect(v.active).toBe(false)
    expect(v.etaSec).toBeNull()
    expect(v.gaps.at(-1)).toMatchObject({ to: null, resumedAt: null })
  })

  it('שליחה שהסתיימה: העמודות נגמרות בזמן הסיום', () => {
    const times = run(T0, 120)
    const v = buildLiveView(times, 0, { now: new Date(T0 + 5 * 3600_000), status: 'sent', completedAt: new Date(T0 + 120_000).toISOString() })
    expect(v.etaSec).toBeNull()
    expect(v.minutes.reduce((n, m) => n + m.count, 0)).toBe(240)
  })
})

describe('buildEngagement', () => {
  const now = new Date(T0 + 30 * 60_000) // 19:48Z
  const iso = (ms: number) => new Date(ms).toISOString()
  const rows = [
    { email: 'a@x', opened_at: iso(T0), clicked_at: iso(T0 + 60_000), downloaded_at: null, open_count: 3, click_count: 2, download_count: 0 },
    { email: 'b@x', opened_at: iso(T0 - 3600_000), clicked_at: null, downloaded_at: iso(T0 + 20 * 60_000), open_count: 0, click_count: 0, download_count: 1 },
    { email: 'c@x', opened_at: null, clicked_at: null, downloaded_at: null },
    { email: 'old@x', opened_at: iso(T0 - 48 * 3600_000), clicked_at: null, downloaded_at: null, open_count: 1 },
  ]

  it('סופר כל סוג פעם אחת בשעה של הפעם הראשונה', () => {
    const e = buildEngagement(rows, { now })
    expect(e.byHour).toHaveLength(24)
    expect(e.byHour.at(-1)).toMatchObject({ t: '2026-11-18T19:00:00.000Z', opened: 1, clicked: 1, downloaded: 1 })
    expect(e.byHour.at(-2)).toMatchObject({ opened: 1, clicked: 0, downloaded: 0 })
    expect(e.byHour.reduce((n, h) => n + h.opened, 0)).toBe(2) // הישן מחוץ לחלון
  })

  it('רשימת אנשים: בלי מי שלא עשה כלום, מהחדש לישן, ופתיחה בלי פיקסל נספרת כ-1', () => {
    const e = buildEngagement(rows, { now })
    expect(e.people.map(p => p.email)).toEqual(['b@x', 'a@x', 'old@x'])
    expect(e.people[0]).toMatchObject({ opens: 1, downloads: 1, clicks: 0 })
    expect(e.people[1]).toMatchObject({ opens: 3, clicks: 2 })
    expect(buildEngagement(rows, { now, limit: 1 }).people).toHaveLength(1)
  })

  it('אחוז מתוך מה שנשלח', () => {
    expect(pctOfSent(25, 200)).toBe(12.5)
    expect(pctOfSent(5, 0)).toBe(0)
    expect(pctOfSent(9, 3)).toBe(100)
  })
})
