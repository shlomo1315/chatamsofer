import { describe, it, expect } from 'vitest'
import { scrambleBytes, DOC_CIPHER_ID } from './docCipher'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ערוץ הנתונים של התצוגה המקדימה לשובר החגים.
//
// נטפרי חוסמת לפי *סוג התוכן*: תגובת application/pdf נחסמת, והתצוגה
// המקדימה — הכלי היחיד לבדוק את השובר לפני שליחה לאלפי משפחות — לא עבדה
// אצל מי שגולש דרך הסינון.
//
// ⚠️ הערבול אינו קישוט: בלי לערבל, ה-base64 פותח ב-"JVBERi" (חתימת PDF)
// והמסנן מזהה אותה גם בתוך JSON. הטסטים כאן נועלים את שתי התכונות
// שהתיקון נשען עליהן — הפיכוּת, ושהחתימה אינה חשופה.
// ─────────────────────────────────────────────────────────────────────────────

/** תחילת קובץ PDF אמיתי — "%PDF-1.7". */
const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

const toBase64 = (b: Uint8Array) => Buffer.from(b).toString('base64')

describe('ערבול השובר — הפיכוּת', () => {
  it('🔴 ערבול פעמיים מחזיר את המקור — כך הדפדפן משחזר את ה-PDF', () => {
    const original = Uint8Array.from(PDF_HEAD)
    const round = Uint8Array.from(PDF_HEAD)
    scrambleBytes(round)
    scrambleBytes(round)
    expect([...round]).toEqual([...original])
  })

  it('הערבול אכן משנה את הבתים', () => {
    const scrambled = Uint8Array.from(PDF_HEAD)
    scrambleBytes(scrambled)
    expect([...scrambled]).not.toEqual([...PDF_HEAD])
  })
})

describe('ערבול השובר — 🔴 חתימת ה-PDF אינה חשופה', () => {
  it('base64 של מטען לא מעורבל *כן* נושא את "JVBERi" — זו הבעיה', () => {
    expect(toBase64(PDF_HEAD).startsWith('JVBERi')).toBe(true)
  })

  it('🔴 ואחרי ערבול — לא. זה מה שמעביר אותו דרך הסינון', () => {
    const scrambled = Uint8Array.from(PDF_HEAD)
    scrambleBytes(scrambled)
    expect(toBase64(scrambled).startsWith('JVBERi')).toBe(false)
  })
})

describe('מזהה הערבול', () => {
  it('⚠️ קיים ויציב — הלקוח מפענח רק כשהוא מסומן, כדי שתגובה ישנה מהמטמון לא תיהרס', () => {
    expect(DOC_CIPHER_ID).toBeTruthy()
    expect(typeof DOC_CIPHER_ID).toBe('string')
  })
})
