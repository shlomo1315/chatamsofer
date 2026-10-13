import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// תקלות משלוח ביריד — משלוח שלא הגיע, ספר פגום, ספר לא נכון, חסר.
// אפיון: docs/book-fair-shipping-issues.md
//
// 🔴 למה: תקלה כזו דורשת טיפול (שליחה חוזרת, החלפה, זיכוי), ועד עכשיו
// היא חיה בהערה חופשית בהזמנה או בראש של מישהו. כאן היא נרשמת עם סוג,
// סטטוס ויומן, וכך אפשר לסנן "מה עוד פתוח".
//
// ⚠️ הלוגיקה כאן טהורה (בלי מסד) כדי שתיבדק ב-vitest: ולידציה (zod,
// strict — שדה לא מוכר נדחה), מעבר סטטוס, ספרים מושפעים וסינון.
// ─────────────────────────────────────────────────────────────────────────────

export const ISSUE_TYPES = ['not_arrived', 'damaged', 'wrong_item', 'missing_item', 'other'] as const
export type IssueType = typeof ISSUE_TYPES[number]

export const ISSUE_STATUSES = ['open', 'in_progress', 'resolved', 'cancelled'] as const
export type IssueStatus = typeof ISSUE_STATUSES[number]

export const RESOLUTIONS = ['resent', 'replaced', 'refunded', 'arrived_late', 'no_action'] as const
export type Resolution = typeof RESOLUTIONS[number]

export const REPORTED_VIA = ['phone', 'email', 'whatsapp', 'other'] as const
export type ReportedVia = typeof REPORTED_VIA[number]

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  not_arrived:  'המשלוח לא הגיע',
  damaged:      'ספרים פגומים',
  wrong_item:   'נשלח ספר לא נכון',
  missing_item: 'חסר ספר בחבילה',
  other:        'אחר',
}

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open:        'פתוח',
  in_progress: 'בטיפול',
  resolved:    'טופל',
  cancelled:   'בוטל',
}

/** תגית סטטוס (רקע + טקסט), לפי המוקאפ המאושר. */
export const ISSUE_STATUS_TAG: Record<IssueStatus, string> = {
  open:        'bg-red-50 text-red-700',
  in_progress: 'bg-amber-50 text-amber-700',
  resolved:    'bg-green-50 text-green-700',
  cancelled:   'bg-slate-100 text-slate-500',
}

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  resent:       'נשלח משלוח חוזר',
  replaced:     'הוחלף הספר',
  refunded:     'זיכוי כספי',
  arrived_late: 'המשלוח הגיע בסוף',
  no_action:    'לא נדרשה פעולה',
}

export const REPORTED_VIA_LABELS: Record<ReportedVia, string> = {
  phone:    'טלפון',
  email:    'מייל',
  whatsapp: 'וואטסאפ',
  other:    'אחר',
}

/** סוגים שבהם בוחרים אילו ספרים נפגעו. */
export const ITEM_TYPES: readonly IssueType[] = ['damaged', 'wrong_item', 'missing_item']

export const MAX_TEXT = 2000
/** תקלה פתוחה יותר מזה מקבלת תגית "ממתינה X ימים". */
export const LATE_AFTER_DAYS = 3

// ── ולידציה ──────────────────────────────────────────────────────────────────

const text = (msg: string) => z.string({ error: msg }).trim().min(1, msg).max(MAX_TEXT, `עד ${MAX_TEXT} תווים`)

const itemsSchema = z.array(z.strictObject({
  itemId: z.uuid('ספר לא תקין'),
  quantity: z.number().int().min(1).max(999),
})).max(50)

export const newIssueSchema = z.strictObject({
  orderId: z.uuid('בחר הזמנה'),
  type: z.enum(ISSUE_TYPES, 'בחר סוג תקלה'),
  description: text('כתוב מה קרה'),
  via: z.enum(REPORTED_VIA).nullish(),
  items: itemsSchema.optional(),
})
export type NewIssue = z.infer<typeof newIssueSchema>

export const editIssueSchema = z.strictObject({
  type: z.enum(ISSUE_TYPES, 'בחר סוג תקלה'),
  description: text('כתוב מה קרה'),
  via: z.enum(REPORTED_VIA).nullish(),
  items: itemsSchema.optional(),
})
export type EditIssue = z.infer<typeof editIssueSchema>

export const statusChangeSchema = z.strictObject({
  status: z.enum(ISSUE_STATUSES, 'סטטוס לא תקין'),
  resolution: z.enum(RESOLUTIONS, 'בחר איך טופלה התקלה').nullish(),
}).refine(v => v.status !== 'resolved' || Boolean(v.resolution), {
  message: 'בחר איך טופלה התקלה', path: ['resolution'],
})
export type StatusChange = z.infer<typeof statusChangeSchema>

export const noteSchema = z.strictObject({ body: text('כתוב את ההערה') })

/** הרצת סכמה: השגיאה הראשונה בעברית, או הנתונים. */
export function parseWith<T>(schema: z.ZodType<T>, input: unknown): { error: string } | { data: T } {
  const r = schema.safeParse(input)
  if (r.success) return { data: r.data }
  return { error: r.error.issues[0]?.message || 'בקשה שגויה' }
}

// ── ספרים מושפעים ────────────────────────────────────────────────────────────

export type OrderItemRef = { id: string; title_snapshot: string; quantity: number }
export type AffectedItem = { item_id: string; title: string; quantity: number }

/**
 * ממיר בחירת ספרים לרשומה שנשמרת, מול פריטי ההזמנה בפועל.
 * 🔴 ספר שאינו בהזמנה נדחה — אחרת אפשר לשייך תקלה לפריט של הזמנה אחרת.
 * ⚠️ בסוגים שאין בהם ספרים (לא הגיע / אחר) — רשימה ריקה.
 */
export function resolveAffectedItems(
  type: IssueType,
  selected: { itemId: string; quantity: number }[] | undefined,
  orderItems: OrderItemRef[],
): { error: string } | { items: AffectedItem[] } {
  if (!ITEM_TYPES.includes(type) || !selected?.length) return { items: [] }
  const byId = new Map(orderItems.map(i => [i.id, i]))
  const seen = new Set<string>()
  const items: AffectedItem[] = []
  for (const s of selected) {
    const it = byId.get(s.itemId)
    if (!it) return { error: 'ספר שנבחר אינו בהזמנה' }
    if (seen.has(s.itemId)) continue
    seen.add(s.itemId)
    // ⚠️ "חסר"/"פגום" לא יכולים לעלות על מה שהוזמן — אבל ספר לא נכון
    // יכול. מגבילים רק כדי למנוע הקלדה שגויה בולטת.
    items.push({ item_id: it.id, title: it.title_snapshot, quantity: Math.min(s.quantity, Math.max(it.quantity, 1)) })
  }
  return { items }
}

// ── מעבר סטטוס ───────────────────────────────────────────────────────────────

/**
 * עדכון סטטוס + רשומת יומן. "טופל" חותם זמן, מטפל ואופן טיפול; יציאה
 * ממנו (פתיחה מחדש) מאפסת את שלושתם.
 */
export function buildStatusChange(
  current: { status: IssueStatus; resolution: Resolution | null },
  change: StatusChange,
  userId: string,
  now = new Date(),
): { error: string } | {
  patch: Record<string, unknown>
  event: { kind: 'status'; from_status: IssueStatus; to_status: IssueStatus; resolution: Resolution | null }
} {
  const resolution = change.status === 'resolved' ? change.resolution ?? null : null
  if (current.status === change.status && current.resolution === resolution) {
    return { error: 'הסטטוס לא השתנה' }
  }
  const iso = now.toISOString()
  return {
    patch: {
      status: change.status,
      resolution,
      resolved_at: change.status === 'resolved' ? iso : null,
      resolved_by: change.status === 'resolved' ? userId : null,
      updated_at: iso,
    },
    event: { kind: 'status', from_status: current.status, to_status: change.status, resolution },
  }
}

/** הודעת ההצלחה אחרי שינוי סטטוס — לפי האפיון. */
export function statusToast(status: IssueStatus): string {
  if (status === 'resolved') return 'התקלה סומנה כטופלה'
  if (status === 'cancelled') return 'התקלה בוטלה'
  return `הסטטוס עודכן ל'${ISSUE_STATUS_LABELS[status]}'`
}

/** שורת היומן לשינוי סטטוס. */
export function statusEventText(e: { from_status: string | null; to_status: string | null; resolution: string | null }): string {
  const to = e.to_status as IssueStatus | null
  if (!e.from_status) return `נפתח · ${ISSUE_STATUS_LABELS[to ?? 'open']}`
  if (to === 'resolved') {
    const r = e.resolution as Resolution | null
    return r ? `טופל · ${RESOLUTION_LABELS[r]}` : 'טופל'
  }
  if (to === 'cancelled') return 'בוטל'
  if (e.from_status === 'resolved' || e.from_status === 'cancelled') return `נפתח מחדש · ${ISSUE_STATUS_LABELS[to ?? 'open']}`
  return `שונה ל"${ISSUE_STATUS_LABELS[to ?? 'open']}"`
}

// ── סינון ────────────────────────────────────────────────────────────────────

export const CHIPS = ['active', 'open', 'in_progress', 'resolved', 'all'] as const
export type Chip = typeof CHIPS[number]
export const CHIP_LABELS: Record<Chip, string> = {
  active: 'פתוחות', open: 'פתוח', in_progress: 'בטיפול', resolved: 'טופל', all: 'הכל',
}

export function isActive(status: IssueStatus): boolean {
  return status === 'open' || status === 'in_progress'
}

/** "בוטל" מופיע רק תחת "הכל". */
export function matchesChip(status: IssueStatus, chip: Chip): boolean {
  if (chip === 'all') return true
  if (chip === 'active') return isActive(status)
  return status === chip
}

export function chipCounts(statuses: IssueStatus[]): Record<Chip, number> {
  const out = { active: 0, open: 0, in_progress: 0, resolved: 0, all: 0 } as Record<Chip, number>
  for (const s of statuses) for (const c of CHIPS) if (matchesChip(s, c)) out[c]++
  return out
}

export type IssueFilters = { chip: Chip; type: IssueType | ''; from: string; to: string; q: string }

/** מסננים מה-URL (המסך שומר אותם שם). ערך לא תקין — מתעלמים. */
export function parseFilters(get: (k: string) => string | null | undefined): IssueFilters {
  const chip = get('status')
  const type = get('type')
  return {
    chip: (CHIPS as readonly string[]).includes(chip ?? '') ? chip as Chip : 'active',
    type: (ISSUE_TYPES as readonly string[]).includes(type ?? '') ? type as IssueType : '',
    from: parseDay(get('from')) ?? '',
    to: parseDay(get('to')) ?? '',
    q: String(get('q') ?? '').slice(0, 60),
  }
}

export function filtersToQuery(f: IssueFilters): string {
  const p = new URLSearchParams()
  if (f.chip !== 'active') p.set('status', f.chip)
  if (f.type) p.set('type', f.type)
  if (f.from) p.set('from', f.from)
  if (f.to) p.set('to', f.to)
  if (f.q.trim()) p.set('q', f.q.trim())
  return p.toString()
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

/** תחילת היום שאחרי — לסינון "עד" כולל. */
export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// ── זמנים ────────────────────────────────────────────────────────────────────

/** ימים שלמים מאז הפתיחה (לפי לוח השנה, לא 24 שעות). */
export function daysSince(iso: string, now = new Date()): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.max(0, Math.round((day(now) - day(new Date(iso))) / 864e5))
}

export function agoLabel(days: number): string {
  if (days === 0) return 'היום'
  if (days === 1) return 'אתמול'
  return `לפני ${days} ימים`
}

export function lateDays(status: IssueStatus, createdAt: string, now = new Date()): number | null {
  if (!isActive(status)) return null
  const d = daysSince(createdAt, now)
  return d > LATE_AFTER_DAYS ? d : null
}
