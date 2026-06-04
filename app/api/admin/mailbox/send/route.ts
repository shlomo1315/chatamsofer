import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { sendMail, isResendConfigured } from '@/lib/resend'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// מאמת שהמשתמש מחובר ומשמש כמנהל, ומחזיר את הקליינט והמשתמש לשימוש חוזר
async function getAuthedAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(list) { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { /* server component */ } },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { ok: false as const }
  return { ok: true as const, supabase, user }
}

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
  if (!isResendConfigured()) {
    return NextResponse.json({ error: 'שירות המייל (Resend) אינו מוגדר עדיין בשרת' }, { status: 503 })
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

  const attachments = (body.attachments ?? []).filter((a): a is AttachmentInput & { file_url: string } => !!a?.file_url)

  // שליחה דרך Resend
  let providerId = ''
  try {
    const sent = await sendMail({
      to,
      cc,
      subject,
      text,
      html,
      headers: body.in_reply_to ? { 'In-Reply-To': body.in_reply_to } : undefined,
      attachments: attachments.map((a) => ({ filename: a.file_name || 'attachment', path: a.file_url })),
    })
    providerId = sent.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאה בשליחת המייל'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // שמירת ההודעה בלוג (RLS — מנהל מורשה)
  const { data: inserted, error: insErr } = await auth.supabase
    .from('mail_messages')
    .insert({
      direction: 'outbound',
      from_email: process.env.MAILBOX_FROM_ADDRESS,
      from_name: process.env.MAILBOX_FROM_NAME ?? null,
      to_emails: to,
      cc_emails: cc,
      subject,
      body_text: text ?? null,
      body_html: html ?? null,
      status: 'sent',
      is_read: true,
      thread_id: body.thread_id ?? providerId ?? null,
      in_reply_to: body.in_reply_to ?? null,
      provider_id: providerId || null,
      has_attachments: attachments.length > 0,
      sent_by: auth.user.id,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insErr) {
    // המייל נשלח אך השמירה נכשלה — מדווחים בהצלחה חלקית
    return NextResponse.json({ ok: true, provider_id: providerId, warning: 'נשלח אך לא נשמר בלוג' })
  }

  if (inserted && attachments.length > 0) {
    await auth.supabase.from('mail_attachments').insert(
      attachments.map((a) => ({
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
