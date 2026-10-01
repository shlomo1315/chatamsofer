import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { deliverMail } from '@/lib/sendMail'

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

  const { data: orders } = await db.from('book_fair_orders')
    .select('order_number, customer_email, tracking_token, total_agorot, status, created_at')
    .eq('customer_phone', phone)
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

  for (const [email, list] of byEmail) {
    const rows = list.map(o =>
      `<li style="margin-bottom:10px">
         <a href="${origin}/yerid/order/${o.tracking_token}" style="color:#6B2737;font-weight:600">
           הזמנה ${o.order_number}
         </a>
         — ${fmtAgorot(o.total_agorot)}
       </li>`
    ).join('')

    await deliverMail(
      email,
      'קישורי המעקב להזמנות שלך — יריד הספרים',
      `<div dir="rtl" style="font-family:system-ui,Arial,sans-serif;font-size:16px;color:#141210">
         <p>שלום,</p>
         <p>אלו ההזמנות שנרשמו עם מספר הטלפון שלך ביריד הספרים של היכל החתם סופר:</p>
         <ul style="padding-right:20px">${rows}</ul>
         <p style="color:#666;font-size:14px">
           אם לא ביקשת את ההודעה הזו, אפשר להתעלם ממנה.
         </p>
       </div>`,
    ).catch(err => {
      // ⚠️ כישלון שליחה אינו משנה את התשובה ללקוח — אחרת היא מסגירה
      // אילו כתובות קיימות.
      console.error('[fair/my-orders] mail failed:', err)
    })
  }

  return NextResponse.json(NEUTRAL)
}
