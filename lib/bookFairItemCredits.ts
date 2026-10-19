import { normalizeHeader } from '@/lib/bookFairImport'
import { PAID } from '@/lib/bookFairStats'
import { refundNote, type RefundReturn } from '@/lib/bookFairSold'
import { creditKey, creditStatusLabel, formatShekels, normalizeCreditPhone, normalizeEmail, safeCell, type CreditChannel } from '@/lib/bookFairCredits'

// ─────────────────────────────────────────────────────────────────────────────
// יריד ספרים — סימון ספרים שזוכו בהזמנה (ברמת מערכת ההזמנות בלבד).
// אין כאן כסף ואין מלאי: זה רק כדי לדעת כמה נמכר בפועל.
// הסימון נכנס לחישוב "נמכר" כמו עותק שהוחזר בזיכוי חלקי (ראו creditsAsReturns),
// ולכן הקטלוג, ההתחשבנות, לוח הבקרה ותג "זוכה" בכרטיס ההזמנה מתעדכנים יחד.
// הקובץ טהור: בלי מסד ובלי רשת.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedItemCredit { line: number; order_number: string; book: string; quantity: number }
export interface ItemCreditError { line: number; message: string }

const HEADER_ALIASES = {
  order: ['מספר הזמנה', 'הזמנה', 'מס הזמנה', 'מספר', 'order', 'order number'],
  book: ['שם ספר', 'שם הספר', 'ספר', 'כותר', 'book', 'title'],
  qty: ['כמות', 'כמות לזיכוי', 'עותקים', 'qty', 'quantity'],
}
type Field = keyof typeof HEADER_ALIASES

const MAX_QTY = 1000
const cell = (v: unknown) => String(v ?? '').replace(/[‏‪-‮⁦-⁩]/g, '').trim()

function fieldOf(header: string): Field | null {
  const h = normalizeHeader(header)
  if (!h) return null
  for (const f of Object.keys(HEADER_ALIASES) as Field[]) {
    if (HEADER_ALIASES[f].some(a => normalizeHeader(a) === h)) return f
  }
  return null
}

/** מספר הזמנה מאקסל: מסיר רווחים, "#" ו-".0" של תא מספרי. */
export function cleanOrderNumber(v: unknown): string {
  return cell(v).replace(/^#/, '').replace(/\.0+$/, '').replace(/\s+/g, '')
}

/** שם ספר לצורך השוואה. ⚠️ זהה לנרמול של creditMentions ב-bookFairUnsupplied. */
export const normTitle = (s: string) => s.replace(/["'״׳`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase()

export function parseItemCreditsTable(rows: unknown[][]): {
  credits: ParsedItemCredit[]; errors: ItemCreditError[]; missingColumns: string[]
} {
  const credits: ParsedItemCredit[] = []
  const errors: ItemCreditError[] = []
  const headerIdx = rows.findIndex(r => r.some(c => fieldOf(cell(c))))
  if (headerIdx < 0) return { credits, errors, missingColumns: ['מספר הזמנה', 'שם ספר'] }

  const col: Partial<Record<Field, number>> = {}
  rows[headerIdx].forEach((c, i) => {
    const f = fieldOf(cell(c))
    if (f && col[f] === undefined) col[f] = i
  })
  const missing: string[] = []
  if (col.order === undefined) missing.push('מספר הזמנה')
  if (col.book === undefined) missing.push('שם ספר')
  if (missing.length) return { credits, errors, missingColumns: missing }

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r.some(c => cell(c))) continue
    const line = i + 1
    const order_number = cleanOrderNumber(r[col.order!])
    const book = cell(r[col.book!]).replace(/\s+/g, ' ')
    if (!order_number) { errors.push({ line, message: 'חסר מספר הזמנה' }); continue }
    if (!book) { errors.push({ line, message: 'חסר שם ספר' }); continue }
    let quantity = 1
    if (col.qty !== undefined) {
      const raw = cell(r[col.qty])
      if (raw) {
        const n = Number(raw)
        if (!Number.isInteger(n) || n < 1 || n > MAX_QTY) { errors.push({ line, message: `כמות לא תקינה: ${raw}` }); continue }
        quantity = n
      }
    }
    credits.push({ line, order_number, book: book.slice(0, 200), quantity })
  }
  return { credits, errors, missingColumns: [] }
}

export const UNPAID_ORDER_ERROR = 'ההזמנה אינה בסטטוס ששולם, ולכן אינה נספרת כמכירה'

export function isOrderPaid(status: string): boolean {
  return (PAID as readonly string[]).includes(status)
}

export interface CreditOrder { id: string; order_number: string | null; status: string }
export interface CreditItem { id: string; order_id: string; book_id: string | null; title_snapshot: string; quantity: number }
export interface MatchedCredit {
  order_id: string; order_number: string; item_id: string; book_id: string | null
  title: string; quantity: number; lines: number[]
}
export interface UnmatchedCredit { line: number; order_number: string; book: string; reason: string }

/** שורות הזמנה שהשם שהוקלד מתאים להן: זהה אחרי נרמול, ואם אין — הכלה של אחד בשני. */
function candidates(items: CreditItem[], book: string): { items: CreditItem[]; ambiguous: boolean } {
  const b = normTitle(book)
  if (b.length < 2) return { items: [], ambiguous: false }
  const exact = items.filter(i => normTitle(i.title_snapshot) === b)
  if (exact.length) return { items: exact, ambiguous: false }
  const loose = items.filter(i => {
    const t = normTitle(i.title_snapshot)
    return t.includes(b) || (t.length >= 2 && b.includes(t))
  })
  // כמה כותרים שונים מתאימים: לא מנחשים
  return { items: loose, ambiguous: new Set(loose.map(i => normTitle(i.title_snapshot))).size > 1 }
}

/**
 * התאמת שורות האקסל לשורות ההזמנה. הקובץ *קובע* את הכמות המזוכה בשורה
 * (ולא מוסיף עליה), כך שהעלאה חוזרת של אותו קובץ אינה מכפילה.
 * כמה שורות באקסל לאותו ספר באותה הזמנה מצטברות.
 */
export function matchItemCredits(
  credits: ParsedItemCredit[], orders: CreditOrder[], items: CreditItem[],
): { matched: MatchedCredit[]; unmatched: UnmatchedCredit[] } {
  const byNumber = new Map(orders.filter(o => o.order_number).map(o => [o.order_number!, o]))
  const itemsByOrder = new Map<string, CreditItem[]>()
  for (const i of items) itemsByOrder.set(i.order_id, [...(itemsByOrder.get(i.order_id) ?? []), i])

  const used = new Map<string, number>() // item_id ← כמה כבר הוקצו מהקובץ
  const out = new Map<string, MatchedCredit>()
  const unmatched: UnmatchedCredit[] = []

  for (const c of credits) {
    const fail = (reason: string) => unmatched.push({ line: c.line, order_number: c.order_number, book: c.book, reason })
    const order = byNumber.get(c.order_number)
    if (!order) { fail('מספר הזמנה לא נמצא'); continue }
    if (!isOrderPaid(order.status)) { fail(UNPAID_ORDER_ERROR); continue }
    const cand = candidates(itemsByOrder.get(order.id) ?? [], c.book)
    if (!cand.items.length) { fail('שם הספר לא נמצא בהזמנה'); continue }
    if (cand.ambiguous) { fail('השם מתאים לכמה ספרים בהזמנה. כתבו את השם המלא'); continue }

    let left = c.quantity
    const take: [CreditItem, number][] = []
    for (const it of cand.items) {
      const n = Math.min(left, it.quantity - (used.get(it.id) ?? 0))
      if (n > 0) { take.push([it, n]); left -= n }
    }
    if (left > 0) { fail('הכמות גדולה ממה שהוזמן'); continue }
    for (const [it, n] of take) {
      used.set(it.id, (used.get(it.id) ?? 0) + n)
      const m = out.get(it.id) ?? {
        order_id: order.id, order_number: c.order_number, item_id: it.id, book_id: it.book_id,
        title: it.title_snapshot, quantity: 0, lines: [],
      }
      m.quantity += n
      m.lines.push(c.line)
      out.set(it.id, m)
    }
  }
  return { matched: [...out.values()], unmatched }
}

/** סימוני הזיכוי כשורות החזרה, כדי שכל חישובי "נמכר" יתייחסו אליהם כמו לזיכוי חלקי. */
export function creditsAsReturns(rows: { order_number: string; book_id: string | null; quantity: number }[]): RefundReturn[] {
  return rows.map(r => ({ book_id: r.book_id, delta: r.quantity, note: refundNote(r.order_number) }))
}

// ─── אקסל להעלאה ב"זיכוי על ספרים חסרים" ───────────────────────────────────
// שורה אחת לכל לקוח, בכותרות שהייבוא של מסך הזיכויים מזהה (parseCreditsTable).
// "הזמנות" ו"סטטוס זיכוי" לא מוכרות לייבוא ולכן נבלעות בהעלאה.

export interface CreditedLine {
  order_number: string | null; customer_name: string | null; customer_phone: string | null; customer_email: string | null
  title: string; quantity: number; unit_price_agorot: number
}
export interface ExistingCredit { channel: CreditChannel; phone: string | null; email: string | null; status: string; transferred_at: string | null }
export interface CreditUploadRow {
  name: string | null; phone: string | null; email: string | null; channel: CreditChannel | null
  books: string; amount_agorot: number; orders: string; status: string
}

export const CREDIT_UPLOAD_HEADERS = ['שם', 'טלפון', 'מייל', 'ספרים', 'סכום', 'ערוץ', 'הזמנות', 'סטטוס זיכוי'] as const
export const NOT_UPLOADED = 'לא הועלה'
export const NO_CONTACT = 'חסר טלפון או מייל'

/** מאחד את הספרים שזוכו לשורה לכל לקוח (מייל, ואם אין אז טלפון), עם הסכום המלא והסטטוס של זיכוי קיים. */
export function buildCreditUploadRows(lines: CreditedLine[], existing: ExistingCredit[]): CreditUploadRow[] {
  const statusByKey = new Map(existing.map(c => [creditKey(c), creditStatusLabel(c.status, c.transferred_at)]))
  const groups = new Map<string, { row: CreditUploadRow; books: Map<string, { title: string; qty: number }>; orders: Set<string> }>()
  for (const l of lines) {
    const email = normalizeEmail(l.customer_email)
    const phone = normalizeCreditPhone(l.customer_phone)
    const channel: CreditChannel | null = email ? 'email' : phone ? 'phone' : null
    const key = channel ? creditKey({ channel, phone, email }) : `o:${l.order_number}`
    let g = groups.get(key)
    if (!g) {
      g = {
        row: { name: null, phone, email, channel, books: '', amount_agorot: 0, orders: '', status: channel ? statusByKey.get(key) ?? NOT_UPLOADED : NO_CONTACT },
        books: new Map(), orders: new Set(),
      }
      groups.set(key, g)
    }
    g.row.name ||= l.customer_name?.trim() || null
    g.row.phone ||= phone
    g.row.amount_agorot += l.unit_price_agorot * l.quantity
    if (l.order_number) g.orders.add(l.order_number)
    const t = normTitle(l.title)
    const b = g.books.get(t) ?? { title: l.title.trim(), qty: 0 }
    b.qty += l.quantity
    g.books.set(t, b)
  }
  return [...groups.values()].map(({ row, books, orders }) => ({
    ...row,
    books: [...books.values()].map(b => (b.qty > 1 ? `${b.title} ×${b.qty}` : b.title)).join(', '),
    orders: [...orders].join(', '),
  }))
}

/** התאים של שורה, לפי הסדר של CREDIT_UPLOAD_HEADERS. */
export function creditUploadCells(r: CreditUploadRow): (string | number)[] {
  return [
    safeCell(r.name), r.phone ?? '', r.email ?? '', safeCell(r.books), Number(formatShekels(r.amount_agorot)),
    r.channel === 'phone' ? 'טלפון' : r.channel === 'email' ? 'מייל' : '', r.orders, r.status,
  ]
}
