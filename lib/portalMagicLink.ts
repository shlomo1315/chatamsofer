import { signPayload, verifySignature } from '@/lib/signedToken'
import { isPortalScreen, pathForScreen, type PortalScreen } from '@/lib/portalScreens'

// קישור אישי חתום למייל: בלי סיסמה, עם תוקף, ומוביל ישר למסך מסוים.
// הקישור פותח סשן פורטל רגיל (ראו app/my) — לכן הוא נחשב כמו כניסה עם קוד.

export const MAGIC_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000 // שבוע

const SEP = '|'

export function createMagicToken(beneficiaryId: string, screen: PortalScreen, ttlMs = MAGIC_LINK_TTL_MS, now = Date.now()): string {
  if (!beneficiaryId || beneficiaryId.includes(SEP)) return ''
  const payload = ['ml', beneficiaryId, screen, String(now + ttlMs)].join(SEP)
  const sig = signPayload(payload, 'base64url')
  if (!sig) return ''
  return Buffer.from(`${payload}${SEP}${sig}`).toString('base64url')
}

export type MagicResult =
  | { ok: true; beneficiaryId: string; screen: PortalScreen }
  | { ok: false; reason: 'invalid' | 'expired' }

export function verifyMagicToken(token: string | null | undefined, now = Date.now()): MagicResult {
  if (!token) return { ok: false, reason: 'invalid' }
  let decoded: string
  try { decoded = Buffer.from(token, 'base64url').toString('utf-8') } catch { return { ok: false, reason: 'invalid' } }
  const cut = decoded.lastIndexOf(SEP)
  if (cut < 0) return { ok: false, reason: 'invalid' }
  const payload = decoded.slice(0, cut)
  if (!verifySignature(payload, decoded.slice(cut + 1), 'base64url')) return { ok: false, reason: 'invalid' }
  const [tag, beneficiaryId, screen, exp, ...rest] = payload.split(SEP)
  if (tag !== 'ml' || rest.length || !beneficiaryId || !isPortalScreen(screen)) return { ok: false, reason: 'invalid' }
  if (!(Number(exp) >= now)) return { ok: false, reason: 'expired' }
  return { ok: true, beneficiaryId, screen }
}

/** כתובת מלאה לכניסה במייל. מחזיר כתובת בלי אסימון (כניסה רגילה) כשאין סוד חתימה. */
export function buildMagicLink(origin: string, beneficiaryId: string, screen: PortalScreen): string {
  const path = pathForScreen(screen)
  const token = createMagicToken(beneficiaryId, screen)
  if (!token) return `${origin}${path}`
  return `${origin}${path}${path.includes('?') ? '&' : '?'}t=${token}`
}
