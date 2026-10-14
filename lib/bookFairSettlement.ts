// ─────────────────────────────────────────────────────────────────────────────
// התחשבנות עם מחברים/מכונים/מו"לים ביריד (בקשת שלמה 14.10).
//
// לכל ספר: כמה עותקים נמכרו, כמה נגבה, וכמה מגיע לגורם אחרי הפחתת 5%.
// לכל גורם: סיכום הספרים שלו, כמה כבר שולם לו ובאיזו דרך, והיתרה.
//
// 🔴 "נמכר" כולל את ההתאמות הידניות (book_fair_sold_adjustments): תיקון
// לדוכן בלי לגעת בהזמנות. ההתאמה מתקנת גם את הכמות וגם את הסכום.
//
// ⚠️ הגורם = מו"ל, ואם אין — מחבר. ספר בלי שניהם נכנס ל"ללא מחבר/מו"ל".
// ⚠️ הכל באגורות שלמות; העיגול רק בהפחתה (לאגורה הקרובה).
// ─────────────────────────────────────────────────────────────────────────────

export const SETTLEMENT_REDUCTION = 0.05
export const NO_PARTY = 'ללא מחבר/מו"ל'

export const PAYMENT_METHODS = ['transfer', 'check', 'cash', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: 'העברה בנקאית',
  check: "צ'ק",
  cash: 'מזומן',
  other: 'אחר',
}

export interface SettlementBook {
  id: string
  sku: string | null
  title: string
  author: string | null
  publisher: string | null
}
export interface BookSale { book_id: string; qty: number; collected_agorot: number }
export interface SoldAdjustment { book_id: string; delta: number; amount_agorot: number }
export interface AuthorPayment {
  id: string
  payee: string
  amount_agorot: number
  method: PaymentMethod
  paid_on: string
  note: string | null
  cancelled_at: string | null
}

export interface SettlementRow {
  bookId: string
  sku: string | null
  title: string
  author: string | null
  publisher: string | null
  party: string
  /** נמכר לפי ההזמנות, לפני התאמה. */
  orderedQty: number
  /** סך ההתאמות הידניות (שלילי = נמכר פחות). */
  adjQty: number
  qty: number
  collected: number
  net: number
}

export interface PartyRow {
  party: string
  books: number
  qty: number
  collected: number
  net: number
  paid: number
  balance: number
  /** כמה שולם בכל אמצעי. */
  byMethod: Partial<Record<PaymentMethod, number>>
}

/** סכום אחרי הפחתת 5%, באגורות שלמות. */
export function netOf(agorot: number): number {
  return Math.round(agorot * (1 - SETTLEMENT_REDUCTION))
}

export function partyOf(b: Pick<SettlementBook, 'author' | 'publisher'>): string {
  return b.publisher?.trim() || b.author?.trim() || NO_PARTY
}

/** התאמות לפי ספר: סך הכמות וסך הסכום. */
export function sumAdjustments(adj: SoldAdjustment[]): Record<string, { qty: number; amount: number }> {
  const out: Record<string, { qty: number; amount: number }> = {}
  for (const a of adj) {
    const s = (out[a.book_id] ??= { qty: 0, amount: 0 })
    s.qty += a.delta
    s.amount += a.amount_agorot
  }
  return out
}

/**
 * שורה לכל ספר שנמכר או שיש לו התאמה.
 * ⚠️ כמות וסכום לעולם לא יורדים מתחת ל-0, גם אם ההתאמה גדולה מהמכירות.
 */
export function buildBookRows(
  books: SettlementBook[], sales: BookSale[], adjustments: SoldAdjustment[],
): SettlementRow[] {
  const saleBy = new Map(sales.map(s => [s.book_id, s]))
  const adjBy = sumAdjustments(adjustments)
  const rows: SettlementRow[] = []
  for (const b of books) {
    const s = saleBy.get(b.id)
    const a = adjBy[b.id]
    if (!s && !a) continue
    const orderedQty = Number(s?.qty ?? 0)
    const adjQty = a?.qty ?? 0
    const collected = Math.max(0, Number(s?.collected_agorot ?? 0) + (a?.amount ?? 0))
    rows.push({
      bookId: b.id, sku: b.sku, title: b.title, author: b.author, publisher: b.publisher,
      party: partyOf(b),
      orderedQty, adjQty,
      qty: Math.max(0, orderedQty + adjQty),
      collected,
      net: netOf(collected),
    })
  }
  return rows.sort((x, y) => x.party.localeCompare(y.party, 'he') || x.title.localeCompare(y.title, 'he'))
}

/**
 * סיכום לפי גורם. גורם שיש לו תשלומים אך אין לו מכירות עדיין מופיע (יתרה שלילית
 * = שולם יותר מהמגיע). תשלום שבוטל אינו נספר.
 * ⚠️ ה-net של הגורם = סכום ה-net של הספרים שלו, כדי שהטבלאות יסתכמו זו לזו.
 */
export function groupByParty(rows: SettlementRow[], payments: AuthorPayment[]): PartyRow[] {
  const map = new Map<string, PartyRow>()
  const get = (party: string) => {
    let p = map.get(party)
    if (!p) { p = { party, books: 0, qty: 0, collected: 0, net: 0, paid: 0, balance: 0, byMethod: {} }; map.set(party, p) }
    return p
  }
  for (const r of rows) {
    const p = get(r.party)
    p.books++
    p.qty += r.qty
    p.collected += r.collected
    p.net += r.net
  }
  for (const pay of payments) {
    if (pay.cancelled_at) continue
    const p = get(pay.payee)
    p.paid += pay.amount_agorot
    p.byMethod[pay.method] = (p.byMethod[pay.method] ?? 0) + pay.amount_agorot
  }
  for (const p of map.values()) p.balance = p.net - p.paid
  return [...map.values()].sort((a, b) => b.net - a.net || a.party.localeCompare(b.party, 'he'))
}

export type PartyStatus = 'missing' | 'paid' | 'partial' | 'unpaid'
export const PARTY_STATUS_LABELS: Record<PartyStatus, string> = {
  missing: 'חסר שיוך', paid: 'שולם', partial: 'שולם חלקית', unpaid: 'טרם שולם',
}

/** מצב התשלום של גורם. "ללא מחבר/מו"ל" תמיד חסר שיוך, כדי שישלימו בקטלוג. */
export function partyStatus(p: Pick<PartyRow, 'party' | 'paid' | 'balance'>): PartyStatus {
  if (p.party === NO_PARTY) return 'missing'
  if (p.balance <= 0) return 'paid'
  return p.paid > 0 ? 'partial' : 'unpaid'
}
