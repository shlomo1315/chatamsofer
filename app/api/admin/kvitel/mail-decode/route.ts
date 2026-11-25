import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { KVITEL_MAILBOX, isKvitelMailbox, isKvitelSubject, reingestKvitelEmail } from '@/lib/kvitelEmail'
import { decodeFromSaved, decodeFromText, mailPlainText } from '@/lib/kvitelMailDecode'
import { encodeKvitelPayload } from '@/lib/kvitelPayload'

// עמודת "הפיענוח" בלשונית המייל של הקוויטלעך (MailClient lockDepartment="kvitel").
// GET ?id=<inbound_emails.id> → מה נקלט מהמייל, בערבול (lib/kvitelPayload) בגלל נטפרי.
// POST {id} → קליטה מחדש של מייל אחד (בקשה שעוד לא נשלחה מוחלפת, בלי כפילות).
// POST {all:true, before?} → סנכרון: מיילי קוויטל בלי בקשה נקלטים, מהחדש לישן, מנה קטנה בכל קריאה
//   (פענוח AI לוקח זמן). before = זמן הקבלה של המייל האחרון שנבדק, להמשך מאותו מקום.
// רק מייל קוויטל (התיבה k@, נושא "קויטל", או מייל שכבר נקלט כבקשה): הרשאת kvitel לא פותחת מיילים אחרים.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/
const noStore = { 'Cache-Control': 'no-store' }
const SYNC_BATCH = 5
const SYNC_SCAN = 200

const MAIL_COLS = 'id, message_id, from_email, from_name, to_email, subject, plain_text, html, received_at'
type MailRow = {
  id: string; message_id: string | null; from_email: string | null; from_name: string | null
  to_email: string | null; subject: string | null; plain_text: string | null; html: string | null; received_at: string
}

const isKvitelMail = (m: Pick<MailRow, 'to_email' | 'subject'>) =>
  isKvitelMailbox([String(m.to_email ?? '')]) || isKvitelSubject(String(m.subject ?? ''))

const toMessage = (m: MailRow) => ({
  messageId: m.message_id as string, fromEmail: String(m.from_email ?? ''), fromName: m.from_name,
  subject: String(m.subject ?? ''), text: mailPlainText(m.plain_text, m.html),
})

export async function GET(request: NextRequest) {
  const staff = await requirePermission('kvitel', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה מייל לא תקין' }, { status: 400, headers: noStore })

  const { data: mail } = await db.from('inbound_emails')
    .select('id, message_id, to_email, subject, plain_text, html').eq('id', id).maybeSingle()
  if (!mail) return NextResponse.json({ error: 'המייל לא נמצא' }, { status: 404, headers: noStore })

  const { data: saved } = mail.message_id
    ? await db.from('kvitel_requests')
      .select('id, status, note, contact_name, contact_phone, contact_email, kvitel_request_lines(id, name, relation, parent_name, request_type, request_note, flagged, flag_reason, position)')
      .eq('channel', 'email').eq('source_ref', mail.message_id).maybeSingle()
    : { data: null }

  const subject = String(mail.subject ?? '')
  if (!saved && !isKvitelMail(mail)) return forbidden()

  const result = saved
    ? decodeFromSaved(saved, saved.kvitel_request_lines ?? [])
    : decodeFromText(subject, mailPlainText(mail.plain_text, mail.html))
  result.canEdit = !!(await requirePermission('kvitel', 'edit'))
  return NextResponse.json(encodeKvitelPayload(result), { headers: noStore })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('kvitel', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const body = await request.json().catch(() => null) as { id?: unknown; all?: unknown; before?: unknown } | null
  if (body?.all === true) {
    const before = typeof body.before === 'string' && ISO_RE.test(body.before) ? body.before : null
    return NextResponse.json(await syncMails(db, before), { headers: noStore })
  }

  const id = typeof body?.id === 'string' ? body.id : ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה מייל לא תקין' }, { status: 400, headers: noStore })
  const { data: mail } = await db.from('inbound_emails').select(MAIL_COLS).eq('id', id).maybeSingle<MailRow>()
  if (!mail) return NextResponse.json({ error: 'המייל לא נמצא' }, { status: 404, headers: noStore })
  if (!mail.message_id) return NextResponse.json({ error: 'למייל אין מזהה, ולכן אי אפשר לקלוט אותו' }, { status: 400, headers: noStore })
  if (!isKvitelMail(mail)) {
    const { count } = await db.from('kvitel_requests').select('id', { count: 'exact', head: true })
      .eq('channel', 'email').eq('source_ref', mail.message_id)
    if (!count) return forbidden()
  }

  try {
    const res = await reingestKvitelEmail(db, toMessage(mail))
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.noNames ? 422 : 409, headers: noStore })
    return NextResponse.json(res, { headers: noStore })
  } catch (e) {
    console.error('[kvitel-mail] reingest failed:', e)
    return NextResponse.json({ error: 'הקליטה נכשלה' }, { status: 500, headers: noStore })
  }
}

// מנה אחת של סנכרון. מייל שכבר יש לו בקשה מדולג (בלי כפילות), וכשל במייל אחד לא עוצר את השאר.
async function syncMails(db: SupabaseClient, before: string | null) {
  let q = db.from('inbound_emails').select(MAIL_COLS)
    .or(`to_email.ilike.${KVITEL_MAILBOX},subject.ilike.%ויטל%,subject.ilike.%kvit%`)
    .not('message_id', 'is', null)
    .order('received_at', { ascending: false }).limit(SYNC_SCAN)
  if (before) q = q.lt('received_at', before)
  const { data, error } = await q
  if (error) { console.error('[kvitel-mail] sync list failed:', error); return { error: 'טעינת המיילים נכשלה' } }
  const mails = ((data ?? []) as MailRow[]).filter(isKvitelMail)

  const refs = mails.map(m => m.message_id as string)
  const { data: have } = refs.length
    ? await db.from('kvitel_requests').select('source_ref').eq('channel', 'email').in('source_ref', refs)
    : { data: [] }
  const taken = new Set((have ?? []).map((r: { source_ref: string }) => r.source_ref))

  const out = { created: 0, noNames: 0, failed: 0, skipped: 0, next: null as string | null, done: false }
  let tried = 0
  let last: string | null = null
  for (const m of mails) {
    if (tried >= SYNC_BATCH) break
    last = m.received_at
    if (taken.has(m.message_id as string)) { out.skipped++; continue }
    tried++
    try {
      const res = await reingestKvitelEmail(db, toMessage(m))
      if (res.ok) { if (res.created) out.created++; else out.skipped++ }
      else if (res.noNames) out.noNames++
      else out.failed++
    } catch (e) {
      console.error('[kvitel-mail] sync mail failed:', m.id, e)
      out.failed++
    }
  }
  const scannedAll = !mails.length || last === mails[mails.length - 1].received_at
  out.done = scannedAll && (data?.length ?? 0) < SYNC_SCAN
  out.next = out.done ? null : (scannedAll ? (data as MailRow[])[data!.length - 1].received_at : last)
  return out
}
