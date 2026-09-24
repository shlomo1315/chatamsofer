import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { buildAudience, type ReminderRow, type OrderRow } from '@/lib/bookFairAudience'
import { signUnsubscribe } from '@/lib/bookFairUnsubscribe'

// שליחת ניוזלטר לרשימת התפוצה של היריד.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.
//
// 🔴 זהו הנתיב המסוכן ביותר במחלקה: לחיצה אחת שולחת לאלפי נמענים, ואין
// דרך לבטל מייל שיצא. לכן: הרשאת edit, מנעול סטטוס נגד שליחה כפולה,
// ותיעוד נמען-נמען שמאפשר להמשיך ריצה שנקטעה בלי לשלוח פעמיים.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// ⚠️ שליחה לאלפי נמענים אורכת דקות; ברירת המחדל הייתה קוטעת באמצע.
export const maxDuration = 300

type Audience = 'all' | 'reminder' | 'customer'

/** רשימת ההיסטוריה — מה נשלח, למי וכמה הצליח. */
export async function GET() {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { data, error } = await db.from('book_fair_newsletters')
    .select('id, subject, status, audience, total, sent_count, failed_count, created_at, sent_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[fair/newsletter] list failed:', error)
    return NextResponse.json({ error: 'טעינת ההיסטוריה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ newsletters: data ?? [] })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: { subject?: unknown; message?: unknown; audience?: unknown; test?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const subject = String(body.subject ?? '').trim()
  const message = String(body.message ?? '').trim()
  const audience: Audience = ['all', 'reminder', 'customer'].includes(String(body.audience))
    ? String(body.audience) as Audience
    : 'all'

  if (!subject) return NextResponse.json({ error: 'חסר נושא להודעה' }, { status: 400 })
  if (subject.length > 200) return NextResponse.json({ error: 'הנושא ארוך מדי' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'חסר תוכן להודעה' }, { status: 400 })

  const { deliverMail } = await import('@/lib/sendMail')
  const { mailFor } = await import('@/lib/departments')
  const { bookFairNewsletterEmail } = await import('@/lib/emailTemplates')
  const { ensureEmailTexts } = await import('@/lib/emailTextsStore')
  await ensureEmailTexts()

  // ── שליחת מבחן ──
  // 🔴 לפני דיוור לאלפי אנשים חייבים לראות איך המייל נראה בפועל. בלי
  // זה, שגיאת ניסוח או קישור שבור מתגלים אחרי שכבר אי אפשר לתקן.
  const testTo = String(body.test ?? '').trim()
  if (testTo) {
    const mail = bookFairNewsletterEmail({ subject, body: message })
    const res = await deliverMail(testTo, `[מבחן] ${mail.subject}`, mail.html, undefined, {
      ...mailFor('yerid'), transactional: true,
    })
    return res.ok
      ? NextResponse.json({ ok: true, test: true })
      : NextResponse.json({ error: res.error ?? 'שליחת המבחן נכשלה' }, { status: 500 })
  }

  // ── בניית הרשימה ──
  const list = await loadAudience(db, audience)
  if (!list.length) return NextResponse.json({ error: 'אין נמענים בקהל שנבחר' }, { status: 400 })

  // ── יצירת הדיוור ──
  // ⚠️ נוצר במצב 'sending' מיד: הוא המנעול שמונע שליחה כפולה משתי
  // לחיצות או משתי לשוניות פתוחות.
  const { data: nl, error: nlErr } = await db.from('book_fair_newsletters')
    .insert({
      subject, body: message, audience, status: 'sending',
      total: list.length, created_by: staff.userId,
    })
    .select('id').single()

  if (nlErr || !nl) {
    console.error('[fair/newsletter] create failed:', nlErr)
    return NextResponse.json({ error: 'יצירת הדיוור נכשלה' }, { status: 500 })
  }

  // ⚠️ הנמענים נרשמים *לפני* השליחה: אם התהליך ייקטע באמצע, הרשימה
  // קיימת וניתן להמשיך ממנה במקום לשלוח שוב לכולם.
  for (let i = 0; i < list.length; i += 500) {
    await db.from('book_fair_newsletter_recipients')
      .insert(list.slice(i, i + 500).map(email => ({ newsletter_id: nl.id, email })))
  }

  let sent = 0, failed = 0

  for (const email of list) {
    // ⚠️ אחד-אחד ולא במנה: Resend מגביל קצב, והכישלון של אחד לא אמור
    // להפיל את כל השאר.
    const mail = bookFairNewsletterEmail({
      subject,
      body: message,
      unsubscribeUrl: unsubscribeUrlFor(email),
    })

    const res = await deliverMail(email, mail.subject, mail.html, undefined, mailFor('yerid'))

    await db.from('book_fair_newsletter_recipients')
      .update({
        status: res.ok ? 'sent' : 'failed',
        error: res.ok ? null : (res.error ?? 'שגיאה לא ידועה').slice(0, 500),
        sent_at: res.ok ? new Date().toISOString() : null,
      })
      .eq('newsletter_id', nl.id).eq('email', email)

    if (res.ok) sent++
    else { failed++; console.error(`[fair/newsletter] ${email} נכשל:`, res.error) }
  }

  await db.from('book_fair_newsletters')
    .update({
      // ⚠️ 'failed' רק כשאף אחד לא קיבל. שליחה שרובה הצליחה היא הצלחה
      // עם כישלונות, והמסך מציג את המספרים.
      status: sent > 0 ? 'sent' : 'failed',
      sent_count: sent, failed_count: failed,
      sent_at: new Date().toISOString(),
    })
    .eq('id', nl.id)

  await logActivity(db, {
    userId: staff.userId,
    action: 'book_fair_newsletter_send',
    entityType: 'book_fair_newsletter',
    entityId: nl.id,
    details: { subject, audience, total: list.length, sent, failed },
  })

  console.log(`[fair/newsletter] "${subject}": ${sent} נשלחו${failed ? `, ${failed} נכשלו` : ''}`)
  return NextResponse.json({ ok: true, total: list.length, sent, failed })
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * כתובות הקהל שנבחר, מסוננות ומוכנות לשליחה.
 *
 * ⚠️ fetchAllRows ולא select רגיל: PostgREST קוטע ב-1,000 שורות בשקט,
 * ודיוור שנשלח ל-1,000 מתוך 4,000 נראה מוצלח לחלוטין.
 */
async function loadAudience(
  db: ReturnType<typeof getServiceClient>,
  audience: Audience,
): Promise<string[]> {
  if (!db) return []

  const { rows: reminders } = await fetchAllRows<ReminderRow & { unsubscribed_at: string | null }>(
    (from, to) => db.from('book_fair_reminders')
      .select('email, created_at, notified_at, unsubscribed_at')
      .range(from, to) as unknown as PromiseLike<{ data: (ReminderRow & { unsubscribed_at: string | null })[] | null; error: { message: string } | null }>
  )

  const { rows: orders } = await fetchAllRows<OrderRow>(
    (from, to) => db.from('book_fair_orders')
      .select('customer_email, customer_name, status, total_agorot, refunded_agorot, created_at')
      .range(from, to) as unknown as PromiseLike<{ data: OrderRow[] | null; error: { message: string } | null }>
  )

  // 🔴 מי שביקש לצאת יוצא לפני כל חישוב אחר — כולל אם הוא גם רוכש.
  const optedOut = new Set(
    reminders.filter(r => r.unsubscribed_at).map(r => String(r.email).trim().toLowerCase())
  )

  const members = buildAudience(
    reminders.filter(r => !r.unsubscribed_at),
    orders,
  )

  return members
    .filter(m => !optedOut.has(m.email))
    .filter(m => audience === 'all'
      || (audience === 'reminder' && (m.source === 'reminder' || m.source === 'both'))
      || (audience === 'customer' && (m.source === 'customer' || m.source === 'both')))
    .map(m => m.email)
}

/**
 * קישור הסרה אישי.
 *
 * ⚠️ חתום ולא כתובת גולמית: קישור שמכיל את המייל בלבד מאפשר לכל אחד
 * להסיר כל אדם אחר מהרשימה, ודי בניחוש כתובת.
 */
function unsubscribeUrlFor(email: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chasamsofer.org').replace(/\/$/, '')
  return `${base}/yerid/unsubscribe?e=${encodeURIComponent(email)}&t=${signUnsubscribe(email)}`
}
