import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { getPaymentProvider, sanitizeProviderResponse } from '@/lib/payments'
import { amountMatches } from '@/lib/bookFairPricing'

// דיווח תשלום מספק הסליקה — הנקודה היחידה שבה הזמנה מסומנת כשולמה.
//
// 🔴 הנתיב פתוח בהכרח (הספק קורא אליו משרת שלו), ולכן הדיווח עצמו
// אינו נאמן: כל אחד יכול לשלוח בקשה שאומרת "הזמנה X שולמה". שלוש
// שכבות ההגנה:
//   1. verifyCallback של הספק מאמת מולו — הדיווח הוא רמז, לא ראיה
//   2. השוואת סכום מדויקת מול ההזמנה
//   3. עמידות בקריאה כפולה — ספקים שולחים שוב כשלא קיבלו תשובה מהר

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function handle(raw: Record<string, unknown>) {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה' }, { status: 500 })

  const provider = await getPaymentProvider()

  // ── שכבה 1: אימות מול הספק ──
  const verified = await provider.verifyCallback(raw)
  if (!verified) {
    console.warn('[fair/callback] דיווח שלא אומת נדחה')
    return NextResponse.json({ error: 'דיווח לא תקין' }, { status: 400 })
  }

  const { data: order } = await db.from('book_fair_orders')
    .select('id, order_number, status, total_agorot')
    .eq('id', verified.orderId).maybeSingle()

  if (!order) {
    console.warn('[fair/callback] דיווח על הזמנה שאינה קיימת:', verified.orderId)
    return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 })
  }

  // ── שכבה 3: עמידות בקריאה כפולה ──
  // ⚠️ הזמנה שכבר טופלה מחזירה 200 ולא שגיאה: הספק מפרש שגיאה כ"לא
  // התקבל" וישלח שוב, בלולאה.
  if (order.status !== 'pending_payment') {
    return NextResponse.json({ ok: true, alreadyProcessed: true })
  }

  const clean = sanitizeProviderResponse(verified.raw ?? raw)

  // ── כישלון ──
  if (verified.status === 'failed') {
    await db.from('book_fair_payments').insert({
      order_id: order.id, provider: provider.name,
      amount_agorot: verified.amountAgorot, status: 'failed',
      transaction_id: verified.transactionId, provider_response: clean,
    })
    await db.from('book_fair_orders').update({ status: 'failed' }).eq('id', order.id)

    // 🔴 שחרור המלאי: אחרת עותקים של הזמנה שנכשלה ננעלים עד הפקיעה.
    await db.from('book_fair_reservations')
      .select('cart_token').eq('order_id', order.id).eq('status', 'held').limit(1)
      .then(async ({ data }) => {
        if (data?.[0]) await db.rpc('book_fair_release', { p_cart_token: data[0].cart_token })
      })

    return NextResponse.json({ ok: true, status: 'failed' })
  }

  // ── שכבה 2: השוואת סכום ──
  // 🔴 אי-התאמה אינה מסומנת כשולמה ואינה מסומנת ככשל: הכסף *כן* נגבה,
  // אך לא בסכום הנכון. זו הכרעת אנוש, והיא עולה למסך הניהול.
  if (!amountMatches(verified.amountAgorot, order.total_agorot)) {
    console.error(
      `[fair/callback] אי-התאמה בסכום: הזמנה ${order.order_number} על ${order.total_agorot} אגורות, נגבו ${verified.amountAgorot}`
    )
    await db.from('book_fair_payments').insert({
      order_id: order.id, provider: provider.name,
      amount_agorot: verified.amountAgorot, status: 'success',
      transaction_id: verified.transactionId, provider_response: clean,
      error_message: `סכום שנגבה (${verified.amountAgorot}) אינו תואם להזמנה (${order.total_agorot})`,
    })
    await db.from('book_fair_orders')
      .update({ status: 'payment_mismatch', paid_at: new Date().toISOString() })
      .eq('id', order.id)

    return NextResponse.json({ ok: true, status: 'mismatch' })
  }

  // ── הצלחה ──
  await db.from('book_fair_payments').insert({
    order_id: order.id, provider: provider.name,
    amount_agorot: verified.amountAgorot, status: 'success',
    transaction_id: verified.transactionId, provider_response: clean,
  })

  // ⚠️ התנאי על pending_payment חוזר כאן ולא רק למעלה: בין הבדיקה
  // לעדכון עשויה לרוץ קריאה כפולה מקבילה. השורה תתעדכן פעם אחת בלבד.
  const { data: updated } = await db.from('book_fair_orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', order.id).eq('status', 'pending_payment')
    .select('id').maybeSingle()

  if (!updated) return NextResponse.json({ ok: true, alreadyProcessed: true })

  // ── מימוש השריון ──
  // ⚠️ אינו נוגע במלאי (הוא נוכה בשריון) — רק מסמן שלא יוחזר בפקיעה.
  const { data: res } = await db.from('book_fair_reservations')
    .select('cart_token').eq('order_id', order.id).eq('status', 'held').limit(1)
  if (res?.[0]) {
    await db.rpc('book_fair_consume', { p_cart_token: res[0].cart_token, p_order_id: order.id })
  }

  return NextResponse.json({ ok: true, status: 'paid', orderNumber: order.order_number })
}

export async function POST(request: NextRequest) {
  let raw: Record<string, unknown> = {}
  const ct = request.headers.get('content-type') ?? ''
  try {
    if (ct.includes('json')) {
      raw = await request.json()
    } else {
      // ⚠️ ספקים ישראליים שולחים לרוב form-urlencoded ולא JSON
      const form = await request.formData()
      raw = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]))
    }
  } catch { /* ייפול לבדיקת הפרמטרים בכתובת */ }

  // גם פרמטרים בכתובת — חלק מהספקים שולחים כך
  for (const [k, v] of request.nextUrl.searchParams) {
    if (!(k in raw)) raw[k] = v
  }

  return handle(raw)
}

/** ⚠️ חלק מהספקים מדווחים ב-GET. אותה לוגיקה בדיוק. */
export async function GET(request: NextRequest) {
  return handle(Object.fromEntries(request.nextUrl.searchParams))
}
