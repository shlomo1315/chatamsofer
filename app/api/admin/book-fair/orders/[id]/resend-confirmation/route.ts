import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { bookFairOrderConfirmedEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { logActivity } from '@/lib/activityLog'
import { oneOf } from '@/types/bookFair'

// ─────────────────────────────────────────────────────────────────────────────
// שליחה חוזרת של מייל אישור ההזמנה.
//
// 🔴 למה זה נדרש: המייל נשלח מתוך קולבק התשלום בלבד. הזמנה שסומנה
// כשולמה בדרך אחרת — תיקון ידני אחרי שהקולבק נכשל, או מכירה בדוכן —
// לא קיבלה מייל כלל, ואין שום דרך לשלוח אותו בדיעבד.
//
// ⚠️ אותה תבנית בדיוק כמו בקולבק: מייל "שחזור" שנראה אחרת מהמקורי
// מבלבל את הלקוח ואת הצוות.
//
// ⚠️ רק להזמנה ששולמה: אישור על הזמנה שלא שולמה הוא שקר.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PAID = ['paid', 'picking', 'packed', 'shipped', 'delivered', 'partially_refunded']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { id } = await params
  const body = await request.json().catch(() => ({})) as { to?: string }

  const { data: order } = await db.from('book_fair_orders')
    .select(`
      id, order_number, status, customer_name, customer_email,
      items_total_agorot, shipping_agorot, total_agorot,
      delivery_method, address_text, tracking_token,
      city:book_fair_cities(name)
    `)
    .eq('id', id).maybeSingle()

  if (!order) return NextResponse.json({ error: 'ההזמנה לא נמצאה' }, { status: 404 })

  if (!PAID.includes(String(order.status))) {
    return NextResponse.json({
      error: 'אפשר לשלוח אישור רק להזמנה ששולמה',
    }, { status: 400 })
  }

  // ⚠️ כתובת מפורשת גוברת: הזמנה טלפונית אינה שומרת מייל, והצוות
  // מזין אותו ידנית מתוך השיחה עם הלקוח.
  const to = String(body.to ?? '').trim() || String(order.customer_email ?? '').trim()
  if (!to) {
    return NextResponse.json({
      error: 'אין כתובת מייל להזמנה זו — הזינו כתובת',
    }, { status: 400 })
  }

  await ensureEmailTexts()

  const { data: items } = await db.from('book_fair_order_items')
    .select('title_snapshot, quantity, line_total_agorot')
    .eq('order_id', order.id)

  const mail = bookFairOrderConfirmedEmail({
    orderNumber: order.order_number as string,
    customerName: order.customer_name as string | null,
    items: (items ?? []).map(i => ({
      title: i.title_snapshot as string,
      quantity: i.quantity as number,
      lineTotalAgorot: i.line_total_agorot as number,
    })),
    itemsTotalAgorot: order.items_total_agorot as number,
    shippingAgorot: order.shipping_agorot as number,
    totalAgorot: order.total_agorot as number,
    deliveryMethod: order.delivery_method === 'pickup' ? 'pickup' : 'shipping',
    address: order.address_text as string | null,
    // ⚠️ join של Supabase מגיע כמערך או כאובייקט — oneOf מנרמל.
    cityName: oneOf(order.city as { name: string } | { name: string }[] | null)?.name ?? null,
    trackingToken: order.tracking_token as string | null,
  })

  // transactional: אישור הזמנה אינו דיוור — בלי מעקב פתיחות ובלי
  // List-Unsubscribe, שרק היו פוגעים במסירה.
  const sent = await deliverMail(to, mail.subject, mail.html, undefined, {
    ...mailFor('yerid'), transactional: true,
  })

  if (!sent.ok) {
    console.error(`[book-fair/resend] מייל להזמנה ${order.order_number} נכשל:`, sent.error)
    return NextResponse.json({ error: sent.error ?? 'שליחת המייל נכשלה' }, { status: 502 })
  }

  // ⚠️ נשמר על ההזמנה כשהוזנה כתובת חדשה — אחרת היא תאבד בשליחה הבאה.
  if (!order.customer_email && body.to) {
    await db.from('book_fair_orders').update({ customer_email: to }).eq('id', id)
  }

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'book_fair_order',
    entityId: id,
    details: { order: order.order_number, resent_confirmation_to: to },
  })

  return NextResponse.json({ ok: true, to })
}
