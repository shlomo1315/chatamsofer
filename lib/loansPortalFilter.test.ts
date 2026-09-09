import { describe, it, expect } from 'vitest'
import { matchesLoanStage, LOAN_STAGES, type LoanStage } from './loansPortalFilter'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 שלבי ההלוואה בפורטל הביצוע — מי כבר קיבל שטר, ומי כבר בוצע.
//
// ⚠️ עד כה היו שני מצבים בלבד: "ממתינות לביצוע" ו"בוצעו". שלב הביניים —
// השטר נשלח לחתימה אך ההלוואה טרם הופקדה — נבלע ב"ממתינות", ולכן אי אפשר
// היה לדעת למי כבר נשלח שטר ולמי עוד לא. הגורם המבצע חזר ושלח שטרות
// לאותם אנשים, או דילג על מי שממתין לחתימה כבר שבוע.
//
// 🔴 הסדר הוא סדר החיים של ההלוואה: טרם נשלח → נשלח שטר → בוצעה.
// ⚠️ disbursed_at גובר תמיד: הלוואה שבוצעה היא "בוצעה" גם אם יש לה
// note_sent_at, אחרת היא הייתה נספרת פעמיים.
// ─────────────────────────────────────────────────────────────────────────────

const L = (o: { note_sent_at?: string | null; disbursed_at?: string | null }) => ({
  note_sent_at: o.note_sent_at ?? null,
  disbursed_at: o.disbursed_at ?? null,
})

describe('🔴 matchesLoanStage — שלבי ההלוואה', () => {
  const fresh = L({})
  const noteSent = L({ note_sent_at: '2026-09-01' })
  const disbursed = L({ note_sent_at: '2026-09-01', disbursed_at: '2026-09-05' })

  it('"הכל" מחזיר את כולן', () => {
    for (const l of [fresh, noteSent, disbursed]) {
      expect(matchesLoanStage(l, 'all')).toBe(true)
    }
  })

  it('טרם נשלח שטר — רק מי שאין לו כלום', () => {
    expect(matchesLoanStage(fresh, 'no_note')).toBe(true)
    expect(matchesLoanStage(noteSent, 'no_note')).toBe(false)
    expect(matchesLoanStage(disbursed, 'no_note')).toBe(false)
  })

  it('נשלח שטר וטרם בוצע — שלב הביניים בלבד', () => {
    expect(matchesLoanStage(noteSent, 'note_sent')).toBe(true)
    expect(matchesLoanStage(fresh, 'note_sent')).toBe(false)
    // 🔴 בוצעה אינה "ממתינה לחתימה" — אחרת היא נספרת בשני מקומות.
    expect(matchesLoanStage(disbursed, 'note_sent')).toBe(false)
  })

  it('בוצעו — לפי disbursed_at בלבד', () => {
    expect(matchesLoanStage(disbursed, 'done')).toBe(true)
    expect(matchesLoanStage(noteSent, 'done')).toBe(false)
    expect(matchesLoanStage(fresh, 'done')).toBe(false)
  })

  it('ממתינות לביצוע — כל מי שטרם בוצעה, עם שטר או בלי', () => {
    expect(matchesLoanStage(fresh, 'pending')).toBe(true)
    expect(matchesLoanStage(noteSent, 'pending')).toBe(true)
    expect(matchesLoanStage(disbursed, 'pending')).toBe(false)
  })

  // ⚠️ מחרוזת ריקה אינה תאריך: היא הגיעה מהמסד כערך ריק ולא כ-null,
  // והיא הייתה נספרת כ"נשלח שטר".
  it('🔴 מחרוזת ריקה נחשבת כלא-נשלח', () => {
    expect(matchesLoanStage(L({ note_sent_at: '' }), 'no_note')).toBe(true)
    expect(matchesLoanStage(L({ disbursed_at: '  ' }), 'pending')).toBe(true)
  })

  it('כל שלב מוגדר עם תווית', () => {
    for (const s of LOAN_STAGES) {
      expect(s.label.trim().length).toBeGreaterThan(0)
    }
    const keys = LOAN_STAGES.map(s => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('כל שלב ידוע מוחזר ע"י הפונקציה בלי לזרוק', () => {
    for (const s of LOAN_STAGES) {
      expect(() => matchesLoanStage(fresh, s.key as LoanStage)).not.toThrow()
    }
  })
})
