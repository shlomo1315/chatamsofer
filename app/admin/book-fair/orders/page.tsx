import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/fetchAllRows'
import PageHeader from '@/components/ui/PageHeader'
import type { BookFairOrder } from '@/types/bookFair'
import OrdersClient from './OrdersClient'

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
      .select('id, order_number, channel, status, customer_name, customer_phone, customer_email, delivery_method, city_id, address_text, address_confirmed, items_total_agorot, shipping_agorot, total_agorot, refunded_agorot, paid_at, created_at, updated_at, city:book_fair_cities(id, name)')
      .order('created_at', { ascending: false })
      .range(from, to) as unknown as PromiseLike<{ data: BookFairOrder[] | null; error: { message: string } | null }>
  )

  // ⚠️ שגיאה נרשמת ואינה זורקת: מסך ריק עם הודעה עדיף על מסך שגיאה
  // אדום שנראה כתקלה כוללת במערכת.
  if (error) console.error('[book-fair/orders] fetch failed:', error)
  return rows
}

/** ספירת הפריטים לכל הזמנה — לעמודה "ספרים". */
async function getItemCounts(orderIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!orderIds.length || !isSupabaseConfigured()) return out
  const supabase = await createClient()

  // ⚠️ שליפה במנות: רשימת in ארוכה מדי נחתכת, וספירה חלקית הייתה
  // מציגה "0 ספרים" על הזמנות אמיתיות.
  for (let i = 0; i < orderIds.length; i += 200) {
    const chunk = orderIds.slice(i, i + 200)
    const { data } = await supabase
      .from('book_fair_order_items')
      .select('order_id, quantity')
      .in('order_id', chunk)
    for (const row of data ?? []) {
      out.set(row.order_id, (out.get(row.order_id) ?? 0) + row.quantity)
    }
  }
  return out
}

export default async function BookFairOrdersPage() {
  await guardPage('book_fair')
  const orders = await getOrders()
  const counts = await getItemCounts(orders.map(o => o.id))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="הזמנות" subtitle="הזמנות מהאתר ומהמערכת הטלפונית" />
      <OrdersClient
        orders={orders}
        itemCounts={Object.fromEntries(counts)}
      />
    </div>
  )
}
