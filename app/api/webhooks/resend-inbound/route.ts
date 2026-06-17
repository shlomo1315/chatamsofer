import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// פירוק שדה "שם <כתובת>" לשם וכתובת
function parseAddress(raw: string): { name: string | null; email: string } {
  const s = String(raw ?? '').trim()
  const m = s.match(/^(.*?)\s*<([^>]+)>$/)
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim() || null, email: m[2].trim().toLowerCase() }
  return { name: null, email: s.toLowerCase() }
}

// Webhook לקבלת מיילים נכנסים מ-Resend Inbound.
// Resend עוטף את הנתונים תחת data; תומכים גם במבנה שטוח ליתר ביטחון.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  // אימות סוד אופציונלי דרך כותרת (מוגדר ב-Resend אם תרצה)
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (secret) {
    const provided = request.headers.get('x-webhook-secret') ?? request.nextUrl.searchParams.get('secret')
    if (provided !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = (body.data as Record<string, unknown>) ?? body

  const from = parseAddress(data.from ?? '')
  const toRaw = Array.isArray(data.to) ? data.to[0] : data.to
  const to = parseAddress(toRaw ?? '')

  // attachments: שמירת המטא-דאטה בלבד (שם/סוג/גודל) — לא את התוכן הבינארי
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attachments = Array.isArray(data.attachments) ? data.attachments.map((a: any) => ({
    filename: a.filename ?? a.name ?? 'attachment',
    mimeType: a.content_type ?? a.contentType ?? a.mimeType ?? 'application/octet-stream',
    size: a.size ?? null,
  })) : []

  const admin = getAdminClient()
  const { error } = await admin.from('inbound_emails').upsert({
    message_id: data.message_id ?? data.messageId ?? data.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    from_email: from.email,
    from_name: from.name,
    to_email: to.email,
    subject: String(data.subject ?? ''),
    html: data.html ?? null,
    plain_text: data.text ?? data.plain_text ?? null,
    headers: data.headers ?? null,
    attachments,
    is_read: false,
  }, { onConflict: 'message_id', ignoreDuplicates: true })

  if (error) {
    console.error('[resend-inbound] DB error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
