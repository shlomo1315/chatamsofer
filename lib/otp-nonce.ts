import { createHmac, timingSafeEqual } from 'crypto'

// Short-lived nonce proving email ownership after OTP verification.
// Shared by verify-otp (sign), register (verify) and auth/callback (sign).
//
// Fail-closed: OTP_NONCE_SECRET MUST be set in the environment. The previous
// `|| 'change-this-secret-in-production'` fallback meant that if the env var was
// unset in production, the HMAC secret was a publicly-known constant and any email
// nonce could be forged. We now throw instead.
//
// ⚠️ DEPLOY NOTE: OTP_NONCE_SECRET must exist in Vercel/Railway BEFORE deploying
// this change, otherwise sign/verify throw and registration breaks.

const NONCE_TTL_MS = 15 * 60 * 1000 // 15 minutes

function getSecret(): string {
  const secret = process.env.OTP_NONCE_SECRET
  if (!secret) {
    throw new Error('OTP_NONCE_SECRET is not configured')
  }
  return secret
}

export function signNonce(email: string): string {
  const secret = getSecret()
  const exp = Date.now() + NONCE_TTL_MS
  const payload = `${email}:${exp}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export function verifyNonce(nonce: string, email: string): boolean {
  try {
    const secret = getSecret()
    const decoded = Buffer.from(nonce, 'base64url').toString()
    const lastColon = decoded.lastIndexOf(':')
    const payload = decoded.slice(0, lastColon)
    const sig = decoded.slice(lastColon + 1)
    const [storedEmail, expStr] = payload.split(':')
    const exp = parseInt(expStr, 10)

    if (storedEmail !== email) return false
    if (isNaN(exp) || exp < Date.now()) return false

    const expectedSig = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
