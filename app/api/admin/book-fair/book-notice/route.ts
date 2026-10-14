import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'
import {
  LIVE_STATUSES, noticeAudience, scopeBookNotice, cleanEmail, cleanPhone,
  type NoticeChannel, type NoticeOrder, type NoticeTarget,
} from '@/lib/bookFairBookNotice'

// הודעה למזמיני ספר אחד — שיחה טלפונית ומייל. ראו lib/bookFairBookNotice.
//
// 🔴 GET אינו שולח דבר: חיפוש ספר (?q) או תצוגה מקדימה (?bookId).
// POST שולח רק עם confirm:true, ערוץ אחד בכל פעם.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

type Db = NonNullable<ReturnType<typeof getServiceClient>>
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// מנעול "שולח" ישן מריצה שנקטעה (timeout) לא יחסום לנצח.
const STALE_LOCK_MS = 15 * 60 * 1000

export async function GET(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const q = request.nextUrl.searchParams.get('q')
  if (q !== null) {
    const term = q.trim().replace(/[%_,()]/g, ' ').slice(0, 80)
    if (!term) return NextResponse.json({ books: [] })
    const { data, error } = await db.from('book_fair_books')
      .select('id, title, author, publisher, sku, is_active')
      .ilike('title', `%${term}%`)
      .order('title')
      .limit(30)
    if (error) return NextResponse.json({ error: 'החיפוש נכשל' }, { status: 500 })
    return NextResponse.json({ books: data ?? [] })
  }

  const bookId = request.nextUrl.searchParams.get('bookId') ?? ''
  if (!UUID_RE.test(bookId)) return NextResponse.json({ error: 'מזהה ספר לא תקין' }, { status: 400 })

  const book = await loadBook(db, bookId)
  if (!book) return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 })

  const orders = await loadOrders(db, bookId)
  const sent = await loadSent(db, bookId)
  const scope = scopeBookNotice(orders, sent)
  const all = scopeBookNotice(orders)

  const { data: history } = await db.from('book_fair_newsletters')
    .select('id, audience, status, total, sent_count, failed_count, created_at, sent_at')
    .in('audience', [noticeAudience(bookId, 'email'), noticeAudience(bookId, 'phone')])
    .order('created_at', { ascending: false })

  const { yemotCallConfigured } = await import('@/lib/yemotCall')
  const view = (t: NoticeTarget) => ({ key: t.key, name: t.name, orders: t.orders.map(o => o.orderNumber) })

  return NextResponse.json({
    book,
    orders: scope.orders,
    withEmail: all.email.length,
    withPhone: all.phone.length,
    phoneOnly: all.phoneOnly,
    emailOnly: all.emailOnly,
    sentEmail: sent.email.size,
    sentPhone: sent.phone.size,
    pendingEmail: scope.email.map(view),
    pendingPhone: scope.phone.map(view),
    noContact: scope.noContact,
    history: (history ?? []).map(h => ({ ...h, channel: String(h.audience).endsWith(':phone') ? 'phone' : 'email' })),
    callConfigured: yemotCallConfigured(),
  })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const bookId = String(body.bookId ?? '')
  if (!UUID_RE.test(bookId)) return NextResponse.json({ error: 'מזהה ספר לא תקין' }, { status: 400 })
  const channel = body.channel === 'phone' ? 'phone' : body.channel === 'email' ? 'email' : null
  if (!channel) return NextResponse.json({ error: 'ערוץ לא תקין' }, { status: 400 })

  const message = String(body.message ?? '').trim()
  const subject = String(body.subject ?? '').trim()
  if (!message) return NextResponse.json({ error: 'חסר תוכן' }, { status: 400 })
  if (message.length > (channel === 'phone' ? 600 : 5000)) return NextResponse.json({ error: 'התוכן ארוך מדי' }, { status: 400 })
  if (channel === 'email' && (!subject || subject.length > 200)) return NextResponse.json({ error: 'נושא חסר או ארוך מדי' }, { status: 400 })

  const book = await loadBook(db, bookId)
  if (!book) return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 })

  const { deliverMail } = await import('@/lib/sendMail')
  const { mailFor } = await import('@/lib/departments')
  const { bookFairOrderNoticeEmail } = await import('@/lib/emailTemplates')
  const { placeTtsCall, yemotCallConfigured } = await import('@/lib/yemotCall')

  if (channel === 'phone' && !yemotCallConfigured()) {
    return NextResponse.json({ error: 'שיחות יוצאות בימות אינן מוגדרות בשרת (YEMOT_OTP_TEMPLATE_ID)' }, { status: 400 })
  }

  // 🔴 לא request.nextUrl.origin: מאחורי Railway הוא localhost:8080.
  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
  const buildMail = (t: NoticeTarget, recipientId: string | null) => bookFairOrderNoticeEmail({
    subject,
    name: t.name,
    body: message,
    orders: t.orders.filter(o => o.token).map(o => ({
      orderNumber: o.orderNumber,
      totalAgorot: o.totalAgorot,
      url: `${base}/api/yerid/nl-click?o=${encodeURIComponent(o.token!)}${recipientId ? `&r=${recipientId}` : ''}`,
    })),
    pixelUrl: recipientId ? `${base}/api/yerid/nl-open?r=${recipientId}` : undefined,
  })

  // ── מבחן: מייל לכתובת אחת / שיחה למספר אחד. לא נרשם ולא מסמן איש. ──
  const test = String(body.test ?? '').trim()
  if (test) {
    if (channel === 'email') {
      const to = cleanEmail(test)
      if (!to) return NextResponse.json({ error: 'כתובת מבחן לא תקינה' }, { status: 400 })
      const orders = await loadOrders(db, bookId)
      const sample = scopeBookNotice(orders).email[0] ?? { key: to, name: null, orders: [] }
      const mail = buildMail(sample, null)
      const r = await deliverMail(to, `[מבחן] ${mail.subject}`, mail.html, undefined, { ...mailFor('yerid'), transactional: true })
      return r.ok ? NextResponse.json({ ok: true, test: true }) : NextResponse.json({ error: r.error ?? 'שליחת המבחן נכשלה' }, { status: 500 })
    }
    const tel = cleanPhone(test)
    if (!tel) return NextResponse.json({ error: 'מספר מבחן לא תקין' }, { status: 400 })
    const r = await placeTtsCall(tel, message)
    return r.ok ? NextResponse.json({ ok: true, test: true }) : NextResponse.json({ error: r.error ?? 'שיחת המבחן נכשלה' }, { status: 500 })
  }

  // 🔴 שער האישור.
  if (body.confirm !== true) return NextResponse.json({ error: 'נדרש אישור מפורש' }, { status: 400 })

  const audience = noticeAudience(bookId, channel)

  // 🔴 מנעול: שתי לחיצות או שתי לשוניות היו שולחות לכולם פעמיים.
  const { data: running } = await db.from('book_fair_newsletters')
    .select('id, created_at').eq('audience', audience).eq('status', 'sending')
  const fresh = (running ?? []).filter(r => Date.now() - new Date(r.created_at).getTime() < STALE_LOCK_MS)
  if (fresh.length) return NextResponse.json({ error: 'שליחה כבר מתבצעת כעת' }, { status: 409 })
  if (running?.length) {
    await db.from('book_fair_newsletters').update({ status: 'failed' }).in('id', running.map(r => r.id))
  }

  const orders = await loadOrders(db, bookId)
  const sent = await loadSent(db, bookId)
  const scope = scopeBookNotice(orders, sent)
  const targets = channel === 'email' ? scope.email : scope.phone
  if (!targets.length) return NextResponse.json({ error: 'אין למי לשלוח: כולם כבר קיבלו או שאין פרטי קשר' }, { status: 400 })

  const { data: nl, error: nlErr } = await db.from('book_fair_newsletters')
    .insert({
      subject: channel === 'email' ? subject : `שיחה טלפונית: ${book.title}`.slice(0, 200),
      body: message, audience, status: 'sending', total: targets.length, created_by: staff.userId,
    })
    .select('id').single()
  if (nlErr || !nl) {
    console.error('[fair/book-notice] create failed:', nlErr)
    return NextResponse.json({ error: 'יצירת הרישום נכשלה' }, { status: 500 })
  }

  // ⚠️ הנמענים נרשמים לפני השליחה. בטלפון, עמודת email מחזיקה את המספר.
  const { data: inserted, error: insErr } = await db.from('book_fair_newsletter_recipients')
    .insert(targets.map(t => ({
      newsletter_id: nl.id,
      email: t.key,
      customer_name: t.name,
      order_numbers: t.orders.map(o => o.orderNumber).join(', '),
    })))
    .select('id, email')
  if (insErr || !inserted) {
    await db.from('book_fair_newsletters').update({ status: 'failed' }).eq('id', nl.id)
    console.error('[fair/book-notice] recipients insert failed:', insErr)
    return NextResponse.json({ error: 'רישום הנמענים נכשל' }, { status: 500 })
  }
  const idByKey = new Map(inserted.map(r => [String(r.email), String(r.id)]))

  let ok = 0, failed = 0
  for (const t of targets) {
    const rid = idByKey.get(t.key)
    if (!rid) continue
    let res: { ok: boolean; error?: string }
    try {
      if (channel === 'email') {
        const mail = buildMail(t, rid)
        res = await deliverMail(t.key, mail.subject, mail.html, undefined, { ...mailFor('yerid'), transactional: true })
      } else {
        res = await placeTtsCall(t.key, message)
        // ⚠️ השהיה קצרה: עשרות שיחות בשנייה מול ימות מחזירות שגיאות זמניות.
        await new Promise(r => setTimeout(r, 150))
      }
    } catch (e) {
      res = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    await db.from('book_fair_newsletter_recipients')
      .update({
        status: res.ok ? 'sent' : 'failed',
        error: res.ok ? null : (res.error ?? 'שגיאה לא ידועה').slice(0, 500),
        sent_at: res.ok ? new Date().toISOString() : null,
      })
      .eq('id', rid)
    if (res.ok) ok++
    else { failed++; console.error(`[fair/book-notice] ${channel} ${t.key} נכשל:`, res.error) }
  }

  await db.from('book_fair_newsletters')
    .update({ status: ok > 0 ? 'sent' : 'failed', sent_count: ok, failed_count: failed, sent_at: new Date().toISOString() })
    .eq('id', nl.id)

  await logActivity(db, {
    userId: staff.userId,
    action: 'book_fair_book_notice_send',
    entityType: 'book_fair_book',
    entityId: bookId,
    details: { channel, title: book.title, total: targets.length, sent: ok, failed },
  })

  return NextResponse.json({ ok: true, total: targets.length, sent: ok, failed })
}

async function loadBook(db: Db, bookId: string) {
  const { data } = await db.from('book_fair_books').select('id, title, author, publisher, sku').eq('id', bookId).maybeSingle()
  return data as { id: string; title: string; author: string | null; publisher: string | null; sku: string } | null
}

/** הזמנות חיות שהספר בתוכן. */
async function loadOrders(db: Db, bookId: string): Promise<NoticeOrder[]> {
  const { rows: items } = await fetchAllRows<{ order_id: string }>(
    (from, to) => db.from('book_fair_order_items').select('order_id').eq('book_id', bookId)
      .order('id').range(from, to) as unknown as Page<{ order_id: string }>
  )
  const ids = [...new Set(items.map(i => i.order_id))]
  const out: NoticeOrder[] = []
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await db.from('book_fair_orders')
      .select('order_number, customer_name, customer_phone, customer_email, tracking_token, total_agorot')
      .in('id', ids.slice(i, i + CHUNK))
      .in('status', LIVE_STATUSES)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as NoticeOrder[]))
  }
  return out.sort((a, b) => a.order_number.localeCompare(b.order_number))
}

/** מי כבר קיבל — לכל ערוץ בנפרד. */
async function loadSent(db: Db, bookId: string): Promise<Record<NoticeChannel, Set<string>>> {
  const out: Record<NoticeChannel, Set<string>> = { email: new Set(), phone: new Set() }
  for (const channel of ['email', 'phone'] as const) {
    const { data: nls } = await db.from('book_fair_newsletters').select('id').eq('audience', noticeAudience(bookId, channel))
    const ids = (nls ?? []).map(n => n.id)
    if (!ids.length) continue
    const { rows } = await fetchAllRows<{ email: string }>(
      (from, to) => db.from('book_fair_newsletter_recipients').select('email')
        .in('newsletter_id', ids).eq('status', 'sent')
        .order('id').range(from, to) as unknown as Page<{ email: string }>
    )
    for (const r of rows) out[channel].add(r.email)
  }
  return out
}
