import { describe, it, expect } from 'vitest'
import { sanitizeReturnTo, returnLabel, sinceWords, ringOffset, isLowCountdown, RING_LENGTH } from './returnTo'

describe('sanitizeReturnTo', () => {
  it('מקבל נתיבי admin פנימיים', () => {
    expect(sanitizeReturnTo('/admin/maternity')).toBe('/admin/maternity')
    expect(sanitizeReturnTo('/admin/maternity?tab=cards')).toBe('/admin/maternity?tab=cards')
  })
  it('דוחה open redirect ונתיבים מחוץ ל-admin', () => {
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', '/%09/evil.com', '/admin/ x', '/login', '/administrator', '', null, undefined]) {
      expect(sanitizeReturnTo(bad as string)).toBeNull()
    }
  })
})

describe('תוויות וזמנים', () => {
  it('שם הדף', () => {
    expect(returnLabel('/admin/maternity/12')).toBe('כרטסת לידה')
    expect(returnLabel('/admin/unknown')).toBe('הדף שבו עצרת')
    expect(returnLabel(null)).toBe('לוח הבקרה')
  })
  it('נותקת לפני X', () => {
    expect(sinceWords(1)).toBe('לפני שנייה')
    expect(sinceWords(3)).toBe('לפני 3 שניות')
    expect(sinceWords(60)).toBe('לפני דקה')
    expect(sinceWords(300)).toBe('לפני 5 דקות')
  })
})

describe('מונה הטבעת', () => {
  it('מתרוקן ומאדים ב-20 האחרונות', () => {
    expect(ringOffset(120, 120)).toBe(0)
    expect(ringOffset(0, 120)).toBeCloseTo(RING_LENGTH)
    expect(ringOffset(60, 120)).toBeCloseTo(RING_LENGTH / 2)
    expect(isLowCountdown(21)).toBe(false)
    expect(isLowCountdown(20)).toBe(true)
  })
})
