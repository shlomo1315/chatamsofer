import { describe, it, expect } from 'vitest'
import { isPassportId, normalizeZeout } from './nedarim'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ נדרים דוחה דרכון בשדה Zeout ("מספר זהות שגוי. נא לרשום מספר בספרות
// בלבד"), ואז הכרטיס כלל אינו מוקם — היולדת נשארת בלי כרטיס מזון בלי
// שאיש שם לב. הבדיקות כאן נועלות את ההבחנה שמנתבת דרכון למזהה ג'.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 isPassportId — מה מנותב למזהה ג', () => {
  it('דרכונים אמיתיים מהייצור מזוהים', () => {
    // אלה הערכים שנכשלו בפועל בלוגים.
    for (const p of ['GB4293702', 'A26430851', 'A58788030', 'A34801288']) {
      expect(isPassportId({ id_number: p })).toBe(true)
    }
  })

  it('🔴 ת"ז ישראלית אינה מנותבת למזהה ג', () => {
    // ניתוב שגוי היה מקים משפחה בלי Zeout, וכל חיפוש עתידי היה נכשל
    // ומקים אותה שוב.
    expect(isPassportId({ id_number: '123456789' })).toBe(false)
    expect(isPassportId({ id_number: '012345678' })).toBe(false)
  })

  it('id_type מפורש גובר', () => {
    expect(isPassportId({ id_number: '123456789', id_type: 'passport' })).toBe(true)
    expect(isPassportId({ id_number: 'AB1234', id_type: 'id' })).toBe(true)   // התוכן עדיין מכריע
  })

  it('🔴 ת"ז עם מקפים או רווחים אינה דרכון', () => {
    // פורמט תצוגה נפוץ. סיווגו כדרכון היה מוציא ת"ז תקינה מ-Zeout.
    expect(isPassportId({ id_number: '123-456-789' })).toBe(false)
    expect(isPassportId({ id_number: '123 456 789' })).toBe(false)
  })

  it('ריק אינו דרכון', () => {
    expect(isPassportId({ id_number: '' })).toBe(false)
    expect(isPassportId({ id_number: null })).toBe(false)
    expect(isPassportId({})).toBe(false)
  })
})

describe('normalizeZeout — דרכון אינו מרופד באפסים', () => {
  it('ת"ז מרופדת ל-9', () => {
    expect(normalizeZeout('12345678')).toBe('012345678')
  })

  it('🔴 דרכון נשמר כמות שהוא', () => {
    // ריפוד היה חותך "GB4293702" והופך אותו למספר שעלול להתאים בטעות
    // לת"ז אמיתית של משפחה אחרת.
    expect(normalizeZeout('GB4293702')).toBe('GB4293702')
    expect(normalizeZeout('a26430851')).toBe('A26430851')
  })

  it('מקפים ורווחים מוסרים משניהם', () => {
    expect(normalizeZeout('GB-429 3702')).toBe('GB4293702')
    expect(normalizeZeout('123-456-789')).toBe('123456789')
  })
})

describe('בחירת המזהה כששתי הרשומות מלאות', () => {
  // הלוגיקה מ-maternityCards: מעדיפים ת"ז ישראלית, ורק בהיעדרה דרכון.
  const pick = (a: string | null, b: string | null) => {
    const c = [a, b].filter(Boolean).map(String)
    return c.find(v => !isPassportId({ id_number: v })) ?? c[0] ?? null
  }

  it('🔴 ת"ז מנצחת דרכון', () => {
    // נדרים מחפש בעיקר לפי Zeout; משפחה שהוקמה על דרכון בלבד קשה לאיתור.
    expect(pick('GB4293702', '123456789')).toBe('123456789')
    expect(pick('123456789', 'GB4293702')).toBe('123456789')
  })

  it('שני דרכונים — נשלח הראשון', () => {
    expect(pick('GB4293702', 'A26430851')).toBe('GB4293702')
  })

  it('רק אחד קיים', () => {
    expect(pick(null, 'GB4293702')).toBe('GB4293702')
    expect(pick('123456789', null)).toBe('123456789')
  })

  it('אין אף אחד', () => {
    expect(pick(null, null)).toBeNull()
  })
})
