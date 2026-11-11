import { describe, it, expect } from 'vitest'
import { validateMedical, parseAidType, fileSignatureMatches, finalMessageDraft, type MedicalInput } from './medicalRequest'

const base: MedicalInput = { idNumber: '123456789', fullName: '', phone: '0501234567', email: '', address: '', city: '', amount: 500, reason: 'ניתוח' }

describe('validateMedical', () => {
  it('צאצא רשום: מספיקים ת.ז., סיבה, סכום, טלפון ומסמך רפואי', () => {
    expect(validateMedical(base, true, false, 1)).toBeNull()
  })
  it('לא צאצא: דורש שם, כתובת וצילום ת.ז.', () => {
    expect(validateMedical(base, false, false, 1)).toMatch(/שם מלא/)
    const full = { ...base, idNumber: '123456782', email: 'a@b.co', birthDate: '1980-05-01', gender: 'male', maritalStatus: 'נשואים', fullName: 'משה כהן', address: 'הרצל 1', city: 'בני ברק', referrer: 'הרב לוי' }
    expect(validateMedical(full, false, false, 1)).toMatch(/צילום תעודת זהות/)
    expect(validateMedical(full, false, true, 1)).toBeNull()
  })
  it('דורש מסמך רפואי וסכום חיובי', () => {
    expect(validateMedical(base, true, false, 0)).toMatch(/מסמך רפואי/)
    expect(validateMedical({ ...base, amount: 0 }, true, false, 1)).toMatch(/סכום/)
  })
  it('דוחה מייל וטלפון לא תקינים', () => {
    expect(validateMedical({ ...base, email: 'abc' }, true, false, 1)).toMatch(/מייל/)
    expect(validateMedical({ ...base, phone: 'abc' }, true, false, 1)).toMatch(/טלפון/)
  })
})

describe('fileSignatureMatches', () => {
  it('מזהה PDF ו-PNG, ודוחה קובץ שהסיומת שלו שקרית', () => {
    expect(fileSignatureMatches('pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0]))).toBe(true)
    expect(fileSignatureMatches('png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(true)
    expect(fileSignatureMatches('jpg', new TextEncoder().encode('<html><script>'))).toBe(false)
    expect(fileSignatureMatches('svg', new Uint8Array([0x3c]))).toBe(false)
  })
})

describe('finalMessageDraft', () => {
  it('מכין נוסח אישור עם הסכום ונוסח דחייה', () => {
    expect(finalMessageDraft('דוד', true, 1500).body).toContain('1,500')
    expect(finalMessageDraft('', false, null).subject).toMatch(/בקשתך/)
  })
})

describe('validateMedical — מחלקת סיוע', () => {
  const ext = { ...base, idNumber: '123456782', email: 'a@b.co', birthDate: '1980-05-01', gender: 'male', maritalStatus: 'נשואים', fullName: 'משה כהן', address: 'הרצל 1', city: 'בני ברק' }
  it('לא רשום באיגוד: רב או ממליץ אינו חובה', () => {
    expect(validateMedical(ext, false, true, 1)).toBeNull()
    expect(validateMedical({ ...ext, referrer: 'הרב לוי' }, false, true, 1)).toBeNull()
  })
  it('אלמנה ויתומים: מסמך רפואי אינו חובה', () => {
    expect(validateMedical({ ...base, aidType: 'widow' }, true, false, 0)).toBeNull()
    expect(validateMedical({ ...base, aidType: 'orphans' }, true, false, 0)).toBeNull()
    expect(validateMedical({ ...base, aidType: 'medical' }, true, false, 0)).toMatch(/מסמך רפואי/)
  })
  it('סוג סיוע לא מוכר חוזר לרפואי', () => {
    expect(parseAidType('x')).toBe('medical')
    expect(parseAidType('widow')).toBe('widow')
  })
})

describe('מגיש שלא רשום באיגוד: פרטים מלאים', () => {
  const base = { idNumber: '123456782', fullName: 'ישראל ישראלי', phone: '0501234567', email: 'a@b.co', address: 'הרצל 1', city: 'בני ברק', amount: 500, reason: 'סיבה', aidType: 'medical' as const, referrer: 'הרב כהן', birthDate: '1980-05-01', gender: 'male', maritalStatus: 'נשואים' }
  it('מקבל בקשה מלאה', () => expect(validateMedical(base, false, true, 1)).toBeNull())
  it('דורש מייל, תאריך לידה ומצב משפחתי; מין אינו חובה', () => {
    expect(validateMedical({ ...base, email: '' }, false, true, 1)).toBeTruthy()
    expect(validateMedical({ ...base, birthDate: '' }, false, true, 1)).toBeTruthy()
    expect(validateMedical({ ...base, gender: '' }, false, true, 1)).toBeNull()
    expect(validateMedical({ ...base, maritalStatus: '' }, false, true, 1)).toBeTruthy()
  })
  it('דוחה ת.ז. עם ספרת ביקורת שגויה ות.ז. בן זוג שגויה', () => {
    expect(validateMedical({ ...base, idNumber: '123456789' }, false, true, 1)).toBeTruthy()
    expect(validateMedical({ ...base, spouseId: '111' }, false, true, 1)).toBeTruthy()
  })
  it('רשום באיגוד לא נדרש לפרטים הנוספים (רגרסיה)', () => {
    expect(validateMedical({ ...base, email: '', birthDate: '', gender: '', maritalStatus: '', idNumber: '12345' }, true, false, 1)).toBeNull()
  })
})
