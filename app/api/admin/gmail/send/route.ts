import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClient } from '@/lib/gmail'
import { buildRawEmail, encodeForGmail } from '@/lib/buildEmail'

export const dynamic = 'force-dynamic'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  const { to, subject, body, threadId, sentBy, attachments, templateUrls } = await request.json()

  const from     = process.env.GMAIL_EMAIL ?? 'office@chasamsofer.info'
  const fromName = 'היכל החתם סופר משרד ראשי'
  const html     = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/></head><body style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;">${body ?? ''}</body></html>`

  // Create tracking token
  const trackingToken = crypto.randomUUID()
  const supabase = getSupabase()

  // צרופות: קבצים שהועלו (base64) + קבצי טמפלט שנשלפים מה-URL
  const allAttachments: { filename: string; mimeType: string; contentB64: string }[] = []
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      if (a?.contentB64 && a?.filename) {
        allAttachments.push({ filename: a.filename, mimeType: a.mimeType || 'application/octet-stream', contentB64: a.contentB64 })
      }
    }
  }
  if (Array.isArray(templateUrls)) {
    for (const t of templateUrls) {
      if (!t?.url) continue
      try {
        const res = await fetch(t.url)
        if (!res.ok) continue
        const buf = Buffer.from(await res.arrayBuffer())
        allAttachments.push({
          filename: t.filename || 'attachment',
          mimeType: t.mimeType || res.headers.get('content-type') || 'application/octet-stream',
          contentB64: buf.toString('base64'),
        })
      } catch { /* מדלגים על צרופה שנכשלה */ }
    }
  }

  const raw     = buildRawEmail({ from, fromName, to, subject, html, threadId, trackingToken, attachments: allAttachments })
  const encoded = encodeForGmail(raw)

  try {
    const gmail = await getGmailClient()
    const sent  = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded, threadId: threadId || undefined },
    })

    // Store tracking record (non-blocking)
    if (supabase) {
      supabase.from('email_tracking').insert({
        token: trackingToken,
        gmail_msg_id: sent.data.id ?? '',
        to_email: to,
        subject,
        sent_by: sentBy ?? null,
      }).then(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
