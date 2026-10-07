import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'

// נתונים להדפסת תעודות משלוח ורשימת כתובות (בקשת המשתמש 07.10).
//
// ⚠️ POST עם רשימת מזהים ולא GET עם query: "הדפסת כל התעודות" שולחת
// מאות מזהים, ו-URL של מאות UUID חוצה את מגבלת אורך הכותרת של השרת.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX = 3000
const CHUNK = 200

export async function POST(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 }) }

  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String).filter(id => UUID_RE.test(id)))] : []
  if (!ids.length) return NextResponse.json({ error: 'לא נבחרו הזמנות' }, { status: 400 })
  if (ids.length > MAX) return NextResponse.json({ error: `ניתן להדפיס עד ${MAX} הזמנות בבת אחת` }, { status: 400 })

  // ⚠️ שליפה במנות: רשימת in ארוכה נחתכת, ותעודות היו נעלמות בשקט מההדפסה.
  const orders: Record<string, unknown>[] = []
  const items: Record<string, unknown>[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const [o, it] = await Promise.all([
      db.from('book_fair_orders')
        .select('id, order_number, channel, status, customer_name, customer_phone, customer_email, delivery_method, address_text, address_confirmed, items_total_agorot, shipping_agorot, total_agorot, refunded_agorot, payment_method, paid_at, created_at, notes, city:book_fair_cities(id, name)')
        .in('id', chunk),
      db.from('book_fair_order_items')
        .select('id, order_id, book_id, title_snapshot, sku_snapshot, volumes_snapshot, unit_price_agorot, quantity, line_total_agorot')
        .in('order_id', chunk)
        .order('sku_snapshot'),
    ])
    // 🔴 שגיאה בחלק מהמנות = כישלון גלוי. הדפסה חלקית שנראית שלמה
    // פירושה חבילות שלא יוצאות ואיש אינו יודע.
    if (o.error || it.error) {
      console.error('[book-fair/orders/print] fetch failed:', o.error ?? it.error)
      return NextResponse.json({ error: 'שליפת ההזמנות נכשלה' }, { status: 500 })
    }
    orders.push(...(o.data ?? []))
    items.push(...(it.data ?? []))
  }

  // הסדר כפי שנשלח — הסדר שבו הטבלה הוצגה למשתמש.
  const pos = new Map(ids.map((id, i) => [id, i]))
  orders.sort((a, b) => (pos.get(String(a.id)) ?? 0) - (pos.get(String(b.id)) ?? 0))

  return NextResponse.json({ orders, items })
}
