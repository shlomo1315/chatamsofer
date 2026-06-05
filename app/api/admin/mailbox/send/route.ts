import { NextResponse, type NextRequest } from 'next/server'
import { getAuthedAdmin } from '@/lib/admin-auth'
import { gmailSend, getGoogleStatus, type GmailAttachment } from '@/lib/google'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_ATTACH_BYTES = 25 * 1024 * 1024 // מגבלת Gmail בפועל ~25MB

interface AttachmentInput {
  file_url?: string
  file_name?: string
  content_type?: string
  size?: number
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: 'אין הרשאה — תיבת הדואר זמינה למנהל בלבד' }, { status: 403 })
  }

  const status = await getGoogleStatus()
  if (!status.connected || !status.email) {
    return NextResponse.json({ error: 'Gmail אינו מחובר — חבר את החשבון תחילה' }, { status: 503 })
  }

  let body: {
    to?: string[]
    cc?: string[]
    subject?: string
    body_text?: string
    body_html?: string
    in_reply_to?: string
    thread_id?: string
    attachments?: AttachmentInput[]
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const to = (body.to ?? []).map((s) => String(s).trim()).filter(Boolean)
  const cc = (body.cc ?? []).map((s) => String(s).trim()).filter(Boolean)
  const subject = String(body.subject ?? '').trim()
  const text = body.body_text ? String(body.body_text) : undefined
  const html = body.body_html ? String(body.body_html) : undefined

  if (to.length === 0 || !to.every((e) => EMAIL_RE.test(e))) {
    return NextResponse.json({ error: 'יש להזין נמען תקין' }, { status: 400 })
  }
  if (cc.some((e) => !EMAIL_RE.test(e))) {
    return NextResponse.json({ error: 'כתובת עותק (CC) לא תקינה' }, { status: 400 })
  }
  if (!subject) return NextResponse.json({ error: 'נושא חובה' }, { status: 400 })
  if (!text && !html) return NextResponse.json({ error: 'גוף ההודעה חסר' }, { status: 400 })

  const attachmentsInput = (body.attachments ?? []).filter((a): a is AttachmentInput & { file_url: string } => !!a?.file_url)

  // שליפת תוכן הקבצים המצורפים (הועלו מראש ל-Storage) לצורך הטמעה ב-MIME
  const attachments: GmailAttachment[] = []
  let totalBytes = 0
  for (const a of attachmentsInput) {
    try {
      const r = await fetch(a.file_url)
      if (!r.ok) continue
      const buf = Buffer.from(await r.arrayBuffer())
      totalBytes += buf.length
      if (totalBytes > MAX_ATTACH_BYTES) {
        return NextResponse.json({ error: 'הקבצים המצורפים גדולים מדי (מעל 25MB)' }, { status: 400 })
      }
      attachments.push({
        filename: a.file_name || 'attachment',
        contentType: a.content_type,
        content: buf,
      })
    } catch {
      return NextResponse.json({ error: `שגיאה בצירוף הקובץ ${a.file_name ?? ''}` }, { status: 502 })
    }
  }

  const fromName = process.env.MAILBOX_FROM_NAME ?? 'היכל החתם סופר'

  // שליחה דרך Gmail
  let providerId = ''
  let threadId = body.thread_id ?? ''
  try {
    const sent = await gmailSend({
      fromEmail: status.email,
      fromName,
      to,
      cc,
      subject,
      text,
      html,
      inReplyTo: body.in_reply_to,
      threadId: body.thread_id,
      attachments,
    })
    providerId = sent.id
    threadId = sent.threadId
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאה בשליחת המייל'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // שמירת ההודעה בלוג (RLS — מנהל מורשה)
  const { data: inserted, error: insErr } = await auth.supabase
    .from('mail_messages')
    .insert({
      direction: 'outbound',
      from_email: status.email,
      from_name: fromName,
      to_emails: to,
      cc_emails: cc,
      subject,
      body_text: text ?? null,
      body_html: html ?? null,
      status: 'sent',
      is_read: true,
      thread_id: threadId || providerId || null,
      in_reply_to: body.in_reply_to ?? null,
      provider_id: providerId || null,
      has_attachments: attachmentsInput.length > 0,
      sent_by: auth.user.id,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insErr) {
    // המייל נשלח אך השמירה נכשלה — מדווחים בהצלחה חלקית
    return NextResponse.json({ ok: true, provider_id: providerId, warning: 'נשלח אך לא נשמר בלוג' })
  }

  if (inserted && attachmentsInput.length > 0) {
    await auth.supabase.from('mail_attachments').insert(
      attachmentsInput.map((a) => ({
        message_id: inserted.id,
        file_url: a.file_url,
        file_name: a.file_name ?? null,
        content_type: a.content_type ?? null,
        size: a.size ?? null,
      }))
    )
  }

  return NextResponse.json({ ok: true, id: inserted?.id, provider_id: providerId })
}
