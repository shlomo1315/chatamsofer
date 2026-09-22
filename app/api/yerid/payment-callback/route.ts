import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { getPaymentProvider, sanitizeProviderResponse } from '@/lib/payments'
import { amountMatches } from '@/lib/bookFairPricing'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { bookFairOrderConfirmedEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { oneOf } from '@/types/bookFair'

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

  // ⚠️ נשלפים גם שדות הלקוח והמשלוח — הם דרושים למייל האישור בהמשך,
  // ושליפה שנייה שם הייתה מרוץ מול עדכון הסטטוס.
  const { data: order } = await db.from('book_fair_orders')
    .select('id, order_number, status, total_agorot, items_total_agorot, shipping_agorot, customer_name, customer_email, delivery_method, address_text, tracking_token, city:book_fair_cities(name)')
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

  // ─────────────────────────────────────────────────────────────────────────
  // ── מייל אישור ללקוח ──
  //
  // 🔴 הטופס בחנות מבטיח "לקבלת אישור וקישור למעקב", והאימייל נשמר —
  // אך עד היום איש לא שלח אליו דבר.
  //
  // ⚠️ כאן ולא בצ'קאאוט: הזמנה שנוצרה וטרם שולמה אינה מאושרת. וכאן
  // *אחרי* ה-update המותנה, שהוא הנקודה היחידה שמתרחשת פעם אחת בדיוק
  // להזמנה — דיווח כפול מהספק לא ישלח מייל שני.
  //
  // ⚠️ אינו חוסם את התשובה לספק: ספק שאינו מקבל 200 מהר מדווח שוב,
  // ושליחת מייל אינה סיבה להזמין דיווח חוזר. כשל במייל אינו הופך
  // תשלום שהתקבל לכישלון.
  // ─────────────────────────────────────────────────────────────────────────
  if (order.customer_email) {
    const to = order.customer_email as string
    void (async () => {
      // ⚠️ לפני בניית התבנית ולא לפני השליחה: התבנית קוראת את הטקסטים
      // הערוכים סינכרונית, וטעינה מאוחרת הייתה מרעננת מטמון שכבר שימש.
      await ensureEmailTexts()

      const { data: items } = await db.from('book_fair_order_items')
        .select('title_snapshot, quantity, line_total_agorot')
        .eq('order_id', order.id)

      const mail = bookFairOrderConfirmedEmail({
        orderNumber: order.order_number as string,
        customerName: order.customer_name as string | null,
        items: (items ?? []).map((i: { title_snapshot: string; quantity: number; line_total_agorot: number }) => ({
          title: i.title_snapshot, quantity: i.quantity, lineTotalAgorot: i.line_total_agorot,
        })),
        itemsTotalAgorot: order.items_total_agorot as number,
        shippingAgorot: order.shipping_agorot as number,
        totalAgorot: order.total_agorot as number,
        deliveryMethod: order.delivery_method === 'pickup' ? 'pickup' : 'shipping',
        address: order.address_text as string | null,
        // ⚠️ join של Supabase מגיע כמערך או כאובייקט — oneOf מנרמל.
        cityName: oneOf(order.city as { name: string } | { name: string }[] | null)?.name ?? null,
        // ⚠️ הטוקן נשלף ואינו נחתם מחדש: הוא כבר נוצר בצ'קאאוט ונשמר.
        trackingToken: order.tracking_token as string | null,
      })

      // transactional: אישור הזמנה אינו דיוור — בלי מעקב פתיחות
      // ובלי List-Unsubscribe, שרק היו פוגעים במסירה.
      const sent = await deliverMail(to, mail.subject, mail.html, undefined, {
        ...mailFor('yerid'), transactional: true,
      })
      if (!sent.ok) {
        console.error(`[fair/callback] מייל אישור להזמנה ${order.order_number} נכשל:`, sent.error)
      }
    })().catch(err => {
      console.error(`[fair/callback] בניית מייל האישור נכשלה (${order.order_number}):`, err)
    })
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
