import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'

// הודעה אישית לכל מי שהזמין דרך האתר — עם הקישור הישיר להזמנה שלו,
// ומעקב מי פתח ומי נכנס להזמנה (09.10).
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.
//
// 🔴 מייל אחד לכל כתובת, ובו כל ההזמנות שלה: לקוח עם שתי הזמנות היה
// מקבל אחרת את אותה הודעה פעמיים. (וגם: UNIQUE(newsletter_id, email)).
//
// ⚠️ הודעת שירות על הזמנה קיימת ולא דיוור שיווקי — לכן נשלחת גם למי
// שהסיר את עצמו מרשימת התפוצה.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const AUDIENCE = 'order_notice'

// הזמנות חיות בלבד: מבוטלת/נכשלה לא שולמה, ומזוכה במלואה כבר אינה הזמנה.
const LIVE_STATUSES = ['paid', 'picking', 'packed', 'shipped', 'delivered', 'partially_refunded']

type OrderRow = {
  order_number: string
  customer_name: string | null
  customer_email: string | null
  tracking_token: string | null
  total_agorot: number | null
  created_at: string
}

type Group = {
  email: string
  name: string | null
  orders: { orderNumber: string; totalAgorot: number; token: string }[]
}

/** הדיוורים מהסוג הזה + הנמענים של האחרון (או של ?id). */
export async function GET(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { data: notices, error } = await db.from('book_fair_newsletters')
    .select('id, subject, status, total, sent_count, failed_count, created_at, sent_at')
    .eq('audience', AUDIENCE)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: 'טעינה נכשלה' }, { status: 500 })

  const id = request.nextUrl.searchParams.get('id') || notices?.[0]?.id
  let recipients: unknown[] = []
  if (id) {
    const { rows } = await fetchAllRows<Record<string, unknown>>(
      (from, to) => db.from('book_fair_newsletter_recipients')
        .select('id, email, customer_name, order_numbers, status, error, sent_at, opened_at, clicked_at, open_count')
        .eq('newsletter_id', id)
        .order('email')
        .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>
    )
    recipients = rows
  }

  // כמה יקבלו אם ישלחו עכשיו — מוצג לפני הלחיצה.
  const groups = await loadGroups(db)
  return NextResponse.json({ notices: notices ?? [], selectedId: id ?? null, recipients, audienceSize: groups.length })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: { subject?: unknown; message?: unknown; test?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const subject = String(body.subject ?? '').trim()
  const message = String(body.message ?? '').trim()
  if (!subject) return NextResponse.json({ error: 'חסר נושא' }, { status: 400 })
  if (subject.length > 200) return NextResponse.json({ error: 'הנושא ארוך מדי' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'חסר תוכן' }, { status: 400 })

  const { deliverMail } = await import('@/lib/sendMail')
  const { mailFor } = await import('@/lib/departments')
  const { bookFairOrderNoticeEmail } = await import('@/lib/emailTemplates')

  // 🔴 לא request.nextUrl.origin: מאחורי Railway הוא localhost:8080.
  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
  const groups = await loadGroups(db)
  if (!groups.length) return NextResponse.json({ error: 'לא נמצאו הזמנות אתר פעילות' }, { status: 400 })

  const build = (g: Group, recipientId: string | null) => bookFairOrderNoticeEmail({
    subject,
    name: g.name,
    body: message,
    orders: g.orders.map(o => ({
      orderNumber: o.orderNumber,
      totalAgorot: o.totalAgorot,
      url: `${base}/api/yerid/nl-click?o=${encodeURIComponent(o.token)}${recipientId ? `&r=${recipientId}` : ''}`,
    })),
    pixelUrl: recipientId ? `${base}/api/yerid/nl-open?r=${recipientId}` : undefined,
  })

  // ── שליחת מבחן — עם נתוני הלקוח הראשון, כדי לראות מייל אמיתי ──
  const testTo = String(body.test ?? '').trim()
  if (testTo) {
    const mail = build(groups[0], null)
    const res = await deliverMail(testTo, `[מבחן] ${mail.subject}`, mail.html, undefined, {
      ...mailFor('yerid'), transactional: true,
    })
    return res.ok
      ? NextResponse.json({ ok: true, test: true })
      : NextResponse.json({ error: res.error ?? 'שליחת המבחן נכשלה' }, { status: 500 })
  }

  // 🔴 מנעול: שתי לחיצות או שתי לשוניות היו שולחות לכולם פעמיים.
  const { data: running } = await db.from('book_fair_newsletters')
    .select('id').eq('audience', AUDIENCE).eq('status', 'sending').limit(1)
  if (running?.length) return NextResponse.json({ error: 'שליחה כבר מתבצעת כעת' }, { status: 409 })

  const { data: nl, error: nlErr } = await db.from('book_fair_newsletters')
    .insert({ subject, body: message, audience: AUDIENCE, status: 'sending', total: groups.length, created_by: staff.userId })
    .select('id').single()
  if (nlErr || !nl) {
    console.error('[fair/order-notice] create failed:', nlErr)
    return NextResponse.json({ error: 'יצירת הדיוור נכשלה' }, { status: 500 })
  }

  // ⚠️ הנמענים נרשמים לפני השליחה — המזהה שלהם הוא מה שנכנס לקישורי המעקב.
  const { data: inserted, error: insErr } = await db.from('book_fair_newsletter_recipients')
    .insert(groups.map(g => ({
      newsletter_id: nl.id,
      email: g.email,
      customer_name: g.name,
      order_numbers: g.orders.map(o => o.orderNumber).join(', '),
    })))
    .select('id, email')
  if (insErr || !inserted) {
    await db.from('book_fair_newsletters').update({ status: 'failed' }).eq('id', nl.id)
    console.error('[fair/order-notice] recipients insert failed:', insErr)
    return NextResponse.json({ error: 'רישום הנמענים נכשל' }, { status: 500 })
  }
  const idByEmail = new Map(inserted.map(r => [String(r.email), String(r.id)]))

  let sent = 0, failed = 0
  for (const g of groups) {
    const rid = idByEmail.get(g.email)
    if (!rid) continue
    const mail = build(g, rid)
    const res = await deliverMail(g.email, mail.subject, mail.html, undefined, mailFor('yerid'))
    await db.from('book_fair_newsletter_recipients')
      .update({
        status: res.ok ? 'sent' : 'failed',
        error: res.ok ? null : (res.error ?? 'שגיאה לא ידועה').slice(0, 500),
        sent_at: res.ok ? new Date().toISOString() : null,
      })
      .eq('id', rid)
    if (res.ok) sent++
    else { failed++; console.error(`[fair/order-notice] ${g.email} נכשל:`, res.error) }
  }

  await db.from('book_fair_newsletters')
    .update({ status: sent > 0 ? 'sent' : 'failed', sent_count: sent, failed_count: failed, sent_at: new Date().toISOString() })
    .eq('id', nl.id)

  await logActivity(db, {
    userId: staff.userId,
    action: 'book_fair_order_notice_send',
    entityType: 'book_fair_newsletter',
    entityId: nl.id,
    details: { subject, total: groups.length, sent, failed },
  })

  return NextResponse.json({ ok: true, id: nl.id, total: groups.length, sent, failed })
}

async function loadGroups(db: NonNullable<ReturnType<typeof getServiceClient>>): Promise<Group[]> {
  const { rows } = await fetchAllRows<OrderRow>(
    (from, to) => db.from('book_fair_orders')
      .select('order_number, customer_name, customer_email, tracking_token, total_agorot, created_at')
      .eq('channel', 'web')
      .in('status', LIVE_STATUSES)
      .order('created_at', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: OrderRow[] | null; error: { message: string } | null }>
  )

  const map = new Map<string, Group>()
  for (const o of rows) {
    const email = String(o.customer_email ?? '').trim().toLowerCase()
    if (!email || !email.includes('@') || !o.tracking_token) continue
    const g = map.get(email) ?? { email, name: null, orders: [] }
    // השם מההזמנה האחרונה (המיון עולה, ולכן האחרונה דורסת).
    if (o.customer_name?.trim()) g.name = o.customer_name.trim()
    g.orders.push({ orderNumber: o.order_number, totalAgorot: o.total_agorot ?? 0, token: o.tracking_token })
    map.set(email, g)
  }
  return [...map.values()]
}
