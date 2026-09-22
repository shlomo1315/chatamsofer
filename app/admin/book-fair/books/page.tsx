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
      .select('id, sku, title, author, publisher, volumes, price_agorot, image_path, stock_web, stock_phone, phone_code, is_active, sort_order, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })
      .range(from, to)
  )

  // ⚠️ שגיאה נרשמת ואינה זורקת: מסך קטלוג ריק עם הודעה עדיף על מסך
  // שגיאה אדום שנראה כתקלה כוללת במערכת.
  if (error) console.error('[book-fair/books] fetch failed:', error)
  return rows
}

export default async function BookFairBooksPage() {
  await guardPage('book_fair')
  const books = await getBooks()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="קטלוג הספרים" subtitle="ספרים, מחירים ומלאי לשני הערוצים" />
      <BooksClient books={books} />
    </div>
  )
}
