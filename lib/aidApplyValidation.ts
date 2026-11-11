import { validateIsraeliId, validatePhone, validatePhoneOrLandline } from '@/lib/validation'

// אימות שדות בטופס בקשת הסיוע: הודעה ליד השדה ביציאה ממנו, וחסימת מעבר לשלב הבא.
// השרת בודק שוב (lib/medicalRequest).

export const isMarried = (m: string) => /^נשו/.test(m.trim())

export function emailOk(v: string): boolean {
  const e = v.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false
  // כתובת בעברית או עם נקודה כפולה לא תגיע ליעד
  if (!/^[\x20-\x7E]+$/.test(e) || e.includes('..')) return false
  const domain = e.slice(e.indexOf('@') + 1)
  return !domain.startsWith('.') && !domain.endsWith('.')
}

export interface PersonalInput {
  id: string; first: string; last: string; birth: string; marital: string
  phone: string; phone2: string; email: string; city: string; address: string
  wifeName: string; wifeId: string; wifePhone: string
}
export type PersonalField = keyof PersonalInput

const MSG: Record<PersonalField, string> = {
  id: 'מספר תעודת הזהות אינו תקין. בדקו את כל 9 הספרות.',
  first: 'יש למלא שם פרטי.',
  last: 'יש למלא שם משפחה.',
  birth: 'יש להזין תאריך לידה.',
  marital: 'יש לבחור מצב משפחתי.',
  phone: 'יש להזין טלפון נייד תקין: 10 ספרות שמתחילות ב-05.',
  phone2: 'מספר הטלפון הנוסף אינו תקין.',
  email: 'כתובת המייל אינה תקינה. לשם תישלח התשובה.',
  city: 'יש לבחור עיר ולמלא כתובת.',
  address: 'יש לבחור עיר ולמלא כתובת.',
  wifeName: 'יש למלא את שם האישה.',
  wifeId: 'מספר תעודת הזהות של האישה אינו תקין.',
  wifePhone: 'מספר הטלפון של האישה אינו תקין.',
}

const filled = (v: string) => v.trim().length > 0

// שגיאה של שדה אחד. ריק בשדה חובה נחשב שגיאה; שדה רשות ריק תקין.
export function fieldError(f: PersonalField, d: PersonalInput): string {
  const v = d[f] ?? ''
  const married = isMarried(d.marital)
  let ok = true
  switch (f) {
    case 'id': ok = validateIsraeliId(v); break
    case 'phone': ok = validatePhone(v); break
    case 'phone2': ok = !filled(v) || validatePhoneOrLandline(v); break
    case 'email': ok = emailOk(v); break
    case 'wifeName': ok = !married || filled(v); break
    case 'wifeId': ok = !married || validateIsraeliId(v); break
    case 'wifePhone': ok = !married || !filled(v) || validatePhoneOrLandline(v); break
    case 'birth': ok = /^\d{4}-\d{2}-\d{2}$/.test(v) && v <= new Date().toISOString().slice(0, 10); break
    default: ok = filled(v)
  }
  return ok ? '' : MSG[f]
}

// כל השגיאות של שלב הפרטים. צאצא מחובר: הת"ז, השם, תאריך הלידה והכתובת באים מהכרטיס.
export function personalErrors(d: PersonalInput, registered: boolean): Partial<Record<PersonalField, string>> {
  const fields: PersonalField[] = registered
    ? ['marital', 'phone', 'phone2', 'email', 'wifeName', 'wifeId', 'wifePhone']
    : ['id', 'marital', 'first', 'last', 'wifeName', 'wifeId', 'wifePhone', 'birth', 'phone', 'phone2', 'email', 'city', 'address']
  const out: Partial<Record<PersonalField, string>> = {}
  for (const f of fields) {
    const e = fieldError(f, d)
    if (e) out[f] = e
  }
  return out
}
