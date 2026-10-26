import { describe, it, expect } from 'vitest'
import { tlushRemaining, DUPLICATE_LOADS } from './duplicateLoadCancel'
import { parseNedarimAmount } from '@/lib/nedarim'

// מבנה אמיתי של GetClientCard (בלי פרטים אישיים)
const card = {
  Result: 'OK', TotalFreeAmount: '736.49 ₪',
  Tlushim: [
    { TlushId: '4341269', Amount: '600', FreeAmount: '600 ₪' },
    { TlushId: '4341268', Amount: '600', FreeAmount: '136.49 ₪' },
    { TlushId: '4269452', Amount: '600', FreeAmount: '0 ₪' },
  ],
}

describe('ביטול טעינה עודפת', () => {
  it('מפענח סכום עם סימן שקל', () => {
    expect(parseNedarimAmount('736.49 ₪')).toBe(736.49)
    expect(parseNedarimAmount('0 ₪')).toBe(0)
    expect(parseNedarimAmount('1,200 ₪')).toBe(1200)
    expect(parseNedarimAmount(null)).toBeNull()
    expect(parseNedarimAmount(5)).toBe(5)
  })
  it('היתרה נקראת לפי מזהה ה-tlush, לא מהכרטיס כולו', () => {
    expect(tlushRemaining(card, '4341268')).toBe(136.49)
    expect(tlushRemaining(card, '4341269')).toBe(600)
    expect(tlushRemaining(card, '4269452')).toBe(0)
    expect(tlushRemaining(card, '999')).toBeNull()
  })
  it('tlush יחיד שחוזר כאובייקט ולא כמערך', () => {
    expect(tlushRemaining({ Tlushim: { TlushId: '7', FreeAmount: '50 ₪' } }, '7')).toBe(50)
  })
  it('שמונה תיקים, והעודף שונה מהנשמר', () => {
    expect(DUPLICATE_LOADS).toHaveLength(8)
    for (const d of DUPLICATE_LOADS) expect(d.excess).not.toBe(d.kept)
  })
})
