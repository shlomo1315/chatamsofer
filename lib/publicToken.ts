import { createHmac, timingSafeEqual } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// טוקן חתום לקישורים ציבוריים (מכתב ברכה / משוב בית החלמה).
// אותו דפוס HMAC כמו lib/portalSession.ts — לא ניתן לניחוש ולא לזיוף.
// הטוקן מקודד את סוג הפנייה ואת מזהה הלידה, ופג אחרי 90 יום.
// ─────────────────────────────────────────────────────────────────────────────

export type PublicTokenKind = 'g' | 's' // g = gratitude, s = survey/feedback

const TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 יום

function secret(): string {
  return process.env.OTP_NONCE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex')
}

export function signPublicToken(kind: PublicTokenKind, aidId: string): string {
  const exp = Date.now() + TTL_MS
  const payload = `${kind}:${aidId}:${exp}`
  return Buffer.from(`${payload}:${sign(payload)}`).toString('base64url')
}

/** מאמת טוקן ומחזיר את מזהה הלידה, או null אם אינו תקין/פג. */
export function verifyPublicToken(token: string | undefined | null, kind: PublicTokenKind): string | null {
  if (!token) return null

  let decoded: string
  try { decoded = Buffer.from(token, 'base64url').toString('utf-8') } catch { return null }

  const lastSep = decoded.lastIndexOf(':')
  if (lastSep < 0) return null

  const payload = decoded.slice(0, lastSep)
  const sig = decoded.slice(lastSep + 1)

  const a = Buffer.from(sig)
  const b = Buffer.from(sign(payload))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const parts = payload.split(':')
  if (parts.length !== 3) return null
  const [k, aidId, expStr] = parts

  if (k !== kind || !aidId) return null
  if (!Number(expStr) || Number(expStr) < Date.now()) return null

  return aidId
}
