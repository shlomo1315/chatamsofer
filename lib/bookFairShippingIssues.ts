// ─────────────────────────────────────────────────────────────────────────────
// תקלות משלוח ביריד — משלוח שלא הגיע, ספר פגום, ספר שגוי, חסר.
//
// 🔴 למה: תקלה כזו דורשת טיפול (שליחה חוזרת, החלפה, זיכוי), ועד עכשיו
// היא חיה בהערה חופשית בהזמנה או בראש של מישהו. כאן היא נרשמת עם סוג
// וסטטוס, וכך אפשר לסנן "מה עוד פתוח".
//
// ⚠️ הלוגיקה כאן טהורה (בלי מסד) כדי שתיבדק ב-vitest: ולידציה של קלט,
// מעבר סטטוס וניקוי מחרוזת החיפוש לפני שהיא נכנסת למסנן של PostgREST.
// ─────────────────────────────────────────────────────────────────────────────

export const ISSUE_TYPES = ['not_arrived', 'damaged', 'wrong_book', 'missing', 'other'] as const
export type IssueType = typeof ISSUE_TYPES[number]

export const ISSUE_STATUSES = ['open', 'in_progress', 'resolved'] as const
export type IssueStatus = typeof ISSUE_STATUSES[number]

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  not_arrived: 'המשלוח לא הגיע',
  damaged:     'ספרים פגומים',
  wrong_book:  'ספר שגוי',
  missing:     'חסר ספר',
  other:       'אחר',
}

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open:        'פתוח',
  in_progress: 'בטיפול',
  resolved:    'טופל',
}

export const ISSUE_STATUS_COLORS: Record<IssueStatus, string> = {
  open:        'border-red-200 bg-red-50 text-red-700',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-800',
  resolved:    'border-emerald-200 bg-emerald-50 text-emerald-700',
}

export const MAX_TEXT = 2000

export function isIssueType(v: unknown): v is IssueType {
  return typeof v === 'string' && (ISSUE_TYPES as readonly string[]).includes(v)
}
export function isIssueStatus(v: unknown): v is IssueStatus {
  return typeof v === 'string' && (ISSUE_STATUSES as readonly string[]).includes(v)
}

function cleanText(v: unknown): string | null {
  if (v === undefined || v === null) return null
  const s = String(v).trim().slice(0, MAX_TEXT)
  return s || null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

export type NewIssueInput = {
  orderId?: unknown
  type?: unknown
  description?: unknown
}

/** ולידציה של תקלה חדשה. מחזיר שגיאה בעברית או את השורה להכנסה. */
export function parseNewIssue(body: NewIssueInput):
  { error: string } | { row: { order_id: string; issue_type: IssueType; description: string } } {
  if (!isUuid(body.orderId)) return { error: 'יש לבחור הזמנה' }
  if (!isIssueType(body.type)) return { error: 'סוג תקלה לא תקין' }
  const description = cleanText(body.description)
  // ⚠️ תיאור חובה: "ספר שגוי" בלי לומר איזה — אי אפשר לטפל בו.
  if (!description) return { error: 'יש לתאר את התקלה' }
  return { row: { order_id: body.orderId, issue_type: body.type, description } }
}

export type IssuePatchInput = {
  type?: unknown
  status?: unknown
  description?: unknown
  resolution?: unknown
}

/**
 * עדכון תקלה קיימת. מעבר ל"טופל" חותם זמן ומטפל; יציאה ממנו מאפסת
 * אותם — אחרת נשאר שם של מי שלא סגר.
 */
export function buildIssuePatch(body: IssuePatchInput, userId: string, now = new Date()):
  { error: string } | { patch: Record<string, unknown> } {
  const patch: Record<string, unknown> = {}

  if (body.type !== undefined) {
    if (!isIssueType(body.type)) return { error: 'סוג תקלה לא תקין' }
    patch.issue_type = body.type
  }
  if (body.description !== undefined) {
    const d = cleanText(body.description)
    if (!d) return { error: 'יש לתאר את התקלה' }
    patch.description = d
  }
  if (body.resolution !== undefined) patch.resolution_note = cleanText(body.resolution)
  if (body.status !== undefined) {
    if (!isIssueStatus(body.status)) return { error: 'סטטוס לא תקין' }
    patch.status = body.status
    patch.resolved_at = body.status === 'resolved' ? now.toISOString() : null
    patch.resolved_by = body.status === 'resolved' ? userId : null
  }

  if (!Object.keys(patch).length) return { error: 'אין מה לעדכן' }
  patch.updated_at = now.toISOString()
  return { patch }
}

/**
 * ניקוי מחרוזת חיפוש לפני שהיא משובצת במסנן or() של PostgREST.
 * 🔴 פסיק, סוגריים, נקודה ו-* הם תחביר של המסנן — בלי ניקוי, חיפוש
 * יכול להוסיף תנאים משלו לשאילתה.
 */
export function sanitizeSearch(q: unknown): string {
  return String(q ?? '')
    .replace(/[,()*.%\\:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/** תאריך YYYY-MM-DD בלבד; אחרת null (מסנן מתעלם). */
export function parseDay(v: unknown): string | null {
  const s = String(v ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? null : s
}
