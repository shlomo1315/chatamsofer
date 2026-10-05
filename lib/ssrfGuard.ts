import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הגנת SSRF — בדיקת הכתובות *שהשם מתורגם אליהן*, לא רק הטקסט.
//
// (ביקורת אבטחה 05.10) הבדיקה הקודמת בדקה את שם המארח בביטוי רגולרי
// בלבד, ולכן עברו:
//   · [::ffff:7f00:1]  — 127.0.0.1 בכתיב IPv6
//   · fd00::/8         — הרשת הפנימית של Railway (*.railway.internal)
//   · 100.64.0.0/10    — CGNAT
//   · 127.0.0.1.nip.io — שם רגיל שמתורגם לכתובת פנימית
// ⚠️ נשאר חלון TOCTOU (DNS rebinding) בין הבדיקה לבקשה — מצומצם, כי
// גם כל הפניה (redirect) נבדקת מחדש בדרך זו.
// ─────────────────────────────────────────────────────────────────────────────

function ipv4Private(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)          // CGNAT
    || (a === 169 && b === 254)                     // link-local / metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)                       // 192.0.0.0/24
    || (a === 198 && (b === 18 || b === 19))        // benchmarking
    || a >= 224                                     // multicast / reserved
}

/** האם הכתובת פנימית/שמורה (ולכן אסורה כיעד). קלט לא תקין ⇒ true. */
export function isPrivateIp(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, '').toLowerCase()
  const v = isIP(ip)
  if (v === 4) return ipv4Private(ip)
  if (v !== 6) return true
  if (ip === '::' || ip === '::1') return true
  // IPv4-mapped (::ffff:a.b.c.d או ::ffff:7f00:1)
  const mapped = ip.match(/^::ffff:(.+)$/)
  if (mapped) {
    const rest = mapped[1]
    if (isIP(rest) === 4) return ipv4Private(rest)
    const hex = rest.split(':')
    if (hex.length === 2) {
      const n = (parseInt(hex[0], 16) << 16) | parseInt(hex[1], 16)
      return ipv4Private([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'))
    }
    return true
  }
  const first = parseInt(ip.split(':')[0] || '0', 16)
  return (first & 0xfe00) === 0xfc00     // fc00::/7 — ULA (כולל fd00::/8)
    || (first & 0xffc0) === 0xfe80       // fe80::/10 — link-local
    || (first & 0xff00) === 0xff00       // multicast
}

/** מתרגם את שם המארח ובודק שכל הכתובות ציבוריות. */
export async function assertPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return !isPrivateIp(host)
  if (/^localhost$/i.test(host) || host.endsWith('.internal') || host.endsWith('.local')) return false
  try {
    const addrs = await lookup(host, { all: true })
    return addrs.length > 0 && addrs.every(a => !isPrivateIp(a.address))
  } catch {
    return false
  }
}
