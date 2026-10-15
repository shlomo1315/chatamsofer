// ─────────────────────────────────────────────────────────────────────────────
// יריד: כמה כל מחבר/מכון/מו"ל אמור לקבל = עותקים שנמכרו × מחיר לעותק.
// המחירים: lib/bookFairAuthorRatesData.ts. הכמות: computeSold (lib/bookFairSold.ts),
// כלומר אחרי זיכויים והחזרות, ודוכן + אתר + טלפון.
//
// הכללים:
//   • התאמה בין ספר בקובץ לספר בקטלוג רק לפי שם זהה אחרי נרמול (גרשיים, מקפים,
//     רווחים). בלי ניחושים: שם שלא נמצא, או שנמצא בכמה ספרים, מדווח בנפרד.
//   • "ללא מחבר / מו"ל" אינו משולם ומוצג בנפרד.
//   • שורה בלי מחיר מדולגת ומדווחת.
// ─────────────────────────────────────────────────────────────────────────────

import { NO_PARTY } from './bookFairSettlement'
import type { AuthorRateRow } from './bookFairAuthorRatesData'

export interface RateBook { id: string; title: string }
export interface PayoutBookLine { bookId: string; title: string; qty: number; priceAgorot: number; amountAgorot: number }
export interface PayoutParty { party: string; qty: number; amountAgorot: number; books: PayoutBookLine[] }
export interface UnpaidLine { bookId: string; title: string; qty: number }
export interface UnmatchedRate { party: string; title: string; reason: 'not_found' | 'ambiguous' | 'duplicate' }

export interface AuthorPayouts {
  parties: PayoutParty[]
  totalAgorot: number
  totalQty: number
  /** ספרי "ללא מחבר / מו"ל" שנמכרו: לא משולמים. */
  unpaid: UnpaidLine[]
  /** שורות בקובץ שלא הותאמו בוודאות לספר בקטלוג: ממתינות לאישור. */
  unmatched: UnmatchedRate[]
  /** שורות בקובץ בלי מחיר (למשל "פגום"): מדולגות. */
  skipped: { party: string; title: string }[]
  /** ספרים שנמכרו בקטלוג ואין להם שורה בקובץ המחירים. */
  unpriced: UnpaidLine[]
}

/** נרמול שם ספר להשוואה: גרשיים ומקפים אחידים, רווחים מכווצים. */
export function normalizeTitle(s: string): string {
  return s
    .replace(/[׳״‘’“”'"`´]/g, '')
    .replace(/[־‐-―−\-]/g, ' ')
    .replace(/[֑-ׇ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const agorot = (shekels: number) => Math.round(shekels * 100)

export function computeAuthorPayouts(
  rates: readonly AuthorRateRow[], books: RateBook[], soldQty: Record<string, number>,
): AuthorPayouts {
  const byTitle = new Map<string, RateBook[]>()
  for (const b of books) {
    const k = normalizeTitle(b.title)
    byTitle.set(k, [...(byTitle.get(k) ?? []), b])
  }

  const parties = new Map<string, PayoutParty>()
  const unpaid: UnpaidLine[] = []
  const unmatched: UnmatchedRate[] = []
  const skipped: { party: string; title: string }[] = []
  const covered = new Set<string>()

  for (const [party, title, price] of rates) {
    if (price === null || !Number.isFinite(price)) { skipped.push({ party, title }); continue }
    const found = byTitle.get(normalizeTitle(title)) ?? []
    if (found.length !== 1) { unmatched.push({ party, title, reason: found.length ? 'ambiguous' : 'not_found' }); continue }
    const book = found[0]
    if (covered.has(book.id)) { unmatched.push({ party, title, reason: 'duplicate' }); continue }
    covered.add(book.id)
    const qty = soldQty[book.id] ?? 0
    if (party === NO_PARTY) { if (qty) unpaid.push({ bookId: book.id, title: book.title, qty }); continue }
    const priceAgorot = agorot(price)
    const p = parties.get(party) ?? { party, qty: 0, amountAgorot: 0, books: [] }
    p.books.push({ bookId: book.id, title: book.title, qty, priceAgorot, amountAgorot: qty * priceAgorot })
    p.qty += qty
    p.amountAgorot += qty * priceAgorot
    parties.set(party, p)
  }

  const unpriced = books
    .filter(b => !covered.has(b.id) && (soldQty[b.id] ?? 0) > 0)
    .map(b => ({ bookId: b.id, title: b.title, qty: soldQty[b.id] }))

  const list = [...parties.values()].sort((a, b) => b.amountAgorot - a.amountAgorot || a.party.localeCompare(b.party, 'he'))
  return {
    parties: list,
    totalAgorot: list.reduce((s, p) => s + p.amountAgorot, 0),
    totalQty: list.reduce((s, p) => s + p.qty, 0),
    unpaid, unmatched, skipped, unpriced,
  }
}
