import type { NextRequest } from 'next/server'
import { verifySvixSignature } from './svix'

// ─────────────────────────────────────────────────────────────────────────────
// סוד החתימה של ה-webhook של המייל הנכנס, נמשך ישירות מ-Resend.
//
// למה: לכל webhook ב-Resend סוד חתימה משלו, והמשתנה RESEND_WEBHOOK_SIGNING_SECRET
// עלול להכיל את הסוד של webhook אחר (המסירות). אז כל מייל נכנס נדחה בשקט.
// כשהאימות מול המשתנה נכשל, מושכים את הסוד האמיתי מ-Resend ומאמתים מולו.
//
// הסוד נשמר בזיכרון התהליך בלבד: לא ביומן ולא בדיסק.
// ─────────────────────────────────────────────────────────────────────────────

const INBOUND_WEBHOOK_ID = '5da64ad8-47f9-4707-917f-9a07a6df5e4d'
const INBOUND_PATH = '/api/webhooks/resend-inbound'
const API = 'https://api.resend.com'
const TTL_MS = 10 * 60_000
// כשל נשמר לזמן קצר: חתימות מזויפות לא יגרמו לקריאה ל-Resend על כל בקשה.
const FAIL_TTL_MS = 60_000

type Fetch = typeof fetch
type Cached = { secret: string | null; expires: number }

let cached: Cached | null = null
let pending: Promise<string | null> | null = null

export function resetInboundSecretCache() {
  cached = null
  pending = null
}

async function fetchSecret(fetchImpl: Fetch): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[resend-inbound] לא ניתן למשוך את סוד החתימה מ-Resend: RESEND_API_KEY חסר')
    return null
  }
  const get = async (path: string) => {
    const res = await fetchImpl(`${API}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`Resend ${path} החזיר ${res.status}`)
    return res.json() as Promise<Record<string, unknown>>
  }

  try {
    let id = process.env.RESEND_INBOUND_WEBHOOK_ID || INBOUND_WEBHOOK_ID
    let hook = await get(`/webhooks/${id}`).catch(() => null)
    if (!hook) {
      // המזהה השתנה (webhook נוצר מחדש): מאתרים לפי הכתובת
      const list = await get('/webhooks')
      const found = ((list.data as Record<string, unknown>[]) ?? [])
        .find(w => String(w.endpoint ?? '').includes(INBOUND_PATH))
      if (!found) throw new Error('לא נמצא ב-Resend webhook של המייל הנכנס')
      id = String(found.id)
      hook = await get(`/webhooks/${id}`)
    }
    const secret = typeof hook.signing_secret === 'string' ? hook.signing_secret : ''
    if (!secret) throw new Error(`ל-webhook ${id} אין signing_secret בתשובה`)
    return secret
  } catch (e) {
    console.error('[resend-inbound] משיכת סוד החתימה מ-Resend נכשלה:', e instanceof Error ? e.message : 'שגיאה לא ידועה')
    return null
  }
}

/** סוד החתימה של ה-webhook של המייל הנכנס, מזיכרון או מ-Resend. null בכשל. */
export async function getInboundSigningSecret(fetchImpl: Fetch = fetch): Promise<string | null> {
  if (cached && cached.expires > Date.now()) return cached.secret
  // בקשות במקביל ממתינות לאותה משיכה
  if (!pending) {
    pending = fetchSecret(fetchImpl)
      .then(secret => {
        cached = { secret, expires: Date.now() + (secret ? TTL_MS : FAIL_TTL_MS) }
        return secret
      })
      .finally(() => { pending = null })
  }
  return pending
}

/**
 * אימות חתימת Svix של מייל נכנס: קודם מול הסודות שבמשתנה, ואם נכשל,
 * מול הסוד שנמשך מ-Resend.
 */
export async function verifyInboundSvix(
  request: NextRequest,
  rawBody: string,
  envSecret: string | undefined,
  fetchImpl: Fetch = fetch,
): Promise<boolean> {
  if (envSecret && verifySvixSignature(request, rawBody, envSecret)) return true
  const secret = await getInboundSigningSecret(fetchImpl)
  if (!secret) return false
  const ok = verifySvixSignature(request, rawBody, secret)
  if (ok) console.warn('[resend-inbound] אומת מול סוד החתימה שנמשך מ-Resend. הסוד במשתנה לא תואם ל-webhook של המייל הנכנס.')
  return ok
}
