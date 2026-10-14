import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { getServiceClient } from '@/lib/apiAuth'
import { loadSold } from '@/lib/bookFairSoldData'
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

export type SoldByChannel = Record<string, { fair: number; phone: number; web: number }>

/**
 * כמה עותקים נמכרו מכל ספר, לפי ערוץ, והתאמות "נמכר" הידניות.
 *
 * 🔴 14.10: מקור אחד עם דוח ההתחשבנות (lib/bookFairSold). קודם המסך הזה
 * לא ספר הזמנות "זוכה חלקית" ולא הוריד עותקים שהוחזרו, וההתחשבנות ספרה
 * אחרת — אותו ספר הציג מספר שונה בכל מסך.
 *
 * ⚠️ sold כאן הוא לפי ההזמנות, *בלי* ההתאמה: "מלאי מקורי" = נשאר + נמכר
 * לפי ההזמנות, וההתאמה לא נגעה במלאי. BooksClient מוסיף את ההתאמה לעמודות
 * "נמכר" ו"ביריד".
 */
async function getSold(): Promise<{ sold: Record<string, number>; byChannel: SoldByChannel; adj: Record<string, number> }> {
  const db = getServiceClient()
  if (!db) return { sold: {}, byChannel: {}, adj: {} }
  const { sold: rows, error } = await loadSold(db)
  if (error) console.error('[book-fair/books] sold fetch failed:', error)
  const sold: Record<string, number> = {}
  const byChannel: SoldByChannel = {}
  const adj: Record<string, number> = {}
  for (const [id, r] of Object.entries(rows)) {
    sold[id] = r.total - r.adj
    byChannel[id] = { fair: r.fairOrders, phone: r.phone, web: r.web }
    if (r.adj) adj[id] = r.adj
  }
  return { sold, byChannel, adj }
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
  const [books, { sold, byChannel, adj: soldAdj }, problems] = await Promise.all([getBooks(), getSold(), getProblems()])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="קטלוג הספרים" subtitle="ספרים, מחירים ומלאי לשני הערוצים" />
      <BooksClient books={books} sold={sold} soldBy={byChannel} soldAdj={soldAdj} problems={problems} />
    </div>
  )
}
