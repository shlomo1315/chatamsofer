import { describe, it, expect } from 'vitest'
import { emailOk, fieldError, personalErrors, type PersonalInput } from './aidApplyValidation'

const ok: PersonalInput = {
  id: '123456782', first: 'משה', last: 'כהן', birth: '1980-05-01', marital: 'נשואים',
  phone: '050-1234567', phone2: '', email: 'moshe@gmail.com', city: 'בני ברק', address: 'רבי עקיבא 10',
  wifeName: 'שרה', wifeId: '000000018', wifePhone: '',
}

describe('אימות שדות בטופס בקשת סיוע', () => {
  it('ת"ז: ספרת ביקורת', () => {
    expect(fieldError('id', ok)).toBe('')
    expect(fieldError('id', { ...ok, id: '123456789' })).toMatch(/אינו תקין/)
    expect(fieldError('id', { ...ok, id: '' })).toMatch(/אינו תקין/)
    expect(fieldError('id', { ...ok, id: '000000000' })).toMatch(/אינו תקין/)
  })

  it('טלפון נייד: 10 ספרות שמתחילות ב-05', () => {
    expect(fieldError('phone', ok)).toBe('')
    expect(fieldError('phone', { ...ok, phone: '03-6123456' })).toMatch(/05/)
    expect(fieldError('phone', { ...ok, phone: '05012345' })).toMatch(/05/)
    expect(fieldError('phone2', { ...ok, phone2: '03-6123456' })).toBe('')
    expect(fieldError('phone2', { ...ok, phone2: '123' })).toMatch(/אינו תקין/)
  })

  it('מייל', () => {
    expect(emailOk('a@b.co')).toBe(true)
    expect(emailOk('a@b')).toBe(false)
    expect(emailOk('ישראל@gmail.com')).toBe(false)
    expect(emailOk('a@b..com')).toBe(false)
    expect(fieldError('email', { ...ok, email: 'moshe@gmail' })).toMatch(/המייל/)
  })

  it('פרטי האישה נדרשים רק כשנשואים', () => {
    expect(fieldError('wifeName', { ...ok, wifeName: '' })).toMatch(/האישה/)
    expect(fieldError('wifeId', { ...ok, wifeId: '111' })).toMatch(/האישה/)
    const widower = { ...ok, marital: 'אלמן', wifeName: '', wifeId: '' }
    expect(personalErrors(widower, false)).toEqual({})
  })

  it('חוסם מעבר כשיש שגיאה, ומשחרר כשהכול תקין', () => {
    expect(personalErrors(ok, false)).toEqual({})
    const bad = personalErrors({ ...ok, id: '123456789', phone: '12', email: 'x' }, false)
    expect(Object.keys(bad).sort()).toEqual(['email', 'id', 'phone'])
  })

  it('צאצא מחובר: ת"ז ושם מהכרטיס לא נבדקים, טלפון ומייל כן', () => {
    const reg = { ...ok, id: '', first: '', birth: '', city: '' }
    expect(personalErrors(reg, true)).toEqual({})
    expect(Object.keys(personalErrors({ ...reg, phone: '1' }, true))).toEqual(['phone'])
  })
})
