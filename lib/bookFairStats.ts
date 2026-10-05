// ─────────────────────────────────────────────────────────────────────────────
// סטטיסטיקות היריד — מקור אמת אחד ללשונית "דוכן היריד" וללוח המנהל.
//
// 🔴 טהור לחלוטין: מקבל שורות ו"עכשיו", מחזיר מספרים. שני מסכים שמחשבים
// "הכנסות" כל אחד בדרכו יציגו בסוף שני מספרים שונים לאותו יום — וזה
// בדיוק הסוג של פער שאיש לא מבחין בו עד שמישהו משווה.
//
// 🔴 הכנסה = total − refunded, ורק על הזמנות ששולמו (PAID_STATUSES).
// אותו כלל כמו בסקירת היריד, כדי שהמספרים ייפגשו.
//
// ⚠️ ימים ושעות לפי שעון ישראל, לא UTC: הזמנה ב-01:00 בלילה שייכת ליום
// שהתחיל, לא ליום הקודם.
// ─────────────────────────────────────────────────────────────────────────────

export const PAID = ['paid', 'picking', 'packed', 'shipped', 'delivered', 'partially_refunded'] as const

export type Channel = 'web' | 'phone' | 'fair'
export const CHANNELS: Channel[] = ['web', 'phone', 'fair']
export const CHANNEL_LABELS: Record<Channel, string> = { web: 'אתר', phone: 'טלפון', fair: 'דוכן ביריד' }

export type StatOrder = {
  id: string
  order_number?: string
  status: string
  channel: string
  total_agorot: number
  refunded_agorot: number | null
  delivery_method: string
  payment_method: string | null
  sold_by: string | null
  created_at: string
  city_name: string | null
  picked_up_at?: string | null
}

export type StatItem = {
  order_id: string
  book_id: string | null
  title_snapshot: string
  quantity: number
  line_total_agorot: number
}

export type StatusGroup = 'paid' | 'cancelled' | 'failed' | 'refunded' | 'pending'
export type Period = 'today' | 'yesterday' | 'all' | 'range'
export type SizeBucket = 'all' | 'small' | 'medium' | 'large'

export type StatFilters = {
  period: Period
  from?: string   // YYYY-MM-DD (שעון ישראל), ל-range
  to?: string
  channel: Channel | 'all'
  category: string | 'all'
  delivery: 'all' | 'shipping' | 'pickup'
  size: SizeBucket
  status: StatusGroup
}

export const DEFAULT_FILTERS: StatFilters = {
  period: 'all', channel: 'all', category: 'all', delivery: 'all', size: 'all', status: 'paid',
}

const ilDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' })
const ilHour = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false })

/** YYYY-MM-DD לפי שעון ישראל. */
export function israelDay(d: Date): string {
  return ilDay.format(d)
}

/** שעה 0–23 לפי שעון ישראל. ⚠️ חלק מהסביבות מחזירות 24 בחצות. */
export function israelHour(d: Date): number {
  return Number(ilHour.format(d)) % 24
}

export function statusGroup(status: string): StatusGroup {
  if ((PAID as readonly string[]).includes(status)) return 'paid'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'failed') return 'failed'
  if (status === 'refunded') return 'refunded'
  return 'pending'
}

/** הכנסה נטו מהזמנה. ⚠️ לעולם לא שלילית. */
export function netAgorot(o: Pick<StatOrder, 'total_agorot' | 'refunded_agorot'>): number {
  return Math.max(0, (o.total_agorot ?? 0) - (o.refunded_agorot ?? 0))
}

export function sizeBucket(totalAgorot: number): Exclude<SizeBucket, 'all'> {
  if (totalAgorot <= 20000) return 'small'      // עד ₪200
  if (totalAgorot <= 50000) return 'medium'     // ₪200–₪500
  return 'large'
}

/**
 * סינון הזמנות.
 *
 * ⚠️ סינון קטגוריה הוא ברמת ההזמנה: הזמנה נכללת אם יש בה ספר אחד לפחות
 * מהקטגוריה. ברמת הפריטים (קטגוריות, ספרים מובילים) נספרים רק הפריטים
 * של הקטגוריה — ראו computeStats.
 */
export function filterOrders(
  orders: StatOrder[], items: StatItem[], categoryOf: Map<string, string>,
  f: StatFilters, now: Date,
): StatOrder[] {
  const today = israelDay(now)
  const yesterday = israelDay(new Date(now.getTime() - 24 * 3600 * 1000))

  let catOrders: Set<string> | null = null
  if (f.category !== 'all') {
    catOrders = new Set(items.filter(i => i.book_id && categoryOf.get(i.book_id) === f.category).map(i => i.order_id))
  }

  return orders.filter(o => {
    if (statusGroup(o.status) !== f.status) return false
    if (f.channel !== 'all' && o.channel !== f.channel) return false
    if (f.delivery !== 'all' && o.delivery_method !== f.delivery) return false
    if (f.size !== 'all' && sizeBucket(o.total_agorot) !== f.size) return false
    if (catOrders && !catOrders.has(o.id)) return false
    if (f.period !== 'all') {
      const d = israelDay(new Date(o.created_at))
      if (f.period === 'today' && d !== today) return false
      if (f.period === 'yesterday' && d !== yesterday) return false
      if (f.period === 'range') {
        if (f.from && d < f.from) return false
        if (f.to && d > f.to) return false
      }
    }
    return true
  })
}

type Money = { orders: number; agorot: number }
const zero = (): Money => ({ orders: 0, agorot: 0 })

export type Stats = {
  orders: number
  revenueAgorot: number
  units: number
  avgAgorot: number
  byChannel: Record<Channel, Money>
  byPayment: { cash: Money; card: Money }
  bySeller: { name: string; orders: number; agorot: number }[]
  byDay: { day: string; total: number; orders: number; web: number; phone: number; fair: number }[]
  byHour: number[]
  categories: { name: string; agorot: number; units: number }[]
  topBooks: { title: string; units: number; agorot: number }[]
  cities: { name: string; orders: number }[]
  delivery: { shipping: number; pickup: number; pickedUp: number }
}

export function computeStats(
  orders: StatOrder[], items: StatItem[], categoryOf: Map<string, string>,
  categoryFilter: string | 'all' = 'all',
): Stats {
  const ids = new Set(orders.map(o => o.id))
  const its = items.filter(i => ids.has(i.order_id)
    && (categoryFilter === 'all' || (i.book_id && categoryOf.get(i.book_id) === categoryFilter)))

  const byChannel: Record<Channel, Money> = { web: zero(), phone: zero(), fair: zero() }
  const byPayment = { cash: zero(), card: zero() }
  const seller = new Map<string, Money>()
  const day = new Map<string, { total: number; orders: number; web: number; phone: number; fair: number }>()
  const byHour = Array.from({ length: 24 }, () => 0)
  const city = new Map<string, number>()
  const delivery = { shipping: 0, pickup: 0, pickedUp: 0 }
  let revenue = 0

  for (const o of orders) {
    const net = netAgorot(o)
    revenue += net
    const ch = (CHANNELS as string[]).includes(o.channel) ? o.channel as Channel : 'web'
    byChannel[ch].orders++; byChannel[ch].agorot += net

    // ⚠️ אמצעי תשלום רלוונטי לדוכן בלבד — באתר ובטלפון זה תמיד אשראי.
    const pm = o.payment_method === 'cash' ? 'cash' : 'card'
    byPayment[pm].orders++; byPayment[pm].agorot += net

    if (o.channel === 'fair') {
      const name = (o.sold_by ?? '').trim() || 'ללא שם'
      const s = seller.get(name) ?? zero()
      s.orders++; s.agorot += net; seller.set(name, s)
    }

    const created = new Date(o.created_at)
    const d = israelDay(created)
    const row = day.get(d) ?? { total: 0, orders: 0, web: 0, phone: 0, fair: 0 }
    row.total += net; row.orders++; row[ch] += net
    day.set(d, row)
    byHour[israelHour(created)]++

    if (o.city_name) city.set(o.city_name, (city.get(o.city_name) ?? 0) + 1)
    if (o.delivery_method === 'pickup') delivery.pickup++
    else delivery.shipping++
    if (o.picked_up_at) delivery.pickedUp++
  }

  const cat = new Map<string, { agorot: number; units: number }>()
  const book = new Map<string, { units: number; agorot: number }>()
  let units = 0
  for (const i of its) {
    units += i.quantity
    const c = (i.book_id && categoryOf.get(i.book_id)) || 'ללא קטגוריה'
    const cr = cat.get(c) ?? { agorot: 0, units: 0 }
    cr.agorot += i.line_total_agorot; cr.units += i.quantity; cat.set(c, cr)
    const br = book.get(i.title_snapshot) ?? { units: 0, agorot: 0 }
    br.units += i.quantity; br.agorot += i.line_total_agorot; book.set(i.title_snapshot, br)
  }

  return {
    orders: orders.length,
    revenueAgorot: revenue,
    units,
    avgAgorot: orders.length ? Math.round(revenue / orders.length) : 0,
    byChannel,
    byPayment,
    bySeller: [...seller].map(([name, m]) => ({ name, ...m })).sort((a, b) => b.agorot - a.agorot),
    byDay: [...day].map(([d, r]) => ({ day: d, ...r })).sort((a, b) => a.day.localeCompare(b.day)),
    byHour,
    categories: [...cat].map(([name, r]) => ({ name, ...r })).sort((a, b) => b.agorot - a.agorot),
    topBooks: [...book].map(([title, r]) => ({ title, ...r })).sort((a, b) => b.units - a.units || b.agorot - a.agorot).slice(0, 10),
    cities: [...city].map(([name, n]) => ({ name, orders: n })).sort((a, b) => b.orders - a.orders).slice(0, 8),
    delivery,
  }
}

/** "מה לא נסגר": הזמנות שבוטלו/נכשלו, לפי ערוץ. */
export function lostByChannel(orders: StatOrder[]): Record<Channel, { cancelled: number; failed: number; agorot: number }> {
  const out: Record<Channel, { cancelled: number; failed: number; agorot: number }> = {
    web: { cancelled: 0, failed: 0, agorot: 0 },
    phone: { cancelled: 0, failed: 0, agorot: 0 },
    fair: { cancelled: 0, failed: 0, agorot: 0 },
  }
  for (const o of orders) {
    const g = statusGroup(o.status)
    if (g !== 'cancelled' && g !== 'failed') continue
    const ch = (CHANNELS as string[]).includes(o.channel) ? o.channel as Channel : 'web'
    out[ch][g]++
    out[ch].agorot += o.total_agorot ?? 0
  }
  return out
}

/** הקטגוריה יושבת ב-description של הספר (ראו book-fair-sku-has-hyphen). */
export function categoryName(description: string | null | undefined): string {
  return String(description ?? '').trim() || 'ללא קטגוריה'
}
