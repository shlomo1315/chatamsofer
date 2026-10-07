import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/fetchAllRows'
import PageHeader from '@/components/ui/PageHeader'
import type { BookFairBook } from '@/types/bookFair'
import BooksClient from './BooksClient'
import { PROBLEM_BOOKS_KEY, parseProblemBooks, type ProblemBooks } from '@/lib/bookFairProblemBooks'

// קטלוג יריד הספרים.
//
// ⚠️ fetchAllRows ולא select רגיל: PostgREST קוטע כל שליפה ב-1,000 שורות
// בשקט — בלי שגיאה ובלי אזהרה. קטלוג של יריד גדול יחצה את הרף, והמסך
// היה מציג קטלוג חלקי שנראה שלם.

async function getBooks(): Promise<BookFairBook[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()

  // ⚡ עמודות מפורשות: description אינו מוצג בטבלה ואין סיבה למשוך אותו
  // לכל שורה בקטלוג.
  const { rows, error } = await fetchAllRows<BookFairBook>((from, to) =>
    supabase
      .from('book_fair_books')
      .select('id, sku, title, author, publisher, volumes, price_agorot, image_path, description, stock_total, unlimited_stock, phone_code, is_active, sort_order, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })
      .range(from, to)
  )

  // ⚠️ שגיאה נרשמת ואינה זורקת: מסך קטלוג ריק עם הודעה עדיף על מסך
  // שגיאה אדום שנראה כתקלה כוללת במערכת.
  if (error) console.error('[book-fair/books] fetch failed:', error)
  return rows
}

/**
 * כמה עותקים נמכרו מכל ספר.
 *
 * 🔴 רק הזמנות ששולמו: הזמנה נטושה או שבוטלה אינה מכירה, והעותקים
 * שלה חזרו למלאי. ספירתן הייתה מנפחת את "נמכר" ומקטינה את "מלאי
 * מקורי" המחושב.
 *
 * ⚠️ fetchAllRows: שורות הפריטים חוצות את רף 1,000 מהר הרבה יותר
 * מהקטלוג עצמו — כל ספר בכל הזמנה הוא שורה.
 */
export type SoldByChannel = Record<string, { fair: number; phone: number; web: number }>

async function getSold(): Promise<{ sold: Record<string, number>; byChannel: SoldByChannel }> {
  if (!isSupabaseConfigured()) return { sold: {}, byChannel: {} }
  const supabase = await createClient()

  type Row = { book_id: string; quantity: number; order: { channel: string } | { channel: string }[] | null }
  // ⚠️ order('id'): דפדוף בלי סדר קבוע עלול לדלג על שורות או לכפול אותן.
  const { rows } = await fetchAllRows<Row>((from, to) =>
    supabase
      .from('book_fair_order_items')
      .select('book_id, quantity, order:book_fair_orders!inner(status, channel)')
      .in('order.status', ['paid', 'picking', 'packed', 'shipped', 'delivered'])
      .order('id')
      .range(from, to) as never
  )

  const sold: Record<string, number> = {}
  // פיצול לפי ערוץ (בקשת המשתמש 05.10): יריד (דוכן) · טלפון · אתר.
  const byChannel: SoldByChannel = {}
  for (const r of rows) {
    if (!r.book_id) continue
    const q = r.quantity ?? 0
    sold[r.book_id] = (sold[r.book_id] ?? 0) + q
    // ⚠️ join של Supabase מגיע כמערך או כאובייקט — שתי הצורות.
    const ch = (Array.isArray(r.order) ? r.order[0]?.channel : r.order?.channel) ?? ''
    const slot = (byChannel[r.book_id] ??= { fair: 0, phone: 0, web: 0 })
    if (ch === 'fair' || ch === 'phone' || ch === 'web') slot[ch] += q
  }
  return { sold, byChannel }
}

/** ספרים שסומנו בעייתיים במלאי. */
async function getProblems(): Promise<ProblemBooks> {
  if (!isSupabaseConfigured()) return {}
  const supabase = await createClient()
  const { data } = await supabase.from('app_settings').select('value').eq('key', PROBLEM_BOOKS_KEY).maybeSingle()
  return parseProblemBooks(data?.value)
}

export default async function BookFairBooksPage() {
  await guardPage('book_fair')
  const [books, { sold, byChannel }, problems] = await Promise.all([getBooks(), getSold(), getProblems()])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="קטלוג הספרים" subtitle="ספרים, מחירים ומלאי לשני הערוצים" />
      <BooksClient books={books} sold={sold} soldBy={byChannel} problems={problems} />
    </div>
  )
}
