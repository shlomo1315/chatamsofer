import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/fetchAllRows'
import PageHeader from '@/components/ui/PageHeader'
import type { BookFairOrder } from '@/types/bookFair'
import { PROBLEM_BOOKS_KEY, parseProblemBooks } from '@/lib/bookFairProblemBooks'
import OrdersClient, { type ProblemBookInfo } from './OrdersClient'

// מסך ההזמנות — הלב של הניהול היומיומי ביריד.
//
// ⚠️ fetchAllRows ולא select רגיל: PostgREST קוטע ב-1,000 שורות בשקט.
// יריד גדול יחצה את הרף, והמסך היה מציג רשימה חלקית שנראית מלאה —
// כולל בספירות ובייצוא.

export const dynamic = 'force-dynamic'

async function getOrders(): Promise<BookFairOrder[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()

  // ⚡ עמודות מפורשות: notes ו-tracking_token אינם מוצגים בטבלה ואין
  // סיבה למשוך אותם לכל שורה.
  //
  // ⚠️ ה-cast: טיפוסי המסד אינם מיוצרים בפרויקט, ולכן כל שדה חוזר
  // כ-any ואינו מתאים לטיפוסי האיחוד שלנו (status, channel). אותו
  // דפוס בדיוק כמו app/admin/widows/page.tsx.
  //
  // ⚠️ ההמרה כאן מגשרת על any בלבד — היא *אינה* מסתירה אי-התאמת צורה:
  // BookFairOrder.city מקבל במפורש גם אובייקט וגם מערך, כי כך Supabase
  // מטפס join של רבים-לאחד, והקוראים מנרמלים ב-oneOf().
  const { rows, error } = await fetchAllRows<BookFairOrder>((from, to) =>
    supabase
      .from('book_fair_orders')
      .select('id, order_number, channel, status, customer_name, customer_phone, customer_email, delivery_method, city_id, address_text, address_confirmed, items_total_agorot, shipping_agorot, total_agorot, refunded_agorot, payment_method, paid_at, created_at, updated_at, city:book_fair_cities(id, name)')
      .order('created_at', { ascending: false })
      .range(from, to) as unknown as PromiseLike<{ data: BookFairOrder[] | null; error: { message: string } | null }>
  )

  // ⚠️ שגיאה נרשמת ואינה זורקת: מסך ריק עם הודעה עדיף על מסך שגיאה
  // אדום שנראה כתקלה כוללת במערכת.
  if (error) console.error('[book-fair/orders] fetch failed:', error)

  // ───────────────────────────────────────────────────────────────────────────
  // 🔴 שיחה שעדיין על הקו אינה הזמנה.
  //
  // המתקשר בוחר ספרים ומקיש פרטי אשראי — ובמסך כבר הופיעה שורה
  // "ממתין לתשלום" שנראית כהזמנה שנטושה. הצוות לא יכול להבדיל בינה
  // לבין מי שבאמת נטש, והמונה בכרטיסים ניפח את התמונה.
  //
  // ⚠️ TMP- היא העדות: המספר הרץ מוקצה רק בתשלום בפועל, ולכן כל שורה
  // שעדיין נושאת מספר זמני היא שיחה שלא הגיעה לתשלום.
  //
  // ⚠️ הישנות כן מוצגות: אחרי שעה השיחה בוודאות הסתיימה, ושורה
  // שנתקעה חייבת להיות גלויה כדי שאפשר יהיה לטפל בה.
  // ───────────────────────────────────────────────────────────────────────────
  const hourAgo = Date.now() - 60 * 60 * 1000
  return rows.filter(o =>
    !String(o.order_number ?? '').startsWith('TMP-') ||
    new Date(o.created_at).getTime() < hourAgo
  )
}

/**
 * ספירת הפריטים לכל הזמנה (לעמודה "ספרים") ומזהי הספרים שבה (לסינון
 * "ספר בעייתי").
 */
async function getItems(orderIds: string[]): Promise<{
  counts: Record<string, number>
  books: Record<string, string[]>
}> {
  const counts: Record<string, number> = {}
  const books: Record<string, string[]> = {}
  if (!orderIds.length || !isSupabaseConfigured()) return { counts, books }
  const supabase = await createClient()

  // ⚠️ שליפה במנות: רשימת in ארוכה מדי נחתכת, וספירה חלקית הייתה
  // מציגה "0 ספרים" על הזמנות אמיתיות.
  for (let i = 0; i < orderIds.length; i += 200) {
    const chunk = orderIds.slice(i, i + 200)
    const { data } = await supabase
      .from('book_fair_order_items')
      .select('order_id, book_id, quantity')
      .in('order_id', chunk)
    for (const row of data ?? []) {
      counts[row.order_id] = (counts[row.order_id] ?? 0) + row.quantity
      if (row.book_id) (books[row.order_id] ??= []).push(row.book_id)
    }
  }
  return { counts, books }
}

/**
 * הספרים שסומנו בעייתיים, עם שמם מהקטלוג.
 *
 * ⚠️ ספר שנמחק מהקטלוג נשאר עם "ספר שנמחק" ולא נעלם: הסימון עדיין
 * תופס את ההזמנות שלו, ושורה בלי שם הייתה נראית כתקלה.
 */
async function getProblemBooks(): Promise<ProblemBookInfo[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data } = await supabase.from('app_settings').select('value').eq('key', PROBLEM_BOOKS_KEY).maybeSingle()
  const marks = parseProblemBooks(data?.value)
  const ids = Object.keys(marks)
  if (!ids.length) return []
  const { data: books } = await supabase.from('book_fair_books').select('id, sku, title').in('id', ids)
  const byId = new Map((books ?? []).map(b => [b.id as string, b as { sku: string | null; title: string }]))
  return ids.map(id => ({
    id,
    sku: byId.get(id)?.sku ?? null,
    title: byId.get(id)?.title ?? 'ספר שנמחק מהקטלוג',
    note: marks[id].note,
  }))
}

export default async function BookFairOrdersPage() {
  await guardPage('book_fair')
  const [orders, problemBooks] = await Promise.all([getOrders(), getProblemBooks()])
  const { counts, books } = await getItems(orders.map(o => o.id))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="הזמנות" subtitle="הזמנות מהאתר ומהמערכת הטלפונית" />
      <OrdersClient
        orders={orders}
        itemCounts={counts}
        orderBooks={books}
        problemBooks={problemBooks}
      />
    </div>
  )
}
