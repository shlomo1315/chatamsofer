import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'

// ─────────────────────────────────────────────────────────────────────────────
// מי הזמין ספר מסוים — לרשימה שנפתחת מעמודת "נמכר" בקטלוג.
//
// 🔴 רק הזמנות ששולמו: המספר בעמודה סופר אותן בלבד, ורשימה שתכלול
// עגלות נטושות לא הייתה מסתדרת עם המספר שעליו לחצו.
//
// ⚠️ הכתובת נשלחת: היא הסיבה שהרשימה קיימת — הצוות מלקט לפיה. לכן
// הנתיב מוגן בהרשאת צוות ולא פתוח.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** סטטוסים שנחשבים מכירה בפועל — זהה לחישוב בעמודת "נמכר". */
const PAID = ['paid', 'picking', 'packed', 'shipped', 'delivered', 'partially_refunded']

type ItemRow = {
  quantity: number
  unit_price_agorot: number
  order: {
    id: string
    order_number: string
    status: string
    channel: string
    customer_name: string | null
    customer_phone: string | null
    customer_email: string | null
    delivery_method: string
    address_text: string | null
    address_confirmed: boolean
    paid_at: string | null
    created_at: string
    city: { name: string } | { name: string }[] | null
  } | null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'חסר מזהה ספר' }, { status: 400 })

  // ⚠️ fetchAllRows: ספר פופולרי חוצה את רף 1,000 השורות של PostgREST,
  // והחיתוך שם שקט לגמרי.
  const { rows } = await fetchAllRows<ItemRow>((from, to) =>
    db.from('book_fair_order_items')
      .select(`
        quantity, unit_price_agorot,
        order:book_fair_orders!inner(
          id, order_number, status, channel,
          customer_name, customer_phone, customer_email,
          delivery_method, address_text, address_confirmed,
          paid_at, created_at,
          city:book_fair_cities(name)
        )
      `)
      .eq('book_id', id)
      .in('order.status', PAID)
      .range(from, to) as never
  )

  // ⚠️ Supabase מחזיר join של רבים-לאחד כאובייקט *או* כמערך, תלוי
  // בהקשר — שתי הצורות מטופלות (ראו supabase-join-array-or-object).
  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v

  const orders = rows
    .map(r => {
      const o = one(r.order)
      if (!o) return null
      const city = one(o.city)
      return {
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        channel: o.channel,
        quantity: r.quantity,
        line_total_agorot: r.unit_price_agorot * r.quantity,
        customer_name: o.customer_name,
        customer_phone: o.customer_phone,
        customer_email: o.customer_email,
        delivery_method: o.delivery_method,
        city_name: city?.name ?? null,
        address_text: o.address_text,
        address_confirmed: o.address_confirmed,
        // ⚠️ שעת התשלום היא "מתי הזמינו" מבחינת הצוות; created_at הוא
        // מתי נפתחה העגלה, והפער בטלפון הוא דקות.
        at: o.paid_at ?? o.created_at,
      }
    })
    .filter(Boolean)
    // החדשות ראשונות — זה הסדר שבו הצוות עובד.
    .sort((a, b) => new Date(b!.at).getTime() - new Date(a!.at).getTime())

  return NextResponse.json({
    orders,
    totalQuantity: orders.reduce((s, o) => s + (o!.quantity ?? 0), 0),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
