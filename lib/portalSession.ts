import type { NextRequest, NextResponse } from 'next/server'
import { signPayload, verifySignature } from '@/lib/signedToken'

// סשן חתום (HMAC) לפורטל הציבורי: נקבע אחרי איתור מוצלח לפי ת"ז,
// וכל בקשת המשך (הבקשות שלי / עדכון פרטים) חייבת להתאים למוטב שבסשן.

const COOKIE_NAME = 'pb_session'
const MAX_AGE_SECONDS = 60 * 60 * 6 // 6 שעות

// ⚠️ החתימה עברה ל-lib/signedToken — נכשל-סגור בהיעדר סוד. מחרוזת ריקה
// פירושה "לא ניתן להנפיק סשן", והאימות ידחה כל אסימון.
export function createPortalToken(beneficiaryId: string): string {
  const exp = Date.now() + MAX_AGE_SECONDS * 1000
  const payload = `${beneficiaryId}:${exp}`
  const sig = signPayload(payload)
  if (!sig) return ''
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export function verifyPortalToken(token: string | undefined): string | null {
  if (!token) return null
  let decoded: string
  try { decoded = Buffer.from(token, 'base64url').toString('utf-8') } catch { return null }
  const lastSep = decoded.lastIndexOf(':')
  if (lastSep < 0) return null
  const payload = decoded.slice(0, lastSep)
  const sig = decoded.slice(lastSep + 1)
  if (!verifySignature(payload, sig)) return null
  const [beneficiaryId, expStr] = [payload.slice(0, payload.lastIndexOf(':')), payload.slice(payload.lastIndexOf(':') + 1)]
  if (!beneficiaryId || Number(expStr) < Date.now()) return null
  return beneficiaryId
}

export function setPortalSession(response: NextResponse, beneficiaryId: string) {
  const token = createPortalToken(beneficiaryId)
  if (!token) return   // אין סוד חתימה — לא מנפיקים עוגייה חסרת משמעות
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  })
}

// מחזיר את מזהה המוטב מהסשן, או null אם אין סשן תקף.
export function getPortalBeneficiaryId(request: NextRequest): string | null {
  return verifyPortalToken(request.cookies.get(COOKIE_NAME)?.value)
}
