import { describe, it, expect } from 'vitest'
import { stripUnfilledPlaceholders, hasUnfilledPlaceholder } from './yemotPlaceholders'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 המשפחות שמעו את שם המשתנה.
//
// ⚠️ מה שקרה בפועל, מלוגי הפרודקשן של 10.09:
//   id_list_message=t-הכרטיס שלכם מוכן לאיסוף במוקד {center} שימו לב...
// הנוסח מכיל {center}, הקוד קרא לו בלי ערך (שם המוקד נאמר בטוקן הבא),
// וימות הקריאה את הסוגריים כפשוטן — בשיחה שכל מטרתה לומר לאן ללכת.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 stripUnfilledPlaceholders', () => {
  it('🔴 {center} שלא הוחלף — אינו מוקרא', () => {
    const t = stripUnfilledPlaceholders('הכרטיס שלכם מוכן לאיסוף במוקד {center}. שימו לב')
    expect(t).not.toContain('{')
    expect(t).not.toContain('center')
  })

  it('🔴 המשפט נשאר קריא — לא נדבקות מילים', () => {
    // ⚠️ החלפה למחרוזת ריקה הייתה יוצרת "במוקד. שימו" בלי הפסקה,
    // ובמקרים אחרים מדביקה שתי מילים למילה אחת בלתי מובנת.
    const t = stripUnfilledPlaceholders('במוקד{center}שימו לב')
    expect(t).toBe('במוקד שימו לב')
  })

  it('ערך שכן הוחלף אינו נפגע', () => {
    // ההחלפה רצה לפני הניקוי, ולכן טקסט מוחלף עובר כמות שהוא.
    const filled = 'שלום וברכה המערכת זיהתה אתכם בשם גליק ישראל אריה'
    expect(stripUnfilledPlaceholders(filled)).toBe(filled)
  })

  it('כמה שדות בבת אחת', () => {
    expect(stripUnfilledPlaceholders('{a} ו{b}')).not.toMatch(/\{|\}/)
  })

  it('טקסט בלי שדות — ללא שינוי', () => {
    expect(stripUnfilledPlaceholders('הכרטיס מוכן')).toBe('הכרטיס מוכן')
  })

  it('ריק/undefined אינם מפילים', () => {
    expect(stripUnfilledPlaceholders('')).toBe('')
    expect(stripUnfilledPlaceholders(undefined as unknown as string)).toBe('')
  })

  it('⚠️ סוגריים בעברית אינם שדה — לא נמחקים', () => {
    // רק אותיות לועזיות/ספרות/קו תחתון הן שם שדה. טקסט עברי בסוגריים
    // הוא תוכן שהמנהל כתב, ומחיקתו הייתה משנה את ההודעה.
    const t = stripUnfilledPlaceholders('שימו לב {שים לב} להודעה')
    expect(t).toContain('שים לב')
  })
})

describe('hasUnfilledPlaceholder', () => {
  it('מזהה שדה שנותר', () => {
    expect(hasUnfilledPlaceholder('במוקד {center}')).toBe(true)
  })

  it('טקסט נקי', () => {
    expect(hasUnfilledPlaceholder('במוקד בני ברק')).toBe(false)
  })

  it('🔴 קריאות חוזרות מחזירות אותה תשובה', () => {
    // ⚠️ ביטוי עם דגל g שומר lastIndex בין קריאות ל-test, ולכן אותו קלט
    // היה מחזיר true ואז false לסירוגין — באג שמופיע רק בקריאה השנייה.
    const s = 'במוקד {center}'
    expect(hasUnfilledPlaceholder(s)).toBe(true)
    expect(hasUnfilledPlaceholder(s)).toBe(true)
    expect(hasUnfilledPlaceholder(s)).toBe(true)
  })
})
