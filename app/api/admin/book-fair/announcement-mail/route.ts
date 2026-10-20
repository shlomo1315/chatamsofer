import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import {
  ANNOUNCEMENT_MAIL_KEY, ANNOUNCEMENT_MAIL_STATUSES, buildAnnouncementMailHtml, defaultAnnouncementMail, parseAnnouncementMail, pickAnnouncementRecipients,
} from '@/lib/creditsAnnouncementMail'

// מייל ההודעה (אותו נוסח של הודעת הקול) למי שהזמין דרך האתר עם משלוח, מכתובת היריד.
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api.
//   GET                          -> ספירה בלבד, בלי שליחה
//   POST {test: "a@b.com"}       -> שליחה לכתובת אחת בלבד
//   POST {confirm: <ספירה>}      -> שליחה לכולם; חייב להתאים לספירה העדכנית
// שליחה מלאה פעם אחת: אחרי שהתחילה, ריצה נוספת נדחית (409) אלא אם נשלח again:true.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const STARTED = 'book_fair_announcement_mail_started'
const SENT = 'book_fair_announcement_mail_sent'

async function loadRecipients(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { rows } = await fetchAllRows<{ customer_email: string | null }>(
    (from, to) => db.from('book_fair_orders')
      .select('customer_email')
      .eq('channel', 'web')
      .eq('delivery_method', 'shipping')
      .in('status', ANNOUNCEMENT_MAIL_STATUSES)
      .not('customer_email', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: { customer_email: string | null }[] | null; error: { message: string } | null }>
  )
  return pickAnnouncementRecipients(rows)
}

async function loadContent(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { data } = await db.from('app_settings').select('value').eq('key', ANNOUNCEMENT_MAIL_KEY).maybeSingle()
  return parseAnnouncementMail(data?.value)
}

export async function GET() {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const recipients = await loadRecipients(db)
  const { count } = await db.from('activity_log').select('id', { count: 'exact', head: true }).eq('action', STARTED)
  const { data: last } = await db.from('activity_log').select('details, created_at').eq('action', SENT).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const content = await loadContent(db)
  return NextResponse.json({ content, defaults: defaultAnnouncementMail(), html: buildAnnouncementMailHtml(content.body), count: recipients.length, alreadyStarted: (count ?? 0) > 0, last: last ? { ...(last.details as object), at: last.created_at } : null })
}

// שמירת הנוסח הערוך (PUT {subject, body}) או איפוס לנוסח המקורי (PUT {reset:true}). לא נוגע בהקלטה הקולית.
export async function PUT(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const input = await request.json().catch(() => null) as { subject?: string; body?: string; reset?: boolean } | null
  const content = input?.reset ? defaultAnnouncementMail() : parseAnnouncementMail(input)
  const { error } = await db.from('app_settings').upsert(
    { key: ANNOUNCEMENT_MAIL_KEY, value: JSON.stringify(content), updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  return NextResponse.json({ ok: true, content, html: buildAnnouncementMailHtml(content.body) })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => null) as { preview?: { subject?: string; body?: string }; test?: string; confirm?: number; again?: boolean } | null
  const opts = { ...mailFor('yerid'), transactional: true, sentBy: staff.userId }

  // תצוגה מקדימה חיה של טיוטה, בלי שמירה ובלי שליחה
  if (body?.preview) return NextResponse.json({ html: buildAnnouncementMailHtml(parseAnnouncementMail(body.preview).body) })
  const content = await loadContent(db)
  const html = buildAnnouncementMailHtml(content.body)

  const test = String(body?.test ?? '').trim()
  if (test) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(test)) return NextResponse.json({ error: 'כתובת לא תקינה' }, { status: 400 })
    const res = await deliverMail(test, `[בדיקה] ${content.subject}`, html, undefined, opts)
    return res.ok ? NextResponse.json({ ok: true, test: true }) : NextResponse.json({ error: res.error ?? 'השליחה נכשלה' }, { status: 500 })
  }

  const recipients = await loadRecipients(db)
  if (body?.confirm !== recipients.length) {
    return NextResponse.json({ error: 'נדרש אישור עם הספירה העדכנית', count: recipients.length }, { status: 400 })
  }
  const { count: started } = await db.from('activity_log').select('id', { count: 'exact', head: true }).eq('action', STARTED)
  if ((started ?? 0) > 0 && !body?.again) {
    return NextResponse.json({ error: 'השליחה המלאה כבר התחילה. לשליחה חוזרת יש לשלוח again:true' }, { status: 409 })
  }
  await logActivity(db, { userId: staff.userId, action: STARTED, entityType: 'book_fair_orders', details: { total: recipients.length } })

  let sent = 0, failed = 0
  for (const email of recipients) {
    const res = await deliverMail(email, content.subject, html, undefined, opts)
    if (res.ok) sent++; else failed++
  }
  await logActivity(db, { userId: staff.userId, action: SENT, entityType: 'book_fair_orders', details: { total: recipients.length, sent, failed } })
  return NextResponse.json({ ok: true, total: recipients.length, sent, failed })
}
