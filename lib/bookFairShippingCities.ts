// ─────────────────────────────────────────────────────────────────────────────
// יריד: סיכום דמי המשלוח לפי עיר — לתשלום לשליחים (בקשת משה כהנא, 14.10).
//
// 🔴 לכל עיר שליח נפרד, והתשלום לשליחים לפי התעריף המוסכם 30/30/40 (+10 לכל
// 4 כרכים מעל 12), ולכן "לפי התעריף" מחושב תמיד כך (agreedShipping).
// "נגבה" הוא shipping_agorot כפי שנשמר בהזמנה ברגע התשלום, ואינו מחושב
// מחדש: בסוף היריד חלק מהלקוחות שילמו 25/35/45.
//
// ⚠️ רק הזמנות משלוח ששולמו (PAID, כולל "זוכה חלקית"). הזמנות משרד נשלחות
// גם הן, אבל אין בהן שורות ספרים — הן נספרות בנפרד, בלי כרכים ובלי תעריף.
// ─────────────────────────────────────────────────────────────────────────────

import { PAID } from './bookFairStats'
import { agreedShipping } from './bookFairShipping'

export interface CityOrderInput {
  id: string
  order_number: string
  status: string
  channel: string
  delivery_method: string
  shipping_agorot: number | null
  city_name: string | null
}

export interface CityOrderRow extends CityOrderInput {
  city: string
  volumes: number
  /** לפי התעריף המוסכם. null = הזמנת משרד / בלי כרכים. */
  expected: number | null
  charged: number
}

export interface CityRow {
  city: string
  orders: number
  /** הזמנות משרד: נשלחות, אבל בלי פירוט כרכים. */
  officeOrders: number
  volumes: number
  expected: number
  charged: number
  /** נגבה פחות לפי התעריף. שלילי = נגבה פחות מהתעריף. */
  diff: number
}

export const NO_CITY = 'ללא עיר'

export function shippingOrders(orders: CityOrderInput[], volumes: Record<string, number>, rates?: number[]): CityOrderRow[] {
  return orders
    .filter(o => o.delivery_method === 'shipping' && (PAID as readonly string[]).includes(o.status))
    .map(o => {
      const v = volumes[o.id] ?? 0
      return {
        ...o,
        city: o.city_name?.trim() || NO_CITY,
        volumes: v,
        expected: o.channel === 'office' || v <= 0 ? null : agreedShipping(v, rates),
        charged: Math.max(0, Math.round(o.shipping_agorot ?? 0)),
      }
    })
}

export function byCity(rows: CityOrderRow[]): { cities: CityRow[]; total: CityRow } {
  const map = new Map<string, CityRow>()
  const total: CityRow = { city: 'סה"כ', orders: 0, officeOrders: 0, volumes: 0, expected: 0, charged: 0, diff: 0 }
  for (const r of rows) {
    const c = map.get(r.city) ?? { city: r.city, orders: 0, officeOrders: 0, volumes: 0, expected: 0, charged: 0, diff: 0 }
    for (const t of [c, total]) {
      t.orders++
      if (r.channel === 'office') t.officeOrders++
      t.volumes += r.volumes
      t.expected += r.expected ?? 0
      t.charged += r.charged
    }
    map.set(r.city, c)
  }
  const cities = [...map.values()]
  for (const c of [...cities, total]) c.diff = c.charged - c.expected
  return { cities: cities.sort((a, b) => b.orders - a.orders || a.city.localeCompare(b.city, 'he')), total }
}
