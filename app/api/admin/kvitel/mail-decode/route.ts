import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { isKvitelMailbox, isKvitelSubject } from '@/lib/kvitelEmail'
import { decodeFromSaved, decodeFromText, mailPlainText } from '@/lib/kvitelMailDecode'
import { encodeKvitelPayload } from '@/lib/kvitelPayload'

// עמודת "הפיענוח" בלשונית המייל של הקוויטלעך (MailClient lockDepartment="kvitel").
// GET ?id=<inbound_emails.id> → מה נקלט מהמייל, בערבול (lib/kvitelPayload) בגלל נטפרי.
// רק מייל קוויטל (התיבה k@, נושא "קויטל", או מייל שכבר נקלט כבקשה): הרשאת kvitel לא פותחת מיילים אחרים.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const noStore = { 'Cache-Control': 'no-store' }

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
      .select('id, status, note, kvitel_request_lines(name, relation, parent_name, request_type, request_note, flag_reason, position)')
      .eq('channel', 'email').eq('source_ref', mail.message_id).maybeSingle()
    : { data: null }

  const subject = String(mail.subject ?? '')
  if (!saved && !isKvitelMailbox([String(mail.to_email ?? '')]) && !isKvitelSubject(subject)) return forbidden()

  const result = saved
    ? decodeFromSaved(saved, saved.kvitel_request_lines ?? [])
    : decodeFromText(subject, mailPlainText(mail.plain_text, mail.html))
  return NextResponse.json(encodeKvitelPayload(result), { headers: noStore })
}
