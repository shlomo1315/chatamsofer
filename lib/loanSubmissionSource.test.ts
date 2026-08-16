import { describe, it, expect } from 'vitest'
import { normalizeLoanSource, loanSourceLabel, LOAN_SOURCES } from './loanSubmissionSource'

// ─────────────────────────────────────────────────────────────────────────────
// מקור ההגשה נשמר כדי לענות על שאלה תפעולית: כמה בקשות מגיעות דרך האתר
// וכמה דרך המייל. שני המסלולים אינם שקולים — במייל הפונה ממלא את טופס
// אישור הרב ביד, ובאתר הוא מגיע מלא מהמערכת — ולכן הפילוח קובע היכן
// כדאי להשקיע.
//
// ⚠️ נורמליזציה ולא אמון בקלט: הערך מגיע מגוף הבקשה, וערך לא מוכר חייב
// ליפול לברירת מחדל ידועה במקום להיכתב כפי שהוא ולזהם את הפילוח.
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeLoanSource', () => {
  it('מקבל את שני המסלולים המוכרים', () => {
    expect(normalizeLoanSource('portal')).toBe('portal')
    expect(normalizeLoanSource('email')).toBe('email')
  })

  it('ערך לא מוכר נופל ל-portal ולא נכתב כפי שהוא', () => {
    expect(normalizeLoanSource('whatsapp')).toBe('portal')
    expect(normalizeLoanSource('')).toBe('portal')
    expect(normalizeLoanSource(undefined)).toBe('portal')
    expect(normalizeLoanSource(null)).toBe('portal')
    expect(normalizeLoanSource(42)).toBe('portal')
  })

  it('עמיד לרווחים ולאותיות גדולות', () => {
    expect(normalizeLoanSource('  EMAIL ')).toBe('email')
    expect(normalizeLoanSource('Portal')).toBe('portal')
  })

  it('לכל מקור יש תווית בעברית — אחרת הכרטסת תציג מפתח באנגלית', () => {
    for (const s of LOAN_SOURCES) {
      expect(loanSourceLabel(s)).toBeTruthy()
      expect(loanSourceLabel(s)).not.toBe(s)
    }
  })

  it('תווית למקור חסר — בקשות שקדמו לשדה', () => {
    // ⚠️ בקשות ישנות אין להן submission_source. התווית חייבת להיות
    // מובנת ולא ריקה, אחרת הכרטסת נראית שבורה.
    expect(loanSourceLabel(null)).toBeTruthy()
    expect(loanSourceLabel(undefined)).toBeTruthy()
  })
})
