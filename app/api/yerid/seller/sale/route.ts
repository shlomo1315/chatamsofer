import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { makeOrderNumber } from '@/lib/bookFairCheckout'
import { SELLER_COOKIE, readSellerToken } from '@/lib/bookFairSeller'

// רישום מכירה בדוכן היריד.
//
// 🔴 אין סליקה כאן. הכסף עובר ביד (מזומן) או במכשיר סליקה חיצוני,
// והמערכת רק *מתעדת*. לכן ההזמנה נוצרת ישר כ-'paid' ולא
// כ-'pending_payment': אין למה לחכות.
//
// 🔴 המלאי שמנוכה הוא stock_fair — מאגר הדוכן, *נפרד* מהמלאי של האתר
// והטלפון (החלטת המשתמש). מכירה בדוכן אינה מורידה מהמלאי המקוון.
//
// ⚠️ אינו חוסם כשהמלאי אזל: מלאי הדוכן הוא הערכה (ספר עשוי להיות
// בארגז ולא נספר), וחסימת מכירה אמיתית על סמך מספר משוער הייתה הופכת
// כלי דיווח למכשול מול לקוח שעומד בדוכן.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ItemInput = { book_id: string; quantity: number }

export async function POST(request: NextRequest) {
  const seller = readSellerToken(request.cookies.get(SELLER_COOKIE)?.value)
  if (!seller) return NextResponse.json({ error: 'נדרשת התחברות מחדש' }, { status: 401 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const rawItems = Array.isArray(body.items) ? body.items as ItemInput[] : []
  if (!rawItems.length) return NextResponse.json({ error: 'לא נבחרו ספרים' }, { status: 400 })
  if (rawItems.length > 100) return NextResponse.json({ error: 'יותר מדי פריטים' }, { status: 400 })

  const paymentMethod = body.payment_method === 'cash' ? 'cash' : 'card'

  // 🔴 המחירים מהמסד ולא מהלקוח — אותו כלל כמו בחנות. מוכר שדפדפנו
  // נפרץ (או שסתם שינה את ה-DOM) אינו יכול לקבוע מחיר.
  const ids = [...new Set(rawItems.map(i => String(i.book_id)))]
  const { data: books, error: booksErr } = await db.from('book_fair_books')
    .select('id, sku, title, volumes, price_agorot, is_active')
    .in('id', ids)

  if (booksErr) {
    console.error('[fair/seller/sale] books fetch failed:', booksErr)
    return NextResponse.json({ error: 'שגיאה בטעינת הפריטים' }, { status: 500 })
  }

  const byId = new Map((books ?? []).map(b => [b.id, b]))
  const lines: { book_id: string; sku: string; title: string; volumes: number; unit: number; qty: number }[] = []

  for (const raw of rawItems) {
    const b = byId.get(String(raw.book_id))
    if (!b || !b.is_active) return NextResponse.json({ error: 'אחד הפריטים אינו קיים בקטלוג' }, { status: 409 })
    const qty = Number(raw.quantity)
    if (!Number.isInteger(qty) || qty <= 0 || qty > 99) {
      return NextResponse.json({ error: `כמות לא תקינה עבור "${b.title}"` }, { status: 400 })
    }
    lines.push({
      book_id: b.id, sku: b.sku, title: b.title,
      volumes: b.volumes, unit: b.price_agorot, qty,
    })
  }

  const itemsTotal = lines.reduce((s, l) => s + l.unit * l.qty, 0)

  // ── ההזמנה ──
  const orderNumber = makeOrderNumber(new Date().getFullYear())
  const { data: order, error: orderErr } = await db.from('book_fair_orders').insert({
    order_number: orderNumber,
    channel: 'fair',
    // 🔴 'paid' ישירות: הכסף התקבל בדוכן, אין סליקה לחכות לה.
    status: 'paid',
    payment_method: paymentMethod,
    sold_by: seller.name,
    customer_name: String(body.customer_name ?? '').trim() || 'מכירה בדוכן',
    customer_phone: String(body.customer_phone ?? '').trim() || null,
    customer_email: null,
    // ⚠️ מכירה בדוכן היא איסוף במקום — הקונה לוקח את הספרים איתו.
    delivery_method: 'pickup',
    city_id: null,
    address_text: null,
    address_confirmed: true,
    items_total_agorot: itemsTotal,
    shipping_agorot: 0,
    total_agorot: itemsTotal,
  }).select('id, order_number').single()

  if (orderErr || !order) {
    console.error('[fair/seller/sale] order insert failed:', orderErr)
    return NextResponse.json({ error: 'רישום המכירה נכשל' }, { status: 500 })
  }

  const { error: itemsErr } = await db.from('book_fair_order_items').insert(
    lines.map(l => ({
      order_id: order.id,
      book_id: l.book_id,
      title_snapshot: l.title,
      sku_snapshot: l.sku,
      volumes_snapshot: l.volumes,
      unit_price_agorot: l.unit,
      quantity: l.qty,
      line_total_agorot: l.unit * l.qty,
    }))
  )

  if (itemsErr) {
    // ⚠️ מוחקים את ההזמנה: הזמנה בלי שורות היא סכום בלי הסבר, והיא
    // תנפח את הדיווח בלי שאפשר יהיה לדעת ממה.
    await db.from('book_fair_orders').delete().eq('id', order.id)
    console.error('[fair/seller/sale] items insert failed:', itemsErr)
    return NextResponse.json({ error: 'רישום המכירה נכשל' }, { status: 500 })
  }

  // ── ניכוי מלאי הדוכן ──
  // ⚠️ אחרי שההזמנה נרשמה ולא לפני: כישלון כאן משאיר מלאי לא מדויק
  // (שאפשר לתקן בספירה), בעוד שכישלון בסדר ההפוך היה מוריד מלאי על
  // מכירה שלא נרשמה.
  const { error: stockErr } = await db.rpc('book_fair_fair_sale', {
    p_items: lines.map(l => ({ book_id: l.book_id, quantity: l.qty })),
    p_by: seller.name,
  })
  if (stockErr) {
    console.error('[fair/seller/sale] stock update failed:', stockErr.message)
  }

  return NextResponse.json({
    ok: true,
    orderNumber: order.order_number,
    total_agorot: itemsTotal,
    // ⚠️ מדווח במפורש כשהמלאי לא עודכן — המכירה נרשמה, וזה מה שחשוב,
    // אבל המוכר צריך לדעת שהמספר במסך אינו מדויק.
    stockWarning: stockErr ? 'המכירה נרשמה, אך עדכון מלאי הדוכן נכשל' : null,
  })
}
