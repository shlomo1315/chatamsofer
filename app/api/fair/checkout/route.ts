import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { validateCheckout, makeOrderNumber, makeCartToken, type CheckoutItem } from '@/lib/bookFairCheckout'
import { signPublicToken } from '@/lib/publicToken'
import { getPaymentProvider } from '@/lib/payments'
import type { TierInput } from '@/lib/bookFairShipping'

// צ'קאאוט — יצירת הזמנה, שריון המלאי ופתיחת הסליקה.
//
// 🔴 הנתיב פתוח לציבור ומנכה מלאי, ולכן מוגבל בקצב. בלי הגבלה, לולאה
// פשוטה הייתה משריינת את כל הקטלוג ומשביתה את החנות.
//
// 🔴 סדר הפעולות קריטי:
//   1. שליפת המחירים *מהמסד* (לעולם לא מהלקוח)
//   2. ולידציה וחישוב
//   3. שריון אטומי — נכשל? אין הזמנה
//   4. יצירת ההזמנה
//   5. פתיחת הסליקה
// כישלון בשלב 4 או 5 משחרר את השריון, אחרת המלאי ננעל עד הפקיעה.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ItemInput = { book_id: string; quantity: number }

export async function POST(request: NextRequest) {
  const ip = clientIp(request)
  // ⚠️ 20 הזמנות ב-10 דקות מאותו מקור: נדיב למשפחה שמזמינה כמה פעמים,
  // וחוסם לולאה אוטומטית.
  if (!rateLimit(`fair-checkout:${ip}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב בעוד מספר דקות.' }, { status: 429 })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  // ── האם היריד פתוח ──
  const { data: gate } = await db.from('app_settings')
    .select('value').eq('key', 'book_fair_open').maybeSingle()
  if (gate && gate.value === 'false') {
    return NextResponse.json({ error: 'היריד סגור כרגע להזמנות' }, { status: 403 })
  }

  // ── הפריטים המבוקשים ──
  const rawItems = Array.isArray(body.items) ? body.items as ItemInput[] : []
  if (!rawItems.length) return NextResponse.json({ error: 'העגלה ריקה' }, { status: 400 })
  if (rawItems.length > 100) return NextResponse.json({ error: 'יותר מדי פריטים בעגלה' }, { status: 400 })

  // 🔴 המחירים נשלפים מהמסד ולעולם לא מתקבלים מהלקוח. לקוח ששולח
  // מחיר משלו היה קונה בכל סכום שירצה — זו החולשה הקלאסית של חנות.
  const ids = [...new Set(rawItems.map(i => String(i.book_id)))]
  const { data: books, error: booksErr } = await db.from('book_fair_books')
    .select('id, sku, title, volumes, price_agorot, is_active')
    .in('id', ids)

  if (booksErr) {
    console.error('[fair/checkout] books fetch failed:', booksErr)
    return NextResponse.json({ error: 'שגיאה בטעינת הפריטים' }, { status: 500 })
  }

  const byId = new Map((books ?? []).map(b => [b.id, b]))
  const items: CheckoutItem[] = []
  for (const raw of rawItems) {
    const b = byId.get(String(raw.book_id))
    if (!b || !b.is_active) {
      return NextResponse.json({ error: 'אחד הפריטים בעגלה אינו זמין עוד' }, { status: 409 })
    }
    const qty = Number(raw.quantity)
    if (!Number.isInteger(qty) || qty <= 0 || qty > 99) {
      return NextResponse.json({ error: `כמות לא תקינה עבור "${b.title}"` }, { status: 400 })
    }
    items.push({
      book_id: b.id, title: b.title, sku: b.sku,
      volumes: b.volumes, unit_price_agorot: b.price_agorot, quantity: qty,
    })
  }

  // ── מדרגות המשלוח והערים ──
  const [{ data: tiers }, { data: cities }] = await Promise.all([
    db.from('book_fair_shipping_tiers').select('min_books, max_books, price_agorot'),
    db.from('book_fair_cities').select('id').eq('is_active', true),
  ])

  const validation = validateCheckout(
    {
      items,
      delivery_method: body.delivery_method === 'shipping' ? 'shipping' : 'pickup',
      city_id: body.city_id as string | null,
      address_text: body.address_text as string | null,
      customer_name: body.customer_name as string | null,
      customer_phone: body.customer_phone as string | null,
      customer_email: body.customer_email as string | null,
    },
    (tiers ?? []) as TierInput[],
    (cities ?? []).map(c => c.id)
  )

  if (!validation.ok) {
    return NextResponse.json({ error: validation.errors[0], errors: validation.errors }, { status: 400 })
  }
  const totals = validation.totals!

  // ── שריון אטומי ──
  // 🔴 לפני יצירת ההזמנה: אם המלאי אזל, אין טעם ליצור הזמנה שתיתקע.
  const cartToken = makeCartToken()
  const { error: reserveErr } = await db.rpc('book_fair_reserve', {
    p_items: items.map(i => ({ book_id: i.book_id, quantity: i.quantity })),
    p_channel: 'web',
    p_cart_token: cartToken,
    p_ttl_minutes: 25,   // 20 למילוי הטופס + 5 לסליקה
  })

  if (reserveErr) {
    if (reserveErr.message.includes('out_of_stock')) {
      const soldId = reserveErr.message.split('out_of_stock:')[1]?.trim()
      const sold = items.find(i => i.book_id === soldId)
      return NextResponse.json({
        error: sold ? `"${sold.title}" אזל מהמלאי` : 'אחד הפריטים אזל מהמלאי',
        outOfStock: soldId ?? null,
      }, { status: 409 })
    }
    console.error('[fair/checkout] reserve failed:', reserveErr)
    return NextResponse.json({ error: 'שריון המלאי נכשל' }, { status: 500 })
  }

  // ── יצירת ההזמנה ──
  // ⚠️ מכאן והלאה, כל כישלון חייב לשחרר את השריון — אחרת המלאי ננעל
  // עד הפקיעה בלי שאיש הזמין דבר.
  const release = async () => {
    await db.rpc('book_fair_release', { p_cart_token: cartToken })
      .then(undefined, () => { /* שחרור הוא best-effort; הפקיעה תתפוס */ })
  }

  const orderNumber = makeOrderNumber(new Date().getFullYear())
  const { data: order, error: orderErr } = await db.from('book_fair_orders').insert({
    order_number: orderNumber,
    channel: 'web',
    status: 'pending_payment',
    customer_name: String(body.customer_name ?? '').trim(),
    customer_phone: String(body.customer_phone ?? '').trim(),
    customer_email: String(body.customer_email ?? '').trim() || null,
    delivery_method: body.delivery_method === 'shipping' ? 'shipping' : 'pickup',
    city_id: body.delivery_method === 'shipping' ? body.city_id : null,
    address_text: body.delivery_method === 'shipping' ? String(body.address_text ?? '').trim() : null,
    // ⚠️ באתר הכתובת מוקלדת בעצמה ולכן מאומתת מראש; בטלפון היא מגיעה
    // מהקלטה וממתינה לאימות במשרד.
    address_confirmed: true,
    items_total_agorot: totals.items_total_agorot,
    shipping_agorot: totals.shipping_agorot,
    total_agorot: totals.total_agorot,
  }).select('id, order_number').single()

  if (orderErr || !order) {
    await release()
    console.error('[fair/checkout] order insert failed:', orderErr)
    return NextResponse.json({ error: 'יצירת ההזמנה נכשלה' }, { status: 500 })
  }

  // ── שורות ההזמנה (עם צילום מצב) ──
  const { error: itemsErr } = await db.from('book_fair_order_items').insert(
    items.map(i => ({
      order_id: order.id,
      book_id: i.book_id,
      title_snapshot: i.title,
      sku_snapshot: i.sku,
      volumes_snapshot: i.volumes,
      unit_price_agorot: i.unit_price_agorot,
      quantity: i.quantity,
      line_total_agorot: i.unit_price_agorot * i.quantity,
    }))
  )

  if (itemsErr) {
    await release()
    await db.from('book_fair_orders').delete().eq('id', order.id)
    console.error('[fair/checkout] items insert failed:', itemsErr)
    return NextResponse.json({ error: 'יצירת ההזמנה נכשלה' }, { status: 500 })
  }

  // ── אסימון המעקב ──
  // ⚠️ חתום ולא מזהה גולמי: מזהה ההזמנה בקישור היה מאפשר לקרוא הזמנות
  // אחרות בניחוש. 'f' = fair, ראו lib/publicToken.
  const trackingToken = signPublicToken('f', order.id)
  await db.from('book_fair_orders')
    .update({ tracking_token: trackingToken })
    .eq('id', order.id)

  // ── קישור השריון להזמנה ──
  await db.from('book_fair_reservations')
    .update({ order_id: order.id })
    .eq('cart_token', cartToken).eq('status', 'held')

  // ── פתיחת הסליקה ──
  const provider = await getPaymentProvider()
  const origin = request.nextUrl.origin
  const charge = await provider.createCharge({
    orderId: order.id,
    orderNumber: order.order_number,
    amountAgorot: totals.total_agorot,
    customerName: String(body.customer_name ?? ''),
    customerEmail: String(body.customer_email ?? '') || null,
    customerPhone: String(body.customer_phone ?? ''),
    returnUrl: `${origin}/fair/order/${trackingToken}`,
    description: `יריד ספרים — הזמנה ${order.order_number}`,
  })

  await db.from('book_fair_payments').insert({
    order_id: order.id,
    provider: provider.name,
    amount_agorot: totals.total_agorot,
    status: charge.ok ? 'initiated' : 'failed',
    transaction_id: charge.transactionId ?? null,
    error_message: charge.error ?? null,
  })

  if (!charge.ok) {
    await release()
    await db.from('book_fair_orders').update({ status: 'failed' }).eq('id', order.id)
    return NextResponse.json({ error: charge.error ?? 'פתיחת התשלום נכשלה' }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    orderNumber: order.order_number,
    trackingToken,
    cartToken,
    redirectUrl: charge.redirectUrl,
    total_agorot: totals.total_agorot,
  })
}
