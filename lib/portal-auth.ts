import { createHmac, timingSafeEqual } from 'crypto'

// Portal (recovery-home) session cookies are shared-password sessions, not per-user
// accounts. The cookie value used to be the literal string '1', whose name is derived
// purely from the public home name — trivially forgeable. We now store an HMAC-signed
// token over `home:exp` so the value cannot be fabricated without the server secret.

const COOKIE_TTL_MS = 60 * 60 * 24 * 1000 // 24h — matches the previous maxAge

// Fail-closed: a missing secret must never silently fall back to a known constant.
// PORTAL_AUTH_SECRET must be set in the environment (Vercel/Railway). If absent we
// fall back to OTP_NONCE_SECRET so a single secret can cover both if desired.
function getSecret(): string {
  const secret = process.env.PORTAL_AUTH_SECRET || process.env.OTP_NONCE_SECRET
  if (!secret) {
    throw new Error('PORTAL_AUTH_SECRET (or OTP_NONCE_SECRET) is not configured')
  }
  return secret
}

export function portalCookieName(home: string): string {
  const safe = Buffer.from(home, 'utf-8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .slice(0, 32)
  return `ph_${safe}`
}

// Produce the signed cookie value for a successful portal login.
export function signPortalToken(home: string): string {
  const secret = getSecret()
  const exp = Date.now() + COOKIE_TTL_MS
  const payload = `${home}:${exp}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

// Verify a cookie value belongs to `home` and has not expired. Constant-time.
export function verifyPortalToken(token: string | undefined, home: string): boolean {
  if (!token) return false
  try {
    const secret = getSecret()
    const decoded = Buffer.from(token, 'base64url').toString()
    const lastColon = decoded.lastIndexOf(':')
    if (lastColon < 0) return false
    const payload = decoded.slice(0, lastColon)
    const sig = decoded.slice(lastColon + 1)
    const firstColon = payload.indexOf(':')
    if (firstColon < 0) return false
    const storedHome = payload.slice(0, firstColon)
    const expStr = payload.slice(firstColon + 1)
    const exp = parseInt(expStr, 10)

    if (storedHome !== home) return false
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
