// טופס סיוע רפואי ציבורי: אימות קלט, בדיקת קבצים וטיוטת ההודעה למבקש.

export const MEDICAL_MAX_FILE = 10 * 1024 * 1024
export const MEDICAL_MAX_DOCS = 6

export const MEDICAL_FILE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', gif: 'image/gif', pdf: 'application/pdf',
}

export interface MedicalInput {
  idNumber: string
  fullName: string
  phone: string
  email: string
  address: string
  city: string
  amount: number
  reason: string
}

// descendant = הת"ז נמצאה במאגר. צאצא רשום ממלא פחות שדות; מי שלא רשום ממלא הכול.
export function validateMedical(i: MedicalInput, descendant: boolean, hasIdCard: boolean, medicalDocs: number): string | null {
  if (i.idNumber.replace(/\D/g, '').length < 5) return 'יש להזין מספר תעודת זהות תקין'
  if (!i.reason.trim()) return 'יש לפרט את סיבת הבקשה'
  if (!(i.amount > 0) || i.amount > 1_000_000) return 'יש להזין את הסכום המבוקש'
  if (!/^[\d\-+ ]{7,15}$/.test(i.phone.trim())) return 'יש להזין מספר טלפון תקין'
  if (i.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email.trim())) return 'כתובת המייל אינה תקינה'
  if (medicalDocs < 1) return 'יש לצרף לפחות מסמך רפואי אחד'
  if (!descendant) {
    if (i.fullName.trim().length < 3) return 'יש להזין שם מלא'
    if (!i.address.trim() || !i.city.trim()) return 'יש להזין כתובת ועיר'
    if (!hasIdCard) return 'יש לצרף צילום תעודת זהות'
  }
  return null
}

// בדיקת תוכן הקובץ בפועל (ולא רק הסיומת): חתימת הבתים הראשונים.
export function fileSignatureMatches(ext: string, head: Uint8Array): boolean {
  const is = (...b: number[]) => b.every((v, k) => head[k] === v)
  switch (ext) {
    case 'pdf': return is(0x25, 0x50, 0x44, 0x46)
    case 'png': return is(0x89, 0x50, 0x4e, 0x47)
    case 'jpg': case 'jpeg': return is(0xff, 0xd8, 0xff)
    case 'gif': return is(0x47, 0x49, 0x46, 0x38)
    case 'webp': return is(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45
    case 'heic': return head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70
    default: return false
  }
}

export interface FinalDraft { subject: string; body: string }

// טיוטה בלבד — המזכיר עורך ושולח בעצמו.
export function finalMessageDraft(name: string, approved: boolean, amount: number | null): FinalDraft {
  const hello = name ? `שלום ${name},` : 'שלום רב,'
  if (approved) {
    return {
      subject: 'בקשתך לסיוע רפואי אושרה',
      body: `${hello}\n\nבקשתך לסיוע רפואי נבדקה ואושרה בסכום של ${Number(amount ?? 0).toLocaleString('he-IL')} ₪.\nנציג המשרד ייצור איתך קשר בנוגע לאופן התשלום.\n\nבברכת רפואה שלמה,\nהיכל החתם סופר`,
    }
  }
  return {
    subject: 'בנוגע לבקשתך לסיוע רפואי',
    body: `${hello}\n\nלאחר בדיקת בקשתך לסיוע רפואי, לצערנו לא ניתן לאשר אותה הפעם.\n\nבברכת רפואה שלמה,\nהיכל החתם סופר`,
  }
}

export const idDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
