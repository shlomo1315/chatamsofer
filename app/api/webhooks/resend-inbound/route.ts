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

  const admin = getAdminClient()

  const messageId = data.message_id ?? data.messageId ?? data.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

  // attachments: העלאת התוכן הבינארי ל-Supabase storage כדי שיהיה ניתן לצפות/להוריד.
  // Resend מספק את התוכן כ-base64 בשדה content. נשמר את שם/סוג/גודל + url ציבורי.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawAttachments: any[] = Array.isArray(data.attachments) ? data.attachments : []
  const attachments: { filename: string; mimeType: string; size: number; url?: string }[] = []
  for (let i = 0; i < rawAttachments.length; i++) {
    const a = rawAttachments[i]
    const filename = String(a.filename ?? a.name ?? `attachment-${i + 1}`)
    const mimeType = String(a.content_type ?? a.contentType ?? a.mimeType ?? 'application/octet-stream')
    const b64 = a.content ?? a.content_b64 ?? a.contentB64 ?? a.data ?? null
    let url: string | undefined
    let size = typeof a.size === 'number' ? a.size : 0
    if (b64) {
      try {
        const buffer = Buffer.from(String(b64), 'base64')
        size = buffer.length
        const safe = filename.replace(/[^\w.\-]+/g, '_')
        const path = `mail/${String(messageId).replace(/[^\w.\-]+/g, '_')}/${i}_${safe}`
        const { error: upErr } = await admin.storage.from('documents').upload(path, buffer, { contentType: mimeType, upsert: true })
        if (!upErr) {
          url = admin.storage.from('documents').getPublicUrl(path).data.publicUrl
        } else {
          console.error('[resend-inbound] attachment upload error:', upErr.message)
        }
      } catch (e) {
        console.error('[resend-inbound] attachment process error:', e instanceof Error ? e.message : String(e))
      }
    }
    attachments.push({ filename, mimeType, size, url })
  }
  const { error } = await admin.from('inbound_emails').upsert({
    message_id: messageId,
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
