import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { bookFairTrackingLinksEmail } from '@/lib/emailTemplates'

// "האזור האישי" — שליחת קישורי המעקב של הלקוח למייל שלו.
//
// 🔴 התשובה אינה מכילה את ההזמנות. הטלפון הוא מידע שקל לנחש, ואילו
// החזרת רשימת ההזמנות לפיו הייתה הופכת כל מספר טלפון למפתח לשמות,
// לכתובות ולסכומים של אדם אחר. במקום זאת הקישורים נשלחים *למייל
// שנרשם בהזמנה עצמה* — מי שאינו בעל התיבה אינו מקבל דבר.
//
// 🔴 התשובה זהה בין אם נמצאו הזמנות ובין אם לא. תשובה שונה הייתה
// מאשרת לתוקף שהמספר קיים במערכת.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** אותה תשובה בכל מקרה — ראו ההערה בראש הקובץ. */
const NEUTRAL = {
  ok: true,
  message: 'אם קיימות הזמנות עם מספר הטלפון הזה, קישורי המעקב נשלחו לכתובת המייל שנרשמה בהן.',
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request)
  // ⚠️ 5 בקשות בשעה: הנתיב שולח מייל, ובלי הגבלה הוא הופך לכלי הצפה.
  if (!rateLimit(`fair-my-orders:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב בעוד שעה.' }, { status: 429 })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const phone = String(body.phone ?? '').replace(/\D/g, '')
  if (!/^0\d{8,9}$/.test(phone)) {
    return NextResponse.json({ error: 'מספר טלפון לא תקין' }, { status: 400 })
  }

  // 🔴 רק הזמנות ששולמו: ניסיון שלא הושלם נשאר כ-cancelled/failed,
  // ובערב הפתיחה אלה היו רוב השורות. לקוח שקיבל קישור להזמנה
  // מבוטלת חשב שהיא קיימת, ופנה למשרד.
  //
  // ⚠️ pending_payment גם הוא אינו נשלח — הוא עדיין לא הזמנה.
  const VISIBLE = ['paid', 'picking', 'shipped', 'delivered', 'payment_mismatch']

  const { data: orders } = await db.from('book_fair_orders')
    .select('id, order_number, customer_email, tracking_token, total_agorot, status, created_at, paid_at')
    .eq('customer_phone', phone)
    .in('status', VISIBLE)
    .not('tracking_token', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20)

  // ⚠️ הזמנות בלי מייל אינן ניתנות לשליחה — אין לאן.
  const sendable = (orders ?? []).filter(o => o.customer_email)
  if (!sendable.length) return NextResponse.json(NEUTRAL)

  // ⚠️ קיבוץ לפי מייל: לקוח שהזמין פעמיים מאותו טלפון עם שתי כתובות
  // מקבל בכל תיבה רק את ההזמנות ששייכות לה.
  const byEmail = new Map<string, typeof sendable>()
  for (const o of sendable) {
    const key = o.customer_email!.toLowerCase()
    const list = byEmail.get(key)
    if (list) list.push(o)
    else byEmail.set(key, [o])
  }

  const origin = request.nextUrl.origin

  // ⚠️ הספרים נשלפים בשאילתה אחת לכל ההזמנות ולא אחת לכל הזמנה.
  const ids = sendable.map(o => o.id)
  const { data: itemRows } = await db.from('book_fair_order_items')
    .select('order_id, title, quantity')
    .in('order_id', ids)
  const itemsByOrder = new Map<string, { title: string; quantity: number }[]>()
  for (const it of itemRows ?? []) {
    const list = itemsByOrder.get(it.order_id as string) ?? []
    list.push({ title: String(it.title), quantity: Number(it.quantity) })
    itemsByOrder.set(it.order_id as string, list)
  }

  // ארבע ספרות הכרטיס — מתוך תגובת הספק שנשמרה בתשלום.
  // ⚠️ best-effort: הזמנה ישנה או ספק אחר עשויים שלא להחזיר אותן,
  // ואז השורה פשוט אינה מוצגת.
  const { data: payRows } = await db.from('book_fair_payments')
    .select('order_id, provider_response')
    .in('order_id', ids).eq('status', 'success')
  const last4ByOrder = new Map<string, string>()
  for (const p of payRows ?? []) {
    const raw = p.provider_response as Record<string, unknown> | null
    const n = String(raw?.LastNum ?? raw?.lastNum ?? '').trim()
    if (n) last4ByOrder.set(p.order_id as string, n.slice(-4))
  }

  for (const [email, list] of byEmail) {
    const built = bookFairTrackingLinksEmail({
      portalBase: origin,
      orders: list.map(o => ({
        orderNumber: o.order_number,
        totalAgorot: o.total_agorot,
        trackingToken: o.tracking_token as string,
        paidAt: o.paid_at as string | null,
        status: o.status as string,
        cardLast4: last4ByOrder.get(o.id as string) ?? null,
        items: itemsByOrder.get(o.id as string) ?? [],
      })),
    })

    // 🔴 הסדר הוא (to, subject, html) — לא (subject, html, to).
    // ⚠️ mailFor('yerid') ולא ברירת המחדל: המייל יצא מ-office@ והלקוח
    // שהשיב פנה למשרד הראשי במקום ליריד.
    await deliverMail(email, built.subject, built.html, undefined, mailFor('yerid'))
      .catch(err => {
        // ⚠️ כישלון שליחה אינו משנה את התשובה ללקוח — אחרת היא מסגירה
        // אילו כתובות קיימות.
        console.error('[fair/my-orders] mail failed:', err)
      })
  }

  return NextResponse.json(NEUTRAL)
}
