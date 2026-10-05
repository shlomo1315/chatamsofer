import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { getPaymentProvider, sanitizeProviderResponse, verifyNedarimSignature } from '@/lib/payments'
import { classifyCallbackSource } from '@/lib/payments/callbackSource'
import { getPaymentSettings } from '@/lib/payments/settings'
import { clientIpOrNull, forwardedIps } from '@/lib/rateLimit'
import { amountMatches } from '@/lib/bookFairPricing'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { bookFairOrderConfirmedEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { nextOrderNumber } from '@/lib/bookFairCheckout'
import { oneOf } from '@/types/bookFair'

// דיווח תשלום מספק הסליקה — הנקודה היחידה שבה הזמנה מסומנת כשולמה.
//
// 🔴 הנתיב פתוח בהכרח (הספק קורא אליו משרת שלו), ולכן הדיווח עצמו
// אינו נאמן: כל אחד יכול לשלוח בקשה שאומרת "הזמנה X שולמה". ארבע
// שכבות ההגנה:
//   0. (נדרים) חתימת HMAC על הגוף הגולמי + כתובת IP מוכרת
//   1. verifyCallback של הספק מאמת מבנה — הדיווח הוא רמז, לא ראיה
//   2. השוואת סכום מדויקת מול ההזמנה
//   3. עמידות בקריאה כפולה — ספקים שולחים שוב כשלא קיבלו תשובה מהר

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RequestContext {
  clientIp: string | null
  rawBody: string | null
  tsHeader: string | null
  sigHeader: string | null
  /** כל הכתובות בשרשרת — ראו ההערה בבדיקת ה-IP למטה. */
  forwardedIps?: string[]
  /** הכותרות הגולמיות — לסיווג המקור (lib/payments/callbackSource). */
  xff?: string | null
  realIp?: string | null
}

async function handle(raw: Record<string, unknown>, ctx: RequestContext) {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה' }, { status: 500 })

  const provider = await getPaymentProvider()

  // ── שכבה 0: נדרים בלבד — חתימת HMAC + כתובת IP מוכרת ──
  //
  // 🔴 שתיהן בדיקה משלימה, לא תחליפית: החתימה נשברת אם המפתח לא הוגדר
  // (fail-open בכוונה — ראו למטה), וה-IP נשבר אם נדרים מחדשים כתובות
  // בלי הודעה. שתיהן יחד הן ההגנה שהתיעוד ממליץ עליה.
  let source: 'trusted' | 'spoofed' | 'unknown' | 'n/a' = 'n/a'
  if (provider.name === 'nedarim') {
    // 🔴 רק שתי הכתובות האחרונות בשרשרת נאמנות (ביקורת אבטחה 05.10).
    //
    // ⚠️ הגרסה הקודמת קיבלה כתובת של נדרים *בכל מקום* בשרשרת — כולל
    // הערכים הראשונים, שהשולח כותב בעצמו. `X-Forwarded-For: 18.196.146.117`
    // עבר, ובלי מפתח חתימה כל אחד יכול היה לסמן הזמנה כשולמה.
    //
    // ⚠️ 'spoofed' אינו נדחה: הוא מועבר לבדיקת אנוש (למטה). כך, אם ההנחה
    // על מבנה השרשרת שגויה, תשלום אמיתי לא ייאבד כמו ב-04.10.
    source = classifyCallbackSource(ctx.xff ?? null, ctx.realIp ?? null)
    console.log(`[fair/callback] מקור: ${source} · xff="${ctx.xff ?? ''}" · real="${ctx.realIp ?? ''}"`)
    if (source === 'unknown') {
      console.warn(`[fair/callback] דיווח מכתובת IP לא מוכרת (${ctx.xff ?? ctx.realIp ?? '?'}) — נדחה`)
      return NextResponse.json({ error: 'מקור לא מוכר' }, { status: 403 })
    }

    const settings = await getPaymentSettings()
    const secret = (settings.webhookSecret ?? '').trim()
    // ⚠️ fail-open אם לא הוגדר מפתח: החתימה היא הגנה נוספת מעל ה-IP,
    // לא היחידה. מוסד שלא הפעיל אותה בצד נדרים ממשיך לקבל עדכונים
    // בדיוק כמו קודם — בדיוק ההתנהגות שהתיעוד מתאר.
    if (secret) {
      if (!verifyNedarimSignature(ctx.rawBody ?? '', ctx.tsHeader, ctx.sigHeader, secret)) {
        console.warn('[fair/callback] חתימת HMAC לא תקינה — נדחה')
        return NextResponse.json({ error: 'חתימה לא תקינה' }, { status: 401 })
      }
      // חתימה תקינה היא הוכחה חזקה מכל כתובת — אין צורך בבדיקת אנוש.
      source = 'trusted'
    }
  }
  // 🔴 דיווח שמקורו לא אומת — לא מסמנים שולם ולא מסמנים נכשל.
  const hold = source === 'spoofed'

  // ── שכבה 1: אימות מול הספק ──
  const verified = await provider.verifyCallback(raw)
  if (!verified) {
    // ─────────────────────────────────────────────────────────────────────
    // 🔴 סירוב בלי מזהים — מאשרים קבלה (200) ולא דוחים.
    //
    // 05.10 20:09: נדרים שלחה { Status:"Error", Message:"CVV ERROR" } בלי
    // Param2 ובלי TransactionId (הכרטיס נדחה לפני שנוצרה עסקה). ה-400 שלנו
    // נקרא אצלם "הקאלבק לא התקבל" ושלח מייל תקלה למוסד. אין כאן שום
    // פעולה לבצע — אין הזמנה לקשר ואין כסף שעבר — רק לתעד.
    //
    // ⚠️ בטוח גם מול זיוף: התשובה אינה משנה דבר במסד.
    // ─────────────────────────────────────────────────────────────────────
    const st = String((raw as Record<string, unknown>).Status ?? '').toUpperCase()
    if (st === 'ERROR') {
      const msg = String((raw as Record<string, unknown>).Message ?? '').slice(0, 120)
      console.warn(`[fair/callback] סירוב בלי מזהה הזמנה — אין מה לעדכן: ${msg}`)
      return NextResponse.json({ ok: true, ignored: 'decline-without-order' })
    }
    console.warn('[fair/callback] דיווח שלא אומת נדחה')
    return NextResponse.json({ error: 'דיווח לא תקין' }, { status: 400 })
  }

  // ⚠️ נשלפים גם שדות הלקוח והמשלוח — הם דרושים למייל האישור בהמשך,
  // ושליפה שנייה שם הייתה מרוץ מול עדכון הסטטוס.
  const { data: order } = await db.from('book_fair_orders')
    // ⚠️ channel נדרש לניכוי מלאי הדוכן למטה — בלעדיו התנאי תמיד שקרי
    // ומכירה בדוכן לא הייתה מורידה מלאי כלל.
    .select('id, order_number, status, channel, total_agorot, items_total_agorot, shipping_agorot, customer_name, customer_email, delivery_method, address_text, tracking_token, city:book_fair_cities(name)')
    // 🔴 order_number ולא id: נדרים מחזירה ב-Param2 את *מספר ההזמנה*
    // ("121213"), ולא את ה-UUID. ההשוואה ל-id לא התאימה לעולם, הקולבק
    // נדחה עם "דיווח על הזמנה שאינה קיימת", והלקוח חויב בעוד ההזמנה
    // נשארה "ממתין לתשלום" לנצח.
    //
    // ⚠️ בטלפון זה לא התגלה: שם ימות מדווחת ישירות לוובהוק ולא דרך
    // הקולבק הזה, ולכן רק הזמנות האתר נתקעו.
    .eq('order_number', verified.orderId).maybeSingle()

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
    // 🔴 "נכשל" ממקור לא מאומת מתעלם: אחרת זיוף היה מבטל הזמנה של
    // מישהו אחר ומשחרר את המלאי שלה.
    if (hold) {
      console.error(`[fair/callback] 🔴 דיווח כישלון ממקור לא מאומת להזמנה ${order.order_number} — התעלמות`)
      return NextResponse.json({ ok: true, ignored: true })
    }
    await db.from('book_fair_payments').insert({
      order_id: order.id, provider: provider.name,
      amount_agorot: verified.amountAgorot, status: 'failed',
      transaction_id: verified.transactionId, provider_response: clean,
    })
    await db.from('book_fair_orders').update({ status: 'failed' }).eq('id', order.id).eq('status', 'pending_payment')

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
  if (hold || !amountMatches(verified.amountAgorot, order.total_agorot)) {
    console.error(
      hold ? `[fair/callback] 🔴 דיווח הצלחה ממקור לא מאומת — הזמנה ${order.order_number} הועברה לבדיקת אנוש` : `[fair/callback] אי-התאמה בסכום: הזמנה ${order.order_number} על ${order.total_agorot} אגורות, נגבו ${verified.amountAgorot}`
    )
    await db.from('book_fair_payments').insert({
      order_id: order.id, provider: provider.name,
      amount_agorot: verified.amountAgorot, status: 'success',
      transaction_id: verified.transactionId, provider_response: clean,
      error_message: hold
        ? '🔴 מקור הדיווח לא אומת (כתובת IP) — לוודא בנדרים שהעסקה קיימת לפני משלוח'
        : `סכום שנגבה (${verified.amountAgorot}) אינו תואם להזמנה (${order.total_agorot})`,
    })
    await db.from('book_fair_orders')
      .update({ status: 'payment_mismatch', paid_at: new Date().toISOString() })
      .eq('id', order.id).eq('status', 'pending_payment')

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
  // 🔴 כאן, ורק כאן, מוקצה מספר ההזמנה: עד לרגע הזה השורה נושאת
  // מספר זמני (TMP-), כדי שמי שנטש את דף הסליקה לא ישרוף מספר
  // שהלקוח הבא היה אמור לקבל.
  //
  // ⚠️ נבדק שהמספר עדיין זמני — דיווח כפול לא ישנה מספר שכבר נמסר.
  const paidPatch: Record<string, unknown> = {
    status: 'paid',
    paid_at: new Date().toISOString(),
  }
  if (String(order.order_number ?? '').startsWith('TMP-')) {
    paidPatch.order_number = await nextOrderNumber(db)
  }

  const { data: updated } = await db.from('book_fair_orders')
    .update(paidPatch)
    .eq('id', order.id).eq('status', 'pending_payment')
    .select('id, order_number').maybeSingle()

  if (!updated) return NextResponse.json({ ok: true, alreadyProcessed: true })

  // ⚠️ המספר החדש נכנס לאובייקט המקומי: מייל האישור ודף המעקב
  // למטה קוראים ממנו, והיו שולחים את ה-TMP ללקוח.
  if (updated.order_number) order.order_number = updated.order_number as string

  // ── מימוש השריון ──
  // ⚠️ אינו נוגע במלאי (הוא נוכה בשריון) — רק מסמן שלא יוחזר בפקיעה.
  const { data: res } = await db.from('book_fair_reservations')
    .select('cart_token').eq('order_id', order.id).eq('status', 'held').limit(1)
  if (res?.[0]) {
    await db.rpc('book_fair_consume', { p_cart_token: res[0].cart_token, p_order_id: order.id })
  }

  // ── מלאי הדוכן (ערוץ 'fair') ──
  //
  // 🔴 מכירה בדוכן אינה עוברת שריון — היא מנכה ממאגר נפרד (stock_fair)
  // רק אחרי שהתשלום אושר. בלי זה סליקה בדוכן הייתה נרשמת כהכנסה
  // והמלאי היה נשאר כאילו לא נמכר דבר.
  //
  // ⚠️ כאן ולא ב-sale: לקוח שנטש באמצע הסליקה אינו אמור להוריד מלאי.
  if (order.channel === 'fair') {
    const { data: items } = await db.from('book_fair_order_items')
      .select('book_id, quantity').eq('order_id', order.id)
    if (items?.length) {
      const { error: stockErr } = await db.rpc('book_fair_fair_sale', {
        p_items: items.map(i => ({ book_id: i.book_id, quantity: i.quantity })),
        p_by: 'סליקה בדוכן',
      })
      // ⚠️ כשל כאן אינו הופך תשלום שהתקבל לכישלון — רק מלאי לא מדויק
      // שאפשר לתקן בספירה.
      if (stockErr) console.error('[fair/callback] ניכוי מלאי הדוכן נכשל:', stockErr.message)
    }
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
  const ctx: RequestContext = {
    clientIp: clientIpOrNull(request), forwardedIps: forwardedIps(request),
    xff: request.headers.get('x-forwarded-for'), realIp: request.headers.get('x-real-ip'),
    rawBody: null,
    tsHeader: request.headers.get('x-nedarim-timestamp'),
    sigHeader: request.headers.get('x-nedarim-signature'),
  }

  let raw: Record<string, unknown> = {}
  const ct = request.headers.get('content-type') ?? ''
  try {
    if (ct.includes('json')) {
      // 🔴 חייב את הבייטים הגולמיים בדיוק כפי שהתקבלו לצורך אימות ה-HMAC
      // (ראו verifyNedarimSignature) — JSON.parse ואז JSON.stringify
      // מחדש היה יכול לשנות רווחים/סדר שדות ולפסול חתימה תקינה.
      ctx.rawBody = await request.text()
      raw = JSON.parse(ctx.rawBody)
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

  return handle(raw, ctx)
}

/** ⚠️ חלק מהספקים מדווחים ב-GET. אותה לוגיקה בדיוק (בלי חתימת HMAC —
 * זו חתומה על גוף POST בלבד). */
export async function GET(request: NextRequest) {
  return handle(Object.fromEntries(request.nextUrl.searchParams), {
    clientIp: clientIpOrNull(request), forwardedIps: forwardedIps(request),
    xff: request.headers.get('x-forwarded-for'), realIp: request.headers.get('x-real-ip'),
    rawBody: null, tsHeader: null, sigHeader: null,
  })
}
