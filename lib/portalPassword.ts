import bcrypt from 'bcryptjs'

// מדיניות סיסמה לפורטל: לפחות 10 תווים, לפחות אות אחת באנגלית ולפחות ספרה אחת.
export function passwordError(pw: string): string | null {
  if (!pw || pw.length < 10) return 'הסיסמה חייבת לכלול לפחות 10 תווים'
  if (!/[a-zA-Z]/.test(pw)) return 'הסיסמה חייבת לכלול לפחות אות אחת באנגלית'
  if (!/[0-9]/.test(pw)) return 'הסיסמה חייבת לכלול לפחות ספרה אחת'
  return null
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12)
}

export async function verifyPassword(pw: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false
  try { return await bcrypt.compare(pw, hash) } catch { return false }
}

// קוד אימות חד-פעמי בן 6 ספרות
export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10)
}

export async function verifyCode(code: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false
  try { return await bcrypt.compare(code, hash) } catch { return false }
}

// מסכת כתובת מייל לתצוגה: jonathan@gmail.com → j******n@gmail.com
export function maskEmail(email: string | null | undefined): string {
  if (!email) return ''
  const at = email.indexOf('@')
  if (at < 1) return ''
  const user = email.slice(0, at)
  const domain = email.slice(at)
  const masked = user.length <= 2
    ? `${user[0]}*`
    : `${user[0]}${'*'.repeat(Math.max(1, user.length - 2))}${user[user.length - 1]}`
  return `${masked}${domain}`
}
