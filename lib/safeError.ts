// ─────────────────────────────────────────────────────────────────────────────
// 🔴 תיאור שגיאה בטוח ללוג (ביקורת אבטחה 05.10).
//
// אובייקט השגיאה של googleapis/gaxios כולל את גוף בקשת רענון הטוקן.
// מסנן ההסתרה של gaxios מסתיר רק grant_type ושדות שמכילים "secret" —
// ה-refresh_token נשאר גלוי. console.error(msg, e) הדפיס אותו במלואו
// ללוג של Railway (נצפה בפועל: invalid_grant בסנכרון office@).
//
// ⇒ ללוג עוברים רק message / code / status — לעולם לא האובייקט.
// ─────────────────────────────────────────────────────────────────────────────

export function safeError(e: unknown): string {
  if (e === null || e === undefined) return String(e)
  if (typeof e !== 'object') return String(e)
  const o = e as { message?: unknown; code?: unknown; status?: unknown; response?: { status?: unknown } }
  const parts: string[] = []
  if (o.message !== undefined) parts.push(String(o.message))
  const status = o.status ?? o.response?.status
  if (o.code !== undefined) parts.push(`code=${String(o.code)}`)
  if (status !== undefined) parts.push(`status=${String(status)}`)
  return parts.length ? parts.join(' · ') : '[שגיאה ללא הודעה]'
}
