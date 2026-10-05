import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { DASH_CONFIG_KEY, DASH_COOKIE, parseDashConfig, dashTokenValid } from '@/lib/bookFairDashboard'
import { loadStatsData } from '@/lib/bookFairStatsData'

// נתוני לוח המנהל — כל ההזמנות מכל הערוצים, מספרים בלבד.
//
// 🔴 מה לא יוצא מכאן: שם לקוח, טלפון, מייל, כתובת, מספר הזמנה. השורות
// מנוקות לפני ההחזרה — גם אם loadStatsData יורחב בעתיד, הרשימה הלבנה
// כאן היא מה שנחשף.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  const { data: row } = await db.from('app_settings').select('value').eq('key', DASH_CONFIG_KEY).maybeSingle()
  const cfg = parseDashConfig(row?.value ?? null)
  if (!dashTokenValid(request.cookies.get(DASH_COOKIE)?.value, cfg)) {
    return NextResponse.json({ error: 'נדרשת כניסה' }, { status: 401 })
  }

  // ⚠️ רענון כל 15 שניות = 40 לדקה בעשר לשוניות. 120 לדקה מאותו מקור.
  if (!rateLimit(`fair-dash-data:${clientIp(request)}`, 120, 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const { orders, items, categoryOf, error } = await loadStatsData(db)
  if (error) {
    console.error('[fair/dash] load failed:', error)
    return NextResponse.json({ error: 'הטעינה נכשלה' }, { status: 500 })
  }

  // 🔴 רשימה לבנה — רק השדות שהגרפים צריכים.
  const safeOrders = orders.map(o => ({
    id: o.id, status: o.status, channel: o.channel,
    total_agorot: o.total_agorot, refunded_agorot: o.refunded_agorot,
    delivery_method: o.delivery_method, payment_method: o.payment_method,
    sold_by: o.sold_by, created_at: o.created_at, city_name: o.city_name,
    picked_up_at: o.picked_up_at ?? null,
  }))
  const safeItems = items.map(i => ({
    order_id: i.order_id, book_id: i.book_id, title_snapshot: i.title_snapshot,
    quantity: i.quantity, line_total_agorot: i.line_total_agorot,
  }))

  return NextResponse.json(
    { orders: safeOrders, items: safeItems, categories: Object.fromEntries(categoryOf), at: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  )
}
