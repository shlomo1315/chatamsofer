import { describe, it, expect } from 'vitest'
import { isGilyonotPullDue } from './gilyonotPullSchedule'

describe('תזמון משיכת הגיליונות', () => {
  it('בחורף 02:30 בישראל (00:30 UTC) הגיע הזמן', () => {
    expect(isGilyonotPullDue(new Date('2026-12-10T00:30:00Z'), '')).toEqual({ due: true, date: '2026-12-10' })
  })
  it('בקיץ 02:30 בישראל (23:30 UTC בערב הקודם) הגיע הזמן', () => {
    expect(isGilyonotPullDue(new Date('2026-07-09T23:30:00Z'), '')).toEqual({ due: true, date: '2026-07-10' })
  })
  it('לא משכנו כבר היום: לא רץ שוב', () => {
    expect(isGilyonotPullDue(new Date('2026-12-10T00:45:00Z'), '2026-12-10').due).toBe(false)
  })
  it('שעה אחרת: לא רץ', () => {
    expect(isGilyonotPullDue(new Date('2026-12-10T09:00:00Z'), '').due).toBe(false)
    expect(isGilyonotPullDue(new Date('2026-12-09T23:30:00Z'), '').due).toBe(false) // 01:30 בישראל
  })
})
