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

// פענוח חלק MIME לפי Content-Transfer-Encoding (base64 / quoted-printable)
function decodeMimePart(content: string, encoding: string): string {
  const enc = (encoding || '').toLowerCase()
  try {
    if (enc.includes('base64')) return Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf8')
    if (enc.includes('quoted-printable')) {
      return content.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    }
  } catch { /* נופלים לתוכן הגולמי */ }
  return content
}

// נפילה-לאחור: חילוץ בסיסי של חלקי text/html ו-text/plain מתוך MIME גולמי
function extractFromRawMime(raw: string): { html: string | null; text: string | null } {
  try {
    let html: string | null = null
    let text: string | null = null
    for (const part of raw.split(/\r?\n--/)) {
      const sep = part.search(/\r?\n\r?\n/)
      if (sep === -1) continue
      const head = part.slice(0, sep).toLowerCase()
      const enc = (head.match(/content-transfer-encoding:\s*([^\r\n;]+)/) || [])[1] || ''
      const content = part.slice(sep).trim()
      if (head.includes('text/html') && !html) html = decodeMimePart(content, enc)
      else if (head.includes('text/plain') && !text) text = decodeMimePart(content, enc)
    }
    return { html, text }
  } catch { return { html: null, text: null } }
}

// צילום מצב של ה-payload הנכנס לאבחון — ללא תוכן בינארי של קבצים, עם קיצור מחרוזות ארוכות.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debugSnapshot(d: any): any {
  try {
    return JSON.parse(JSON.stringify(d, (k, v) => {
      if ((k === 'content' || k === 'content_b64' || k === 'contentB64') && v) return `[binary ${String(v).length} chars]`
      if (typeof v === 'string' && v.length > 1500) return `[len ${v.length}] ${v.slice(0, 1500)}`
      return v
    }))
  } catch { return { _error: 'serialize failed' } }
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

  // אבחון: שומרים צילום של ה-payload האחרון (ללא תוכן בינארי) כדי לאתר היכן נמצא גוף ההודעה
  try {
    await admin.from('app_settings').upsert({
      key: 'mail_inbound_last_payload',
      value: JSON.stringify({
        at: new Date().toISOString(),
        bodyKeys: Object.keys(body),
        dataKeys: Object.keys(data),
        snapshot: debugSnapshot(data),
      }).slice(0, 90000),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
  } catch { /* אבחון בלבד — לא חוסם את הקליטה */ }

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
  // חילוץ גוף ההודעה — תומך בשמות שדה שונים של ספקי Inbound (Resend/Mailgun/SendGrid/Postmark)
  const pickStr = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = (data as Record<string, unknown>)[k]
      if (typeof v === 'string' && v.trim()) return v
    }
    return null
  }
  let html = pickStr('html', 'body_html', 'body-html', 'bodyHtml', 'stripped-html', 'HtmlBody')
  let plain = pickStr('text', 'plain_text', 'plainText', 'body_plain', 'body-plain', 'bodyPlain', 'stripped-text', 'TextBody')
  // אם אין גוף מפורק אך יש MIME גולמי — מחלצים ממנו
  if (!html && !plain) {
    const raw = pickStr('raw', 'email', 'message', 'mime', 'body')
    if (raw) { const ex = extractFromRawMime(raw); html = ex.html; plain = ex.text }
  }
  if (!html && !plain) {
    console.warn('[resend-inbound] empty body for message', messageId, '— payload keys:', Object.keys(data).join(','))
  }

  const { error } = await admin.from('inbound_emails').upsert({
    message_id: messageId,
    from_email: from.email,
    from_name: from.name,
    to_email: to.email,
    subject: String(data.subject ?? ''),
    html: html ?? null,
    plain_text: plain ?? null,
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
