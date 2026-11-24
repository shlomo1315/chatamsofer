import { describe, it, expect } from 'vitest'
import { describeUserAgent, describeLastSeen, shortDate } from './portalSessionDisplay'

describe('describeUserAgent', () => {
  it('Chrome על Windows', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'))
      .toEqual({ label: 'Chrome · Windows', mobile: false })
  })
  it('Edge לא מזוהה בטעות כ-Chrome', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0').label)
      .toBe('Edge · Windows')
  })
  it('Safari על iPhone הוא נייד', () => {
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'))
      .toEqual({ label: 'Safari · iPhone', mobile: true })
  })
  it('Chrome על Android', () => {
    expect(describeUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'))
      .toEqual({ label: 'Chrome · Android', mobile: true })
  })
  it('בלי User-Agent', () => {
    expect(describeUserAgent(null)).toEqual({ label: 'מכשיר לא מזוהה', mobile: false })
  })
})

describe('describeLastSeen', () => {
  const now = Date.parse('2026-11-24T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()
  it('עד 5 דקות: עכשיו', () => expect(describeLastSeen(ago(2 * 60e3), now)).toEqual({ text: 'עכשיו', live: true }))
  it('דקות', () => expect(describeLastSeen(ago(40 * 60e3), now).text).toBe('לפני 40 דק׳'))
  it('שעה ושעתיים', () => {
    expect(describeLastSeen(ago(60 * 60e3), now).text).toBe('לפני שעה')
    expect(describeLastSeen(ago(2 * 3600e3), now).text).toBe('לפני שעתיים')
    expect(describeLastSeen(ago(5 * 3600e3), now).text).toBe('לפני 5 שעות')
  })
  it('אתמול וימים', () => {
    expect(describeLastSeen(ago(30 * 3600e3), now).text).toBe('אתמול')
    expect(describeLastSeen(ago(9 * 86400e3), now).text).toBe('לפני 9 ימים')
  })
})

describe('shortDate', () => {
  it('יום.חודש בשעון ישראל', () => {
    expect(shortDate('2026-11-20T23:30:00Z')).toBe('21.11')
  })
})
