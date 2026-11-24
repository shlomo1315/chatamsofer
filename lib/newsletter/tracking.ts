import { createHmac, timingSafeEqual } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// מעקב פתיחות וקליקים של הניוזלטר, אצלנו ולא ב-Resend (כמו בגיליונות):
// פיקסל לכל נמען, וכל קישור עטוף בכתובת שלנו עם חתימה, כדי שלא תהיה הפניה פתוחה.
// כאן רק פונקציות טהורות: בניית הכתובות, עטיפת ה-HTML, פענוח מכשיר וזיהוי מכונות.
// ─────────────────────────────────────────────────────────────────────────────

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
const secret = () => process.env.OTP_NONCE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export function signClick(recipientId: string, url: string): string {
  return createHmac('sha256', secret()).update(`nlc:${recipientId}:${url}`).digest('hex').slice(0, 32)
}

export function verifyClick(recipientId: string, url: string, sig: string): boolean {
  if (!secret() || !/^[0-9a-f]{32}$/.test(sig)) return false
  return timingSafeEqual(Buffer.from(signClick(recipientId, url)), Buffer.from(sig))
}

export const openPixelUrl = (recipientId: string) => `${SITE()}/api/newsletter/o/${recipientId}.gif`

export function clickUrl(recipientId: string, url: string): string {
  return `${SITE()}/api/newsletter/c/${recipientId}?u=${encodeURIComponent(url)}&s=${signClick(recipientId, url)}`
}

const decodeAttr = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const encodeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/**
 * מוסיף למייל פיקסל פתיחה ועוטף כל קישור http(s) בקישור מעקב.
 * לא נוגע ב-mailto/tel, בעוגנים ובקישורי ההסרה (שצריכים לעבוד ישירות, גם לסינון ספאם).
 */
export function addTracking(html: string, recipientId: string, skipUrls: string[] = []): string {
  const skip = new Set(skipUrls.filter(Boolean))
  const wrapped = html.replace(/(<a\b[^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gi, (all, pre: string, q: string, raw: string) => {
    const url = decodeAttr(raw.trim())
    if (!/^https?:\/\//i.test(url) || skip.has(url) || /\/unsubscribe\b/i.test(url) || url.includes('/api/newsletter/c/')) return all
    return `${pre}${q}${encodeAttr(clickUrl(recipientId, url))}${q}`
  })
  const pixel = `<img src="${openPixelUrl(recipientId)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />`
  return /<\/body>/i.test(wrapped) ? wrapped.replace(/<\/body>/i, `${pixel}</body>`) : wrapped + pixel
}

export interface UaInfo { device: string; client: string; os: string }

/** מכשיר, לקוח מייל ומערכת הפעלה מתוך ה-User-Agent. מה שלא מזוהה: "לא ידוע". */
export function parseUserAgent(uaRaw: string | null | undefined): UaInfo {
  const ua = (uaRaw ?? '').trim()
  const U = 'לא ידוע'
  if (!ua) return { device: U, client: U, os: U }
  // Gmail מעביר את התמונות דרך שרת של גוגל, ולכן המכשיר עצמו לא ידוע
  if (/GoogleImageProxy|ggpht\.com/i.test(ua)) return { device: U, client: 'Gmail', os: U }
  if (/YahooMailProxy/i.test(ua)) return { device: U, client: 'Yahoo', os: U }

  const os = /Windows/i.test(ua) ? 'Windows'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
      : /Android/i.test(ua) ? 'Android'
        : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
          : /CrOS/i.test(ua) ? 'ChromeOS'
            : /Linux/i.test(ua) ? 'Linux' : U

  const device = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'טאבלט'
    : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'נייד'
      : /Windows|Macintosh|Mac OS X|Linux|CrOS/i.test(ua) ? 'מחשב' : U

  const client = /Microsoft Outlook|Outlook-|ms-office|MSOffice/i.test(ua) ? 'Outlook'
    : /Thunderbird/i.test(ua) ? 'Thunderbird'
      : /GSA\/|Gmail/i.test(ua) ? 'Gmail'
        : /SamsungBrowser/i.test(ua) ? 'Samsung'
          : /Edg\//i.test(ua) ? 'Edge'
            : /Firefox\//i.test(ua) ? 'Firefox'
              : /Chrome\/|CriOS\//i.test(ua) ? 'Chrome'
                : /Version\/[\d.]+.*Safari\//i.test(ua) ? 'Safari'
                  : /AppleWebKit/i.test(ua) && /iPhone|iPad|Macintosh/i.test(ua) ? 'Apple Mail' : U
  return { device, client, os }
}

const BOT_RE = /bot\b|spider|crawl|scan|preview|safelinks|barracuda|proofpoint|mimecast|python|curl|wget|headless|java\/|go-http|okhttp|axios|node-fetch|libwww|symantec|trendmicro|forcepoint|sophos|fortinet|zscaler/i

/**
 * פתיחה או קליק שנעשו כנראה על ידי מכונה ולא על ידי אדם. מחזיר סיבה, או null.
 * - apple: Apple Mail Privacy Protection טוען את כל התמונות מראש, בלי שנפתח באמת.
 * - scanner: סורקי אבטחה ובוטים לפי ה-User-Agent, או בקשת HEAD.
 * - fast: קליק תוך פחות מ-15 שניות מהשליחה, כמעט תמיד סורק של שרת הדואר.
 */
export function machineReason(opts: { ua: string | null | undefined; method?: string; kind: 'open' | 'click'; secondsSinceSent?: number | null }): string | null {
  const ua = (opts.ua ?? '').trim()
  if (opts.method && opts.method.toUpperCase() === 'HEAD') return 'scanner'
  if (!ua) return 'scanner'
  if (opts.kind === 'open' && /^Mozilla\/5\.0$/.test(ua)) return 'apple'
  if (BOT_RE.test(ua) && !/GoogleImageProxy/i.test(ua)) return 'scanner'
  if (opts.kind === 'click' && opts.secondsSinceSent != null && opts.secondsSinceSent >= 0 && opts.secondsSinceSent < 15) return 'fast'
  return null
}
