import { describe, it, expect } from 'vitest'
import { normalizeDateToISO, isValidDateInput, validateIsraeliId, formatIsraeliId } from './validation'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ הרקע: תאריך לידה של ילד נשמר כ-"210726" והוצג בכרטסת כ-01/01/210726.
// השורש: normalizeDateToISO מכיר 4 פורמטים; 6 ספרות רצופות אינו אחד מהם, ולכן
// הערך עבר כמו שהוא ל-JSON של children (בניגוד לעמודת date, שהייתה מפילה את
// ה-INSERT ברעש עם 22008). ערך פגום ב-JSON נכנס בשקט ומתגלה רק בעין.
// הפונקציה הזו קשורה לשני באגי פרודקשן ולא היה לה ולו טסט אחד.
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeDateToISO', () => {
  it('משאיר ISO תקין כפי שהוא', () => {
    expect(normalizeDateToISO('2026-07-21')).toBe('2026-07-21')
  })

  it('ממיר DDMMYYYY (הפורמט של נדרים)', () => {
    expect(normalizeDateToISO('21072026')).toBe('2026-07-21')
    expect(normalizeDateToISO('04102006')).toBe('2006-10-04')
  })

  it('ממיר תאריך עם מפרידים', () => {
    expect(normalizeDateToISO('21/07/2026')).toBe('2026-07-21')
    expect(normalizeDateToISO('21.7.2026')).toBe('2026-07-21')
    expect(normalizeDateToISO('1-1-2026')).toBe('2026-01-01')
  })

  it('ממיר YYYY/MM/DD', () => {
    expect(normalizeDateToISO('2026/07/21')).toBe('2026-07-21')
  })

  it('מחזיר null על ערך ריק', () => {
    expect(normalizeDateToISO('')).toBeNull()
    expect(normalizeDateToISO(null)).toBeNull()
    expect(normalizeDateToISO(undefined)).toBeNull()
    expect(normalizeDateToISO('   ')).toBeNull()
  })

  // ⚠️ התיעוד של ההתנהגות הקיימת: ערך לא מזוהה מוחזר כפי שהוא, במכוון —
  // כדי לא להסתיר נתון פגום. זו הסיבה שנדרשת isValidDateInput בנפרד.
  it('מחזיר ערך לא-מזוהה כפי שהוא (ולכן צריך אימות נפרד)', () => {
    expect(normalizeDateToISO('210726')).toBe('210726')
    expect(normalizeDateToISO('21/7/26')).toBe('21/7/26')
    expect(normalizeDateToISO('בלגן')).toBe('בלגן')
  })
})

describe('isValidDateInput', () => {
  it('מקבל ערך ריק — תאריך אינו תמיד חובה', () => {
    expect(isValidDateInput('')).toBe(true)
    expect(isValidDateInput(null)).toBe(true)
    expect(isValidDateInput(undefined)).toBe(true)
  })

  it('מקבל את כל הפורמטים ש-normalizeDateToISO יודע להמיר', () => {
    expect(isValidDateInput('2026-07-21')).toBe(true)
    expect(isValidDateInput('21072026')).toBe(true)
    expect(isValidDateInput('21/07/2026')).toBe(true)
    expect(isValidDateInput('2026/07/21')).toBe(true)
  })

  // 🔴 המקרה שהתגלה בפרודקשן
  it('דוחה 6 ספרות — המקרה שיצר 01/01/210726', () => {
    expect(isValidDateInput('210726')).toBe(false)
  })

  it('דוחה שנה דו-ספרתית עם מפרידים', () => {
    expect(isValidDateInput('21/7/26')).toBe(false)
    expect(isValidDateInput('1/1/26')).toBe(false)
  })

  it('דוחה מלל חופשי', () => {
    expect(isValidDateInput('בלגן')).toBe(false)
    expect(isValidDateInput('לא ידוע')).toBe(false)
  })

  // ⚠️ תאריך שנכון תחבירית אך חסר פשר — 31 בפברואר, חודש 13. הפורמט תואם
  // את התבנית ולכן normalizeDateToISO היה מחזיר מחרוזת "תקינה" למראית עין.
  it('דוחה תאריך שאינו קיים בלוח השנה', () => {
    expect(isValidDateInput('31022026')).toBe(false)
    expect(isValidDateInput('2026-13-01')).toBe(false)
    expect(isValidDateInput('2026-02-30')).toBe(false)
  })

  it('דוחה שנה מחוץ לטווח סביר', () => {
    expect(isValidDateInput('0001-01-01')).toBe(false)
    expect(isValidDateInput('3000-01-01')).toBe(false)
  })

  it('מקבל תאריכי לידה אמיתיים בקצוות הטווח', () => {
    expect(isValidDateInput('1910-03-15')).toBe(true)
    expect(isValidDateInput('2026-08-11')).toBe(true)
  })
})

describe('validateIsraeliId', () => {
  it('מקבל ת"ז תקינה', () => {
    expect(validateIsraeliId('327517538')).toBe(true)
  })

  it('דוחה ת"ז של אפסים בלבד', () => {
    expect(validateIsraeliId('000000000')).toBe(false)
  })

  it('דוחה ספרת ביקורת שגויה', () => {
    expect(validateIsraeliId('123456789')).toBe(false)
  })
})

describe('formatIsraeliId', () => {
  it('משלים אפסים מובילים ל-9 ספרות', () => {
    expect(formatIsraeliId('1486819')).toBe('001486819')
  })

  it('משאיר דרכון כפי שהוא', () => {
    expect(formatIsraeliId('AB123456')).toBe('AB123456')
  })
})
