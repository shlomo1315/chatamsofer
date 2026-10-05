import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getServiceClient } from '@/lib/apiAuth'
import { nextOrderNumber } from '@/lib/bookFairCheckout'
import { SELLER_COOKIE, sellerFromRequest } from '@/lib/bookFairSeller'
import { getPaymentProvider } from '@/lib/payments'

// רישום מכירה בדוכן היריד.
//
// 🔴 שני מסלולים:
//   מזומן  — המערכת *מתעדת* בלבד, הכסף עבר ביד. ההזמנה נוצרת כ-'paid'
//            מיד ומלאי הדוכן מנוכה כאן.
//   אשראי  — סליקה אמיתית מול נדרים (charge:true). ההזמנה נוצרת
//            כ-'pending_payment', והמלאי מנוכה רק אחרי אישור התשלום
//            ב-payment-callback — אחרת נטישה באמצע הסליקה הייתה
//            מעלימה ספרים מהמדף.
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
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  // 🔴 מול הסיסמה *הנוכחית* — החלפתה מנתקת מיד (lib/bookFairSeller).
  const seller = await sellerFromRequest(request.cookies.get(SELLER_COOKIE)?.value, db)
  if (!seller) return NextResponse.json({ error: 'נדרשת התחברות מחדש' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const rawItems = Array.isArray(body.items) ? body.items as ItemInput[] : []
  if (!rawItems.length) return NextResponse.json({ error: 'לא נבחרו ספרים' }, { status: 400 })
  if (rawItems.length > 100) return NextResponse.json({ error: 'יותר מדי פריטים' }, { status: 400 })

  const paymentMethod = body.payment_method === 'cash' ? 'cash' : 'card'
  // 🔴 סליקה אמיתית בדוכן: המוכר מעביר כרטיס והלקוח משלם במקום,
  // במקום שהמכירה רק *תתועד*. בלי זה המוכר היה צריך מכשיר סליקה
  // חיצוני ולהקליד את הסכום פעמיים.
  //
  // ⚠️ מזומן לעולם אינו נסלק — אין מה לסלוק.
  const wantsCharge = paymentMethod === 'card' && body.charge === true

  // 🔴 אשראי = סליקה אמיתית בלבד (החלטת המשתמש 05.10): הכפתור "שולם
  // במכשיר חיצוני" הוסר, והשרת דוחה גם הוא "אשראי" בלי חיוב — אחרת
  // אפשר היה לרשום מכירה כשולמה בלי שאיש גבה כסף.
  if (paymentMethod === 'card' && !wantsCharge) {
    return NextResponse.json({ error: 'אשראי נגבה רק דרך מסך הסליקה' }, { status: 400 })
  }

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
  // 🔴 מספר הזמנה אמיתי רק אחרי תשלום בפועל (החלטת המשתמש 05.10), כמו
  // באתר: בסליקה — מספר זמני (TMP-) עד שנדרים מאשרת, ואז payment-callback
  // מקצה את המספר הבא. סליקה שננטשה לא שורפת מספר.
  // ⚠️ מזומן — שולם ביד, ולכן מקבל מספר מיד.
  const orderNumber = wantsCharge
    ? `TMP-${randomUUID().replace(/-/g, '').slice(0, 12)}`
    : await nextOrderNumber(db)
  const { data: order, error: orderErr } = await db.from('book_fair_orders').insert({
    order_number: orderNumber,
    channel: 'fair',
    // 🔴 'paid' מיידי רק כשאין סליקה: במזומן הכסף כבר ביד. בסליקה
    // ההזמנה ממתינה לאישור נדרים, אחרת מכירה שנדחתה בכרטיס הייתה
    // נספרת כהכנסה.
    status: wantsCharge ? 'pending_payment' : 'paid',
    // ⚠️ חותמת גם במזומן: בלעדיה ההזמנה מופיעה "שולם" בלי מתי,
    // וכל דוח הכנסות לפי תאריך תשלום מפספס אותה בשקט. בסליקה
    // החותמת נקבעת ב-payment-callback כשנדרים מאשרת.
    paid_at: wantsCharge ? null : new Date().toISOString(),
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

  // ── סליקה בכרטיס ──
  //
  // 🔴 לפני ניכוי המלאי: סליקה שנכשלת אינה מכירה, וניכוי מלאי עליה
  // היה מעלים ספרים מהמדף בלי שנמכרו.
  if (wantsCharge) {
    const provider = await getPaymentProvider()
    const origin = request.nextUrl.origin
    const charge = await provider.createCharge({
      orderId: order.id,
      orderNumber: order.order_number,
      amountAgorot: itemsTotal,
      customerName: String(body.customer_name ?? '').trim() || 'מכירה בדוכן',
      customerEmail: null,
      customerPhone: String(body.customer_phone ?? '').trim(),
      returnUrl: `${origin}/yerid/seller`,
      description: `יריד ספרים — דוכן ${order.order_number}`,
    })

    await db.from('book_fair_payments').insert({
      order_id: order.id,
      provider: provider.name,
      amount_agorot: itemsTotal,
      status: charge.ok ? 'initiated' : 'failed',
      transaction_id: charge.transactionId ?? null,
      error_message: charge.error ?? null,
    })

    if (!charge.ok) {
      // ⚠️ ההזמנה מסומנת כנכשלה ואינה נמחקת: היא ראיה לניסיון, והמוכר
      // יכול לנסות שוב במזומן בלי שהמערכת "שכחה" מה קרה.
      await db.from('book_fair_orders').update({ status: 'failed' }).eq('id', order.id)
      return NextResponse.json({ error: charge.error ?? 'פתיחת הסליקה נכשלה' }, { status: 502 })
    }

    // 🔴 המלאי *אינו* מנוכה כאן: הוא ינוכה אחרי אישור התשלום
    // (payment-callback), אחרת לקוח שנטש באמצע הסליקה היה מוריד מלאי.
    return NextResponse.json({
      ok: true,
      orderId: order.id,
      orderNumber: order.order_number,
      total_agorot: itemsTotal,
      pendingPayment: true,
      iframeTransaction: charge.iframeTransaction,
      redirectUrl: charge.redirectUrl,
    })
  }

  // ── ניכוי מלאי הדוכן (מזומן) ──
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

/**
 * מצב מכירה בסליקה — אחרי שהאייפרם דיווח הצלחה.
 *
 * ⚠️ המספר האמיתי מוקצה ב-payment-callback (שרת-אל-שרת מנדרים), שעשוי
 * להגיע שניות אחרי האייפרם. המסך שואל כאן עד שהמספר הסופי מופיע,
 * במקום להציג למוכר את המספר הזמני.
 */
export async function GET(request: NextRequest) {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })
  const seller = await sellerFromRequest(request.cookies.get(SELLER_COOKIE)?.value, db)
  if (!seller) return NextResponse.json({ error: 'נדרשת התחברות מחדש' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })

  // ⚠️ מכירות דוכן בלבד — המוכר אינו רואה הזמנות אתר/טלפון דרך כאן.
  const { data } = await db.from('book_fair_orders')
    .select('order_number, status').eq('id', id).eq('channel', 'fair').maybeSingle()
  if (!data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })

  const tmp = String(data.order_number).startsWith('TMP-')
  return NextResponse.json({ status: data.status, orderNumber: tmp ? null : data.order_number }, { headers: { 'Cache-Control': 'no-store' } })
}
