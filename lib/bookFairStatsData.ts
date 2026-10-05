import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { categoryName, type StatOrder, type StatItem } from '@/lib/bookFairStats'

// ─────────────────────────────────────────────────────────────────────────────
// שליפת הנתונים לסטטיסטיקות היריד (צד שרת).
//
// 🔴 fetchAllRows ולא select רגיל: תקרת 1,000 השורות של Supabase חותכת
// בשקט, ו-.limit() אינו עוקף אותה. ביריד עם אלפי פריטים הגרפים היו
// מציגים חלק מהמכירות בלי שום סימן.
//
// ⚠️ אין כאן שמות לקוחות, טלפונים או כתובות — רק מה שהגרפים צריכים.
// העיר נשלפת כשם בלבד, לגרף "ערים מובילות".
// ─────────────────────────────────────────────────────────────────────────────

type OrderRow = Omit<StatOrder, 'city_name'> & { city: { name: string } | { name: string }[] | null }

export async function loadStatsData(
  db: SupabaseClient,
  opts: { channel?: 'fair' } = {},
): Promise<{ orders: StatOrder[]; items: StatItem[]; categoryOf: Map<string, string>; error: string | null }> {
  const [o, b] = await Promise.all([
    fetchAllRows<OrderRow>((from, to) => {
      let q = db.from('book_fair_orders')
        .select('id, order_number, status, channel, total_agorot, refunded_agorot, delivery_method, payment_method, sold_by, created_at, picked_up_at, city:book_fair_cities(name)')
        // ⚠️ הזמנות זמניות (TMP-) הן שאריות של עגלה שננטשה לפני שנוצר
        // מספר — אינן הזמנות ואינן נספרות בשום מקום.
        .not('order_number', 'like', 'TMP-%')
        .order('created_at', { ascending: true })
        .range(from, to)
      if (opts.channel) q = q.eq('channel', opts.channel)
      return q
    }),
    fetchAllRows<{ id: string; description: string | null }>((from, to) =>
      db.from('book_fair_books').select('id, description').order('id').range(from, to)),
  ])

  if (o.error || b.error) return { orders: [], items: [], categoryOf: new Map(), error: o.error ?? b.error }

  const orders: StatOrder[] = o.rows.map(r => {
    const city = Array.isArray(r.city) ? r.city[0] : r.city
    const { city: _c, ...rest } = r
    void _c
    return { ...rest, city_name: city?.name ?? null }
  })

  // ⚠️ פריטים רק של ההזמנות שנשלפו — בקבוצות, כדי לא לחרוג מאורך ה-URL.
  const ids = orders.map(x => x.id)
  const items: StatItem[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const r = await fetchAllRows<StatItem>((from, to) =>
      db.from('book_fair_order_items')
        .select('order_id, book_id, title_snapshot, quantity, line_total_agorot')
        .in('order_id', chunk).order('id').range(from, to))
    if (r.error) return { orders: [], items: [], categoryOf: new Map(), error: r.error }
    items.push(...r.rows)
  }

  const categoryOf = new Map(b.rows.map(x => [x.id, categoryName(x.description)]))
  return { orders, items, categoryOf, error: null }
}
