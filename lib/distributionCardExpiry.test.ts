import { describe, it, expect } from 'vitest'
import { normalizeCardExpiry } from './distributionCardExpiry'
import { toNedarimExpiry } from './holidayCardLoad'

// ─────────────────────────────────────────────────────────────────────────────
// ולידציית תוקף הכרטיס בשמירת החלוקה.
//
// 🔴 הערך הזה הופך בהמשך ל-dd/MM/yyyy ונשלח לנדרים על כרטיסים אמיתיים
// (toNedarimExpiry). תאריך פגום שנשמר במסד מתגלה רק ברגע הטעינה — מול
// מאות משפחות בבת אחת. לכן הוא נבלם כאן, בשמירה.
//
// ⚠️ ההבחנה המהותית: ריק → null (הטענה ללא תוקף, התנהגות היסטורית תקינה),
// אבל פגום → שגיאה. שניהם "אין תאריך", ורק אחד מהם כוונה של המשתמש.
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeCardExpiry — ריק מותר', () => {
  it('ריק/null/undefined → null בלי שגיאה', () => {
    expect(normalizeCardExpiry(null)).toEqual({ ok: true, value: null })
    expect(normalizeCardExpiry(undefined)).toEqual({ ok: true, value: null })
    expect(normalizeCardExpiry('')).toEqual({ ok: true, value: null })
    expect(normalizeCardExpiry('   ')).toEqual({ ok: true, value: null })
  })
})

describe('normalizeCardExpiry — תאריך תקין', () => {
  it('ISO קצר נשמר כמות שהוא', () => {
    expect(normalizeCardExpiry('2026-11-20')).toEqual({ ok: true, value: '2026-11-20' })
  })

  it('חותמת זמן מלאה נגזרת ליום בלבד', () => {
    // העמודה היא date — שמירת שעה הייתה מזיזה את היום בגבול חצות.
    expect(normalizeCardExpiry('2026-11-20T00:00:00.000Z')).toEqual({ ok: true, value: '2026-11-20' })
  })

  it('שומר אפסים מובילים', () => {
    expect(normalizeCardExpiry('2026-01-05')).toEqual({ ok: true, value: '2026-01-05' })
  })
})

describe('normalizeCardExpiry — 🔴 פגום נבלם', () => {
  it('מחרוזת שאינה תאריך', () => {
    expect(normalizeCardExpiry('לא-תאריך').ok).toBe(false)
  })

  it('⚠️ תאריך שמתגלגל — 2026-13-45 נבלע ע"י Date במקום להיפסל', () => {
    expect(normalizeCardExpiry('2026-13-45').ok).toBe(false)
  })

  it('⚠️ 31 בפברואר מתגלגל למרץ — נפסל', () => {
    expect(normalizeCardExpiry('2026-02-31').ok).toBe(false)
  })

  it('פורמט dd/MM/yyyy נפסל — הוא פורמט היעד, לא פורמט הקלט', () => {
    expect(normalizeCardExpiry('20/11/2026').ok).toBe(false)
  })
})

describe('normalizeCardExpiry — התוצאה עוברת נכון ל-nedarim', () => {
  // ⚠️ import רגיל ולא דינמי: await import() בתוך הטסט טען את שרשרת
  // המודולים של נדרים בזמן הריצה, לקח כ-7 שניות תחת עומס, וחצה את
  // ה-timeout — כשל שנראה כרגרסיה אקראית ואינו קשור לנבדק עצמו.
  it('מה שנשמר כאן הוא בדיוק מה ש-toNedarimExpiry יודע להמיר', () => {
    const r = normalizeCardExpiry('2026-11-20')
    expect(r.ok && toNedarimExpiry(r.value)).toBe('20/11/2026')
  })
})
