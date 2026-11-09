// ─── חזרה לדף האחרון אחרי ניתוק ───────────────────────────────────────────────
// SessionGuard שומר את הדף הפתוח; מסך הכניסה מחזיר אליו אחרי כניסה חוזרת.
// הנתיב נבדק פעמיים (כאן ובשרת ב-/auth/callback), כדי שלא יהיה open redirect.

export const RETURN_KEY = 'hq-return-to'
export const LOGGED_OUT_AT_KEY = 'hq-logged-out-at'

/** רק נתיב פנימי תחת /admin: בלי כתובת מלאה, "//", לוכסן הפוך, רווח, % או תווי בקרה. */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (!/^\/(?![/\\])[^\s\\%\x00-\x1f\x7f]*$/.test(raw)) return null
  if (raw !== '/admin' && !raw.startsWith('/admin/') && !raw.startsWith('/admin?')) return null
  return raw
}

const LABELS: [string, string][] = [
  ['/admin/maternity', 'כרטסת לידה'],
  ['/admin/dashboard', 'לוח הבקרה'],
  ['/admin/families', 'משפחות'],
  ['/admin/beneficiaries', 'מוטבים'],
  ['/admin/mail', 'דואר'],
  ['/admin/settings', 'הגדרות'],
  ['/admin/reports', 'דוחות'],
]

export function returnLabel(path: string | null): string {
  if (!path) return 'לוח הבקרה'
  const hit = LABELS.find(([p]) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'))
  return hit ? hit[1] : 'הדף שבו עצרת'
}

/** "לפני 12 שניות" / "לפני דקה" / "לפני 5 דקות" */
export function sinceWords(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  if (s === 1) return 'לפני שנייה'
  if (s < 60) return `לפני ${s} שניות`
  const m = Math.floor(s / 60)
  return m === 1 ? 'לפני דקה' : `לפני ${m} דקות`
}

export const RING_LENGTH = 389.6

/** היסט הטבעת: מלאה כשנשארו כל השניות, ריקה ב-0. */
export function ringOffset(left: number, total: number): number {
  const f = Math.min(1, Math.max(0, left / total))
  return RING_LENGTH * (1 - f)
}

/** 20 השניות האחרונות מאדימות. */
export const isLowCountdown = (left: number) => left <= 20
