import { normalizePhone } from '@/lib/kvitel'
import { refundNote, type RefundReturn } from '@/lib/bookFairSold'

// ─────────────────────────────────────────────────────────────────────────────
// יריד ספרים — ספרים שלא סופקו בהזמנה, והאם זוכו (בקשה #60, חלק 4).
//
// אין עמודה "לא סופק" בשורת ההזמנה, ולכן הרשימה נגזרת משלושה מקורות:
//   • זיכוי חלקי בתוך ההזמנה: יומן המלאי (reason='refund', note='זיכוי הזמנה <מספר>').
//   • טבלת הזיכויים (book_fair_credits): שורה של אותו לקוח (טלפון / מייל)
//     ששם הספר מופיע ברשימת הספרים שלה (טקסט חופשי מהאקסל).
//   • ספר שסומן "בעייתי במלאי" ועדיין לא זוכה.
// ⚠️ "זוכה" = הכסף הוחזר בהזמנה. טבלת הזיכויים אינה רושמת העברה בפועל,
//    ולכן שורה שם היא "בתהליך זיכוי" עם הסטטוס שלה.
// הקובץ טהור: בלי מסד ובלי רשת.
// ─────────────────────────────────────────────────────────────────────────────

export type CreditState = 'done' | 'in_progress' | 'none'

export interface UnsuppliedOrder { order_number: string; customer_phone?: string | null; customer_email?: string | null }
export interface UnsuppliedItem { id: string; book_id?: string | null; title_snapshot: string; quantity: number }
export interface UnsuppliedCredit { id: string; phone: string | null; email: string | null; books: string; amount_agorot: number; status: string }

export interface UnsuppliedLine {
  itemId: string
  title: string
  quantity: number
  state: CreditState
  /** פירוט קצר לתצוגה: איך זוכה, או למה נחשב לא סופק. */
  detail: string
}

export interface UnsuppliedResult {
  lines: UnsuppliedLine[]
  /** זיכויים של הלקוח שלא הותאמו לאף ספר בהזמנה (שם הספר באקסל שונה). */
  otherCredits: UnsuppliedCredit[]
}

export const CREDIT_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לשליחה', sent: 'נשלח ללקוח', send_failed: 'השליחה נכשלה',
  answered: 'הלקוח ענה', details_entered: 'פרטי הבנק נקלטו',
}

const norm = (s: string) => s.replace(/["'״׳`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase()

/** האם שם הספר מופיע ברשימת הספרים של הזיכוי (מופרדת בפסיקים / נקודה-פסיק / שורות). */
export function creditMentions(books: string, title: string): boolean {
  const t = norm(title)
  if (t.length < 2) return false
  if (norm(books).includes(t)) return true
  return books.split(/[,;\n/|،]+/).map(norm).some(p => p.length >= 2 && t.includes(p))
}

/** זיכוי ששייך ללקוח של ההזמנה, לפי טלפון או מייל. */
export function creditBelongsTo(c: UnsuppliedCredit, o: UnsuppliedOrder): boolean {
  const phone = o.customer_phone ? normalizePhone(o.customer_phone) : null
  const email = o.customer_email?.trim().toLowerCase() || null
  return (!!phone && c.phone === phone) || (!!email && c.email === email)
}

export function unsuppliedBooks(
  order: UnsuppliedOrder,
  items: UnsuppliedItem[],
  returns: RefundReturn[],
  credits: UnsuppliedCredit[],
  problemBookIds: Set<string>,
): UnsuppliedResult {
  const note = refundNote(order.order_number)
  const returned = new Map<string, number>()
  for (const r of returns) {
    if (r.note !== note || !r.book_id || !(r.delta > 0)) continue
    returned.set(r.book_id, (returned.get(r.book_id) ?? 0) + r.delta)
  }

  const mine = credits.filter(c => creditBelongsTo(c, order))
  const used = new Set<string>()
  const lines: UnsuppliedLine[] = []

  for (const it of items) {
    const back = it.book_id ? Math.min(it.quantity, returned.get(it.book_id) ?? 0) : 0
    if (back > 0 && it.book_id) returned.set(it.book_id, (returned.get(it.book_id) ?? 0) - back)
    const credit = mine.find(c => creditMentions(c.books, it.title_snapshot))
    if (credit) used.add(credit.id)
    const problem = !!it.book_id && problemBookIds.has(it.book_id)

    if (back > 0) {
      lines.push({ itemId: it.id, title: it.title_snapshot, quantity: back, state: 'done', detail: 'זוכה בהזמנה' })
    } else if (credit) {
      lines.push({
        itemId: it.id, title: it.title_snapshot, quantity: it.quantity, state: 'in_progress',
        detail: `זיכוי ללקוח: ${CREDIT_STATUS_LABELS[credit.status] ?? credit.status}`,
      })
    } else if (problem) {
      lines.push({ itemId: it.id, title: it.title_snapshot, quantity: it.quantity, state: 'none', detail: 'סומן בעייתי במלאי' })
    }
  }

  return { lines, otherCredits: mine.filter(c => !used.has(c.id)) }
}
