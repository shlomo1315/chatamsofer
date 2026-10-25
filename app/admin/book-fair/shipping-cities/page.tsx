import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import PageHeader from '@/components/ui/PageHeader'
import { PAID } from '@/lib/bookFairStats'
import { aggregateOrderItems, totalsToMaps, type OrderItemRow } from '@/lib/bookFairOrderItems'
import { loadAgreedRates } from '@/lib/bookFairAgreedRates'
import { shippingOrders, type CityOrderInput } from '@/lib/bookFairShippingCities'
import ShippingCitiesClient from './ShippingCitiesClient'

// דמי משלוח לפי עיר — לתשלום לשליחים (בקשת משה כהנא 14.10).
// החישוב: lib/bookFairShippingCities.ts.
//
// ⚠️ לקוח השירות רק אחרי guardPage, כמו במסך ההזמנות.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'משלוחים לפי עיר - יריד הספרים' }

type Res<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
type Db = Awaited<ReturnType<typeof createClient>>
type OrderRow = Omit<CityOrderInput, 'city_name'> & { city: { name: string } | { name: string }[] | null }

/** כרכים לכל הזמנה — אותו חישוב כמו בעמודת "משלוח" במסך ההזמנות. */
async function loadVolumes(db: Db): Promise<Record<string, number>> {
  type Total = { order_id: string; items: number; volumes: number; book_ids: string[] | null }
  const totals = await fetchAllRows<Total>((from, to) =>
    db.rpc('book_fair_order_item_totals').order('order_id').range(from, to) as unknown as Res<Total>)
  if (!totals.error) return totalsToMaps(totals.rows).volumes
  // ⚠️ הפונקציה עדיין לא קיימת (המיגרציה לא רצה) — שליפה מלאה.
  type Book = { id: string; volumes: number | null }
  const [items, catalog] = await Promise.all([
    fetchAllRows<OrderItemRow>((from, to) =>
      db.from('book_fair_order_items').select('order_id, book_id, quantity, volumes_snapshot')
        .order('id').range(from, to) as unknown as Res<OrderItemRow>),
    fetchAllRows<Book>((from, to) =>
      db.from('book_fair_books').select('id, volumes').order('id').range(from, to) as unknown as Res<Book>),
  ])
  return aggregateOrderItems(items.rows, new Map(catalog.rows.map(b => [b.id, b.volumes]))).volumes
}

async function load() {
  if (!isSupabaseConfigured()) return { rows: [], error: null as string | null }
  const db = (getServiceClient() ?? await createClient()) as Db
  const [orders, volumes, rates] = await Promise.all([
    fetchAllRows<OrderRow>((from, to) =>
      db.from('book_fair_orders')
        .select('id, order_number, status, channel, delivery_method, shipping_agorot, city:book_fair_cities(name)')
        .eq('delivery_method', 'shipping').in('status', [...PAID])
        .order('order_number').range(from, to) as unknown as Res<OrderRow>),
    loadVolumes(db),
    loadAgreedRates(db as never),
  ])
  if (orders.error) console.error('[book-fair/shipping-cities] load failed:', orders.error)
  const input: CityOrderInput[] = orders.rows.map(({ city, ...o }) => ({
    ...o, city_name: (Array.isArray(city) ? city[0]?.name : city?.name) ?? null,
  }))
  return { rows: shippingOrders(input, volumes, rates), error: orders.error }
}

export default async function BookFairShippingCitiesPage() {
  await guardPage('book_fair')
  const { rows, error } = await load()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="משלוחים לפי עיר" subtitle='לתשלום לשליחים: לפי התעריף המוסכם 30/30/40 ועוד 10 ₪ לכל 4 כרכים מעל 12, מול מה שנגבה בפועל בכל הזמנה.' />
      <ShippingCitiesClient rows={rows} error={error} />
    </div>
  )
}
