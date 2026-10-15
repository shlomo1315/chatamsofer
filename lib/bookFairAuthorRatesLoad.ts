import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { loadSold } from '@/lib/bookFairSoldData'
import { computeAuthorPayouts, type AuthorPayouts, type RateBook } from '@/lib/bookFairAuthorRates'
import { AUTHOR_RATES } from '@/lib/bookFairAuthorRatesData'

// טעינת הקטלוג והנמכר וחישוב התשלום למחברים (צד שרת, לקוח שירות אחרי guardPage/requireAdmin).

export async function loadAuthorPayouts(db: SupabaseClient): Promise<{ payouts: AuthorPayouts; error: string | null }> {
  const [books, sold] = await Promise.all([
    fetchAllRows<RateBook>((from, to) =>
      db.from('book_fair_books').select('id, title').order('id').range(from, to) as unknown as
        PromiseLike<{ data: RateBook[] | null; error: { message: string } | null }>),
    loadSold(db),
  ])
  const error = books.error ?? sold.error
  const qty = Object.fromEntries(Object.entries(sold.sold).map(([id, s]) => [id, s.total]))
  return { payouts: computeAuthorPayouts(AUTHOR_RATES, error ? [] : books.rows, qty), error }
}
