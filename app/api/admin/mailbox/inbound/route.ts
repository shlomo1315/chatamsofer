import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

// קליינט service-role לכתיבת מייל נכנס (עוקף RLS — אין משתמש מחובר ב-webhook)
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// אימות סוד משותף (header או query) למניעת זיופי webhook
function verifySecret(request: NextRequest): boolean {
  const expected = process.env.RESEND_WEBHOOK_SECRET
  if (!expected) return false
  const headerSecret = request.headers.get('x-webhook-secret')
  const querySecret = new URL(request.url).searchParams.get('secret')
  return headerSecret === expected || querySecret === expected
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}
function extractEmail(s: string): string {
  const m = s.match(/<([^>]+)>/)
  return (m ? m[1] : s).trim()
}
function extractName(s: string): string | undefined {
  const m = s.match(/^(.*?)</)
  const name = m ? m[1].trim().replace(/^"|"$/g, '') : ''
  return name || undefined
}
function extractFrom(v: unknown): { email: string; name?: string } {
  if (typeof v === 'string') return { email: extractEmail(v), name: extractName(v) }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const email = asString(o.email) ?? asString(o.address) ?? ''
    return { email: extractEmail(email), name: asString(o.name) }
  }
  return { email: '' }
}
function normalizeAddrs(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === 'string' ? extractEmail(x) : extractFrom(x).email))
      .filter(Boolean)
  }
  if (typeof v === 'string') return v.split(',').map(extractEmail).filter(Boolean)
  if (v && typeof v === 'object') return [extractFrom(v).email].filter(Boolean)
  return []
}

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const admin = getAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'server not configured' }, { status: 500 })
  }

  let payload: unknown
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }

  const root = (payload && typeof payload === 'object') ? (payload as Record<string, unknown>) : {}
  const d = (root.data && typeof root.data === 'object') ? (root.data as Record<string, unknown>) : root

  const from = extractFrom(d.from)
  if (!from.email) return NextResponse.json({ error: 'missing sender' }, { status: 400 })

  const headers = (d.headers && typeof d.headers === 'object') ? (d.headers as Record<string, unknown>) : {}
  const providerId =
    asString(d.email_id) ?? asString(d.id) ?? asString(d.message_id) ?? asString(headers['message-id']) ?? null
  const inReplyTo = asString(d.in_reply_to) ?? asString(headers['in-reply-to']) ?? null

  const attachmentsRaw = Array.isArray(d.attachments) ? (d.attachments as unknown[]) : []

  const { data: inserted, error } = await admin
    .from('mail_messages')
    .insert({
      direction: 'inbound',
      from_email: from.email,
      from_name: from.name ?? null,
      to_emails: normalizeAddrs(d.to),
      cc_emails: normalizeAddrs(d.cc),
      subject: asString(d.subject) ?? '',
      body_text: asString(d.text) ?? asString(d['body-plain']) ?? null,
      body_html: asString(d.html) ?? asString(d['body-html']) ?? null,
      status: 'received',
      is_read: false,
      thread_id: inReplyTo ?? providerId,
      in_reply_to: inReplyTo,
      provider_id: providerId,
      has_attachments: attachmentsRaw.length > 0,
    })
    .select('id')
    .single()

  if (error) {
    // provider_id ייחודי — webhook כפול אינו שגיאה
    if (error.code === '23505') return NextResponse.json({ ok: true, duplicate: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // קבצים מצורפים שמגיעים עם URL
  const withUrls = attachmentsRaw
    .map((a) => (a && typeof a === 'object' ? (a as Record<string, unknown>) : {}))
    .filter((a) => asString(a.url) || asString(a.file_url))
  if (inserted && withUrls.length > 0) {
    await admin.from('mail_attachments').insert(
      withUrls.map((a) => ({
        message_id: inserted.id,
        file_url: (asString(a.url) ?? asString(a.file_url))!,
        file_name: asString(a.filename) ?? asString(a.name) ?? asString(a.file_name) ?? null,
        content_type: asString(a.content_type) ?? asString(a.contentType) ?? null,
        size: typeof a.size === 'number' ? a.size : null,
      }))
    )
  }

  return NextResponse.json({ ok: true, id: inserted?.id })
}
