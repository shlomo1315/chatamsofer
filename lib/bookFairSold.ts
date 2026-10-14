// ─────────────────────────────────────────────────────────────────────────────
// יריד: כמה נמכר מכל ספר, לפי ערוץ. מקור חישוב אחד לקטלוג ולהתחשבנות
// (בקשת שלמה 14.10: "החישוב חייב להיות מדויק ברמת הספר").
//
// 🔴 הפערים שנמצאו לפני המודול הזה:
//   • הקטלוג לא ספר הזמנות "זוכה חלקית", וההתחשבנות ספרה אותן במלואן.
//   • עותקים שהוחזרו בזיכוי חלקי (חזרו למלאי) נספרו עדיין כנמכרו.
//   • לוח הבקרה קיבץ לפי שם הספר בהזמנה, וספר ששמו תוקן בקטלוג פוצל לשתי שורות.
//
// הכללים:
//   • מכירה = הזמנה בסטטוס ששולם (PAID), כולל "זוכה חלקית". מבוטלת, נטושה
//     וזוכתה במלואה אינן מכירה. הזמנות משרד אין בהן שורות ספרים.
//   • עותק שהוחזר בזיכוי חלקי יורד מהערוץ של ההזמנה. המקור: יומן המלאי
//     (reason='refund', note='זיכוי הזמנה <מספר>'), כי הזיכוי אינו נרשם בשורה.
//     ⚠️ מכירת דוכן אינה חוזרת למלאי אוטומטית, ולכן זיכוי חלקי בדוכן מתוקן
//     רק בהתאמה ידנית.
//   • ההתאמה הידנית (book_fair_sold_adjustments) היא תיקון לדוכן, ולכן
//     נכנסת לערוץ הדוכן. דוכן + אתר + טלפון = סך הכל, תמיד.
// ─────────────────────────────────────────────────────────────────────────────

import { PAID } from './bookFairStats'

export type SoldChannel = 'fair' | 'phone' | 'web'

export interface SoldOrder { id: string; status: string; channel: string; order_number: string | null }
export interface SoldItem { order_id: string; book_id: string | null; quantity: number; line_total_agorot: number }
/** שורת יומן מלאי של החזרה בזיכוי (reason='refund'). */
export interface RefundReturn { book_id: string | null; delta: number; note: string | null }
export interface SoldAdjustmentInput { book_id: string; delta: number; amount_agorot?: number }

export interface BookSold {
  /** דוכן לפי ההזמנות, לפני ההתאמה הידנית. */
  fairOrders: number
  /** ההתאמה הידנית (שלילי = נמכר פחות). */
  adj: number
  /** דוכן כולל ההתאמה. */
  fair: number
  phone: number
  web: number
  /** עותקים שהוחזרו בזיכוי חלקי ואינם נספרים. */
  returned: number
  /** fair + phone + web. */
  total: number
  /** נגבה על העותקים שנספרו, כולל סכום ההתאמה. */
  collected: number
}

/** ההערה שמסך הזיכוי כותב ביומן המלאי. ⚠️ חייבת להיות זהה ל-refund/route.ts. */
export const refundNote = (orderNumber: string) => `זיכוי הזמנה ${orderNumber}`
const REFUND_NOTE = /^זיכוי הזמנה (.+)$/

const isSold = (status: string) => (PAID as readonly string[]).includes(status)
const channelOf = (c: string): SoldChannel | null => (c === 'fair' || c === 'phone' || c === 'web' ? c : null)

const empty = (): BookSold => ({ fairOrders: 0, adj: 0, fair: 0, phone: 0, web: 0, returned: 0, total: 0, collected: 0 })

/** מספר הזמנה|ספר ← כמה עותקים הוחזרו בזיכוי. */
function returnsByOrderBook(returns: RefundReturn[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of returns) {
    const m = REFUND_NOTE.exec(r.note ?? '')
    if (!m || !r.book_id || !(r.delta > 0)) continue
    const key = `${m[1]}|${r.book_id}`
    out.set(key, (out.get(key) ?? 0) + r.delta)
  }
  return out
}

/**
 * כמות ונגבה לכל ספר שנמכר או שיש לו התאמה.
 * ⚠️ ההחזרה מוגבלת למה שנקנה באותה הזמנה, כך שהכמות לעולם לא שלילית
 * בגלל החזרות. התאמה ידנית כן יכולה להוריד את הדוכן מתחת ל-0, וזה מוצג.
 */
export function computeSold(
  orders: SoldOrder[], items: SoldItem[], returns: RefundReturn[], adjustments: SoldAdjustmentInput[],
): Record<string, BookSold> {
  const sold = new Map(orders.filter(o => isSold(o.status) && channelOf(o.channel)).map(o => [o.id, o]))
  const returned = returnsByOrderBook(returns)

  // הזמנה+ספר ← כמות וסכום (ספר יכול להופיע בכמה שורות באותה הזמנה)
  const lines = new Map<string, { order: SoldOrder; bookId: string; qty: number; amount: number }>()
  for (const i of items) {
    const order = sold.get(i.order_id)
    if (!order || !i.book_id) continue
    const key = `${i.order_id}|${i.book_id}`
    const l = lines.get(key) ?? { order, bookId: i.book_id, qty: 0, amount: 0 }
    l.qty += Number(i.quantity) || 0
    l.amount += Number(i.line_total_agorot) || 0
    lines.set(key, l)
  }

  const out: Record<string, BookSold> = {}
  for (const l of lines.values()) {
    const back = Math.min(l.qty, l.order.order_number ? returned.get(`${l.order.order_number}|${l.bookId}`) ?? 0 : 0)
    const qty = l.qty - back
    const s = (out[l.bookId] ??= empty())
    const ch = channelOf(l.order.channel)!
    if (ch === 'fair') s.fairOrders += qty
    else s[ch] += qty
    s.returned += back
    s.collected += l.qty ? Math.round(l.amount * qty / l.qty) : 0
  }

  for (const a of adjustments) {
    const s = (out[a.book_id] ??= empty())
    s.adj += a.delta
    s.collected += a.amount_agorot ?? 0
  }

  for (const s of Object.values(out)) {
    s.fair = s.fairOrders + s.adj
    s.total = s.fair + s.phone + s.web
    s.collected = Math.max(0, s.collected)
  }
  return out
}

/**
 * הפריטים אחרי הורדת העותקים שהוחזרו — ללוח הבקרה ולדוכן, כדי שגם שם
 * "ספרים שנמכרו" יהיה זהה לקטלוג. שורה שהוחזרה במלואה נעלמת.
 */
export function itemsAfterReturns<T extends SoldItem>(
  orders: Pick<SoldOrder, 'id' | 'order_number'>[], items: T[], returns: RefundReturn[],
): T[] {
  const left = returnsByOrderBook(returns)
  if (!left.size) return items
  const numberOf = new Map(orders.map(o => [o.id, o.order_number]))
  const out: T[] = []
  for (const i of items) {
    const num = numberOf.get(i.order_id)
    const key = `${num}|${i.book_id}`
    const back = Math.min(i.quantity, num && i.book_id ? left.get(key) ?? 0 : 0)
    if (!back) { out.push(i); continue }
    left.set(key, (left.get(key) ?? 0) - back)
    const qty = i.quantity - back
    if (qty <= 0) continue
    out.push({ ...i, quantity: qty, line_total_agorot: Math.round(i.line_total_agorot * qty / i.quantity) })
  }
  return out
}
