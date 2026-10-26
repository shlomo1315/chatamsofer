import { describe, it, expect } from 'vitest'
import { validateMedical, fileSignatureMatches, finalMessageDraft, type MedicalInput } from './medicalRequest'

const base: MedicalInput = { idNumber: '123456789', fullName: '', phone: '0501234567', email: '', address: '', city: '', amount: 500, reason: 'ניתוח' }

describe('validateMedical', () => {
  it('צאצא רשום: מספיקים ת.ז., סיבה, סכום, טלפון ומסמך רפואי', () => {
    expect(validateMedical(base, true, false, 1)).toBeNull()
  })
  it('לא צאצא: דורש שם, כתובת וצילום ת.ז.', () => {
    expect(validateMedical(base, false, false, 1)).toMatch(/שם מלא/)
    const full = { ...base, fullName: 'משה כהן', address: 'הרצל 1', city: 'בני ברק' }
    expect(validateMedical(full, false, false, 1)).toMatch(/תעודת זהות/)
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
