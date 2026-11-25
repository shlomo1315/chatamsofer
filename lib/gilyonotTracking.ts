import { createHmac, timingSafeEqual } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// מעקב קליקים בגיליונות, אצלנו ולא ב-Resend (כמו בניוזלטר, lib/newsletter/tracking.ts):
// כל קישור במייל עטוף ב-/api/gilyonot/c/<טוקן המשלוח> עם חתימה, כדי שלא תהיה הפניה פתוחה.
// קישורי ההסרה וקישורי המעקב שלנו (פיקסל, הורדה) לא נעטפים.
// ─────────────────────────────────────────────────────────────────────────────

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
const secret = () => process.env.OTP_NONCE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export function signGilyonClick(token: string, url: string): string {
  return createHmac('sha256', secret()).update(`glc:${token}:${url}`).digest('hex').slice(0, 32)
}

export function verifyGilyonClick(token: string, url: string, sig: string): boolean {
  if (!secret() || !/^[0-9a-f]{32}$/.test(sig)) return false
  return timingSafeEqual(Buffer.from(signGilyonClick(token, url)), Buffer.from(sig))
}

export function gilyonClickUrl(token: string, url: string): string {
  return `${SITE()}/api/gilyonot/c/${token}?u=${encodeURIComponent(url)}&s=${signGilyonClick(token, url)}`
}

const decodeAttr = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const encodeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
// הסרה, הסרה מכל הרשימות, פיקסל, הורדה וקליק: עובדים ישירות ולא נספרים כקליק
const SKIP_RE = /\/api\/gilyonot\/(unsubscribe|optout|o|d|c)\//i

/** עוטף כל קישור http(s) במייל בקישור מעקב של המשלוח. לא נוגע ב-mailto/tel, בעוגנים ובקישורי ההסרה. */
export function wrapGilyonLinks(html: string, token: string, skipUrls: string[] = []): string {
  const skip = new Set(skipUrls.filter(Boolean))
  return html.replace(/(<a\b[^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gi, (all, pre: string, q: string, raw: string) => {
    const url = decodeAttr(raw.trim())
    if (!/^https?:\/\//i.test(url) || skip.has(url) || SKIP_RE.test(url) || /\/unsubscribe\b/i.test(url)) return all
    return `${pre}${q}${encodeAttr(gilyonClickUrl(token, url))}${q}`
  })
}
