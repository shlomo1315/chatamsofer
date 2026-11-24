// תצוגת סשן של פורטל במסך הניהול: שם מכשיר קריא מתוך ה-User-Agent, ותיאור
// "פעילות אחרונה" יחסי. מופרד מהרכיב כדי שאפשר יהיה לבדוק אותו.

export interface DeviceLabel {
  label: string
  mobile: boolean
}

export function describeUserAgent(ua: string | null | undefined): DeviceLabel {
  if (!ua) return { label: 'מכשיר לא מזוהה', mobile: false }

  // ⚠️ הסדר חשוב: Edge ו-Opera מכילים גם "Chrome", ו-Chrome מכיל גם "Safari".
  const browser =
    /Edg(e|A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /SamsungBrowser\//.test(ua) ? 'Samsung'
    : /CriOS\/|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS\/|Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : null

  const os =
    /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux'
    : null

  const mobile = /iPhone|iPad|Android|Mobile/.test(ua)
  const label = [browser, os].filter(Boolean).join(' · ') || 'מכשיר לא מזוהה'
  return { label, mobile }
}

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** "עכשיו" (live) / "לפני 40 דק׳" / "לפני 3 שעות" / "אתמול" / "לפני 9 ימים" */
export function describeLastSeen(iso: string, now: number = Date.now()): { text: string; live: boolean } {
  const diff = Math.max(0, now - new Date(iso).getTime())
  if (diff < 5 * MIN) return { text: 'עכשיו', live: true }
  if (diff < HOUR) return { text: `לפני ${Math.floor(diff / MIN)} דק׳`, live: false }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR)
    return { text: h === 1 ? 'לפני שעה' : h === 2 ? 'לפני שעתיים' : `לפני ${h} שעות`, live: false }
  }
  const d = Math.floor(diff / DAY)
  return { text: d === 1 ? 'אתמול' : `לפני ${d} ימים`, live: false }
}

/** "21.11" — יום וחודש בשעון ישראל */
export function shortDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Jerusalem' })
    .formatToParts(new Date(iso))
  const day = parts.find(p => p.type === 'day')?.value ?? ''
  const month = parts.find(p => p.type === 'month')?.value ?? ''
  return `${day}.${month}`
}
