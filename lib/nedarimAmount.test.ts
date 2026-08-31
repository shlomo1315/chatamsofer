import { describe, it, expect } from 'vitest'
import { parseNedarimAmount } from './nedarimAmount'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הבאג שזה נועל: `replace(/[^d.-]/g, '')` — בלי לוכסן לפני d.
//
// המחלקה מוחקת כל תו שאינו האות d, נקודה או מקף — כלומר **את הספרות
// עצמן**. "0.21" הפך ל-".21", "600" הפך למחרוזת ריקה, והתוצאה הייתה
// NaN או 0.
//
// ⚠️ כך עמודת "כסף שחזר לארנק" נשארה ריקה ב-30 מתוך 36 פריקות —
// כולל פריקות שבוצעו היום. זה נראה כנתונים היסטוריים חסרים, בזמן
// שזה היה תו אחד חסר בקוד.
// ─────────────────────────────────────────────────────────────────────────────

describe('parseNedarimAmount — 🔴 חילוץ סכום', () => {
  it('עשרוני', () => {
    expect(parseNedarimAmount('0.21')).toBe(0.21)
    expect(parseNedarimAmount('9.94')).toBe(9.94)
  })

  it('🔴 שלם — המקרה שהחזיר 0 ומחק את הספרות', () => {
    expect(parseNedarimAmount('600')).toBe(600)
    expect(parseNedarimAmount('9')).toBe(9)
  })

  it('אפס הוא נתון ולא חוסר מידע', () => {
    expect(parseNedarimAmount('0')).toBe(0)
  })

  it('⚠️ עם סימן מטבע ורווחים', () => {
    expect(parseNedarimAmount('12.50 ₪')).toBe(12.5)
    expect(parseNedarimAmount(' 340 ')).toBe(340)
  })

  it('⚠️ ערך שלילי מוחזר בערכו המוחלט — "חזר" הוא תמיד חיובי', () => {
    expect(parseNedarimAmount('-45.5')).toBe(45.5)
  })

  it('🔴 ריק/פגום → null, ולא 0. אפס פירושו "לא חזר כלום"', () => {
    expect(parseNedarimAmount('')).toBeNull()
    expect(parseNedarimAmount(null)).toBeNull()
    expect(parseNedarimAmount(undefined)).toBeNull()
    expect(parseNedarimAmount('לא מספר')).toBeNull()
  })

  it('מספר שכבר הגיע כמספר', () => {
    expect(parseNedarimAmount(42)).toBe(42)
    expect(parseNedarimAmount(0)).toBe(0)
  })
})
