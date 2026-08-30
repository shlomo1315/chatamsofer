import { describe, it, expect } from 'vitest'
import { docNameMismatch } from './docNameMismatch'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 המקרה האמיתי (משפחת חנון): קובץ בשם "אישור לידה.pdf" נשמר תחת
// "ת.ז. הבעל". השם והתווית סתרו זה את זה ואף אחד לא בדק — ובמסך היולדות
// הופיע אישור לידה במקום תעודת זהות.
//
// ⚠️ אזהרה בלבד, לא חסימה: שם קובץ אינו ראיה. "תעודות זהות חנון.pdf" הוא
// קובץ אחד שמכיל את כל התעודות, והוא לגיטימי תחת כל אחת מהתוויות.
// חסימה הייתה עוצרת העלאות תקינות.
// ─────────────────────────────────────────────────────────────────────────────

describe('docNameMismatch — סתירה מובהקת', () => {
  it('🔴 "אישור לידה" תחת ת.ז. הבעל — מתריע', () => {
    expect(docNameMismatch('אישור לידה.pdf', 'id_husband')).toBeTruthy()
  })

  it('"אישור לידה" תחת ת.ז. האישה — מתריע', () => {
    expect(docNameMismatch('אישור לידה.pdf', 'id_wife')).toBeTruthy()
  })

  it('תעודת זהות תחת אישור לידה — מתריע', () => {
    expect(docNameMismatch('תעודת זהות.pdf', 'birth_cert')).toBeTruthy()
  })

  it('ההודעה מזכירה את התווית שנבחרה', () => {
    expect(docNameMismatch('אישור לידה.pdf', 'id_husband')).toContain('ת.ז. הבעל')
  })
})

describe('docNameMismatch — לא מתריע לשווא', () => {
  it('שם תואם', () => {
    expect(docNameMismatch('תעודת זהות.pdf', 'id_husband')).toBeNull()
  })

  it('⚠️ קובץ מאוחד "תעודות זהות" תקין תחת כל תווית ת.ז.', () => {
    expect(docNameMismatch('תעודות זהות חנון.pdf', 'id_husband')).toBeNull()
    expect(docNameMismatch('תעודות זהות חנון.pdf', 'id_wife_appx')).toBeNull()
  })

  it('אישור לידה תחת אישור לידה', () => {
    expect(docNameMismatch('אישור לידה.pdf', 'birth_cert')).toBeNull()
  })

  it('שם גנרי מהסלולר אינו מעורר אזהרה', () => {
    expect(docNameMismatch('IMG_20260830.jpg', 'id_husband')).toBeNull()
    expect(docNameMismatch('scan001.pdf', 'birth_cert')).toBeNull()
    expect(docNameMismatch('document.pdf', 'id_wife')).toBeNull()
  })

  it('"מסמך אחר" לעולם אינו סותר', () => {
    expect(docNameMismatch('אישור לידה.pdf', 'other')).toBeNull()
  })

  it('שם ריק אינו מעורר אזהרה', () => {
    expect(docNameMismatch('', 'id_husband')).toBeNull()
    expect(docNameMismatch(null, 'id_husband')).toBeNull()
  })

  it('ספח תחת ספח', () => {
    expect(docNameMismatch('ספח תעודת זהות.pdf', 'id_husband_appx')).toBeNull()
  })
})
