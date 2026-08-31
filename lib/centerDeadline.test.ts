import { describe, it, expect } from 'vitest'
import { deadlineState, formatCountdown, toLocalInput } from './centerDeadline'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מועד אחרון לבחירת מוקד.
//
// המשפחה צריכה לדעת כמה זמן נשאר — גם בטלפון וגם באתר. בלי זה היא
// דוחה את הבחירה ומגלה שנסגר.
//
// ⚠️ המועד אינו מחליף את centers_open אלא מתווסף לו: מתג סגור גובר
// תמיד. כך אפשר לסגור מיידית בלי לגעת בתאריך.
// ─────────────────────────────────────────────────────────────────────────────

const AT = (s: string) => new Date(s)

describe('deadlineState — 🔴 מתי סגור', () => {
  it('אין מועד → פתוח, בלי ספירה', () => {
    const s = deadlineState(null, AT('2026-09-01T10:00:00Z'))
    expect(s.closed).toBe(false)
    expect(s.msLeft).toBeNull()
  })

  it('המועד בעתיד → פתוח עם ספירה', () => {
    const s = deadlineState('2026-09-02T10:00:00Z', AT('2026-09-01T10:00:00Z'))
    expect(s.closed).toBe(false)
    expect(s.msLeft).toBe(24 * 60 * 60 * 1000)
  })

  it('🔴 המועד חלף → סגור', () => {
    const s = deadlineState('2026-09-01T09:59:00Z', AT('2026-09-01T10:00:00Z'))
    expect(s.closed).toBe(true)
  })

  it('⚠️ בדיוק ברגע המועד → סגור. גבול חייב להיות חד-משמעי', () => {
    const s = deadlineState('2026-09-01T10:00:00Z', AT('2026-09-01T10:00:00Z'))
    expect(s.closed).toBe(true)
  })

  it('⚠️ תאריך פגום אינו סוגר — לא נועלים משפחות בגלל הקלדה', () => {
    expect(deadlineState('לא-תאריך', AT('2026-09-01T10:00:00Z')).closed).toBe(false)
    expect(deadlineState('', AT('2026-09-01T10:00:00Z')).closed).toBe(false)
  })
})

describe('formatCountdown — הניסוח', () => {
  it('ימים ושעות', () => {
    expect(formatCountdown(2 * 86400000 + 3 * 3600000)).toBe('יומיים ו-3 שעות')
  })

  it('יום אחד', () => {
    expect(formatCountdown(86400000 + 3600000)).toBe('יום אחד ושעה אחת')
  })

  it('שעות ודקות בלבד', () => {
    expect(formatCountdown(3 * 3600000 + 25 * 60000)).toBe('3 שעות ו-25 דקות')
  })

  it('⚠️ פחות משעה — דקות בלבד, בלי "0 שעות"', () => {
    expect(formatCountdown(40 * 60000)).toBe('40 דקות')
  })

  it('דקה אחת', () => {
    expect(formatCountdown(60000)).toBe('דקה אחת')
  })

  it('🔴 אפס ומטה → ריק. הקורא מציג "נסגר" ולא ספירה שלילית', () => {
    expect(formatCountdown(0)).toBe('')
    expect(formatCountdown(-5000)).toBe('')
  })
})

describe('toLocalInput — 🔴 המרה לשדה התאריך', () => {
  it('ריק/פגום → ריק, ולא "Invalid Date"', () => {
    expect(toLocalInput(null)).toBe('')
    expect(toLocalInput('')).toBe('')
    expect(toLocalInput('לא-תאריך')).toBe('')
  })

  it('🔴 מחזיר שעון מקומי ולא UTC — הלוך ושוב חייב לשמר את הרגע', () => {
    // ⚠️ הבדיקה אינה תלויה באזור זמן: היא מוודאת שהמרה הלוך-ושוב
    // מחזירה את אותו רגע. השוואה למחרוזת קבועה הייתה נכשלת בכל
    // מכונה שאינה בשעון ישראל.
    const at = new Date('2026-11-20T18:30:00Z')
    const back = new Date(toLocalInput(at.toISOString()))
    expect(back.getTime()).toBe(at.getTime())
  })

  it('הצורה היא YYYY-MM-DDTHH:mm בלבד', () => {
    expect(toLocalInput('2026-11-20T18:30:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})
