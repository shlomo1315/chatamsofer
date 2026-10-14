import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import PageHeader from '@/components/ui/PageHeader'
import type { AuthorPayment, BookSale, SettlementBook } from '@/lib/bookFairSettlement'
import SettlementClient, { type AdjustmentLog, type PaymentLog } from './SettlementClient'

// התחשבנות עם מחברים/מכונים/מו"לים (בקשת שלמה 14.10).
// החישוב: lib/bookFairSettlement.ts · מיגרציה: 20261014_book_fair_settlement.sql
//
// ⚠️ לקוח השירות רק אחרי guardPage - הטבלאות פתוחות ל-service_role בלבד.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'התחשבנות - יריד הספרים' }

type Res<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
type Named = { full_name: string | null } | { full_name: string | null }[] | null
const nameOf = (p: Named) => (Array.isArray(p) ? p[0]?.full_name : p?.full_name) ?? null

async function load() {
  const empty = { books: [], sales: [], adjustments: [], payments: [], error: null as string | null }
  if (!isSupabaseConfigured()) return empty
  const db = getServiceClient() ?? await createClient()

  type Book = SettlementBook & { price_agorot: number }
  type Adj = { id: string; book_id: string; delta: number; amount_agorot: number; reason: string; created_at: string; by: Named }
  type Pay = AuthorPayment & { created_at: string; by: Named }
  const [books, sales, adj, pays] = await Promise.all([
    fetchAllRows<Book>((from, to) =>
      db.from('book_fair_books').select('id, sku, title, author, publisher, price_agorot')
        .order('id').range(from, to) as unknown as Res<Book>),
    fetchAllRows<BookSale>((from, to) =>
      db.rpc('book_fair_book_sales').order('book_id').range(from, to) as unknown as Res<BookSale>),
    fetchAllRows<Adj>((from, to) =>
      db.from('book_fair_sold_adjustments')
        .select('id, book_id, delta, amount_agorot, reason, created_at, by:profiles!book_fair_sold_adjustments_created_by_fkey(full_name)')
        .order('created_at', { ascending: false }).range(from, to) as unknown as Res<Adj>),
    fetchAllRows<Pay>((from, to) =>
      db.from('book_fair_author_payments')
        .select('id, payee, amount_agorot, method, paid_on, note, cancelled_at, created_at, by:profiles!book_fair_author_payments_created_by_fkey(full_name)')
        .order('paid_on', { ascending: false }).order('created_at', { ascending: false })
        .range(from, to) as unknown as Res<Pay>),
  ])

  // ⚠️ שגיאה אחת (בד"כ: המיגרציה עוד לא רצה) מוצגת במסך ולא מפילה אותו.
  const error = books.error ?? sales.error ?? adj.error ?? pays.error
  if (error) console.error('[book-fair/settlement] load failed:', error)

  const adjustments: AdjustmentLog[] = adj.rows.map(a => ({
    id: a.id, book_id: a.book_id, delta: a.delta, amount_agorot: a.amount_agorot,
    reason: a.reason, created_at: a.created_at, by: nameOf(a.by),
  }))
  const payments: PaymentLog[] = pays.rows.map(p => ({
    id: p.id, payee: p.payee, amount_agorot: p.amount_agorot, method: p.method, paid_on: p.paid_on,
    note: p.note, cancelled_at: p.cancelled_at, created_at: p.created_at, by: nameOf(p.by),
  }))
  return { books: books.rows, sales: sales.rows, adjustments, payments, error }
}

export default async function BookFairSettlementPage() {
  await guardPage('book_fair')
  const data = await load()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title='התחשבנות עם מחברים ומו"לים' subtitle='סכומים לפי הזמנות פעילות והתאמות כמות. הזמנות מבוטלות לא נספרות. עמלת היריד: 5%.' />
      <SettlementClient {...data} />
    </div>
  )
}
