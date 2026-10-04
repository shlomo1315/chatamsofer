import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/fetchAllRows'
import PageHeader from '@/components/ui/PageHeader'
import type { BookFairBook } from '@/types/bookFair'
import BooksClient from './BooksClient'

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
async function getSold(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured()) return {}
  const supabase = await createClient()

  const { rows } = await fetchAllRows<{ book_id: string; quantity: number }>((from, to) =>
    supabase
      .from('book_fair_order_items')
      .select('book_id, quantity, order:book_fair_orders!inner(status)')
      .in('order.status', ['paid', 'picking', 'packed', 'shipped', 'delivered'])
      .range(from, to) as never
  )

  const out: Record<string, number> = {}
  for (const r of rows) {
    if (!r.book_id) continue
    out[r.book_id] = (out[r.book_id] ?? 0) + (r.quantity ?? 0)
  }
  return out
}

export default async function BookFairBooksPage() {
  await guardPage('book_fair')
  const [books, sold] = await Promise.all([getBooks(), getSold()])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="קטלוג הספרים" subtitle="ספרים, מחירים ומלאי לשני הערוצים" />
      <BooksClient books={books} sold={sold} />
    </div>
  )
}
