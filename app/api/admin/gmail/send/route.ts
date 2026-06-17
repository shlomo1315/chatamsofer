import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deliverMail, type MailAttachment } from '@/lib/sendMail'
import { DEPARTMENTS, BRAND_NAME, type DepartmentKey } from '@/lib/departments'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const { to, subject, body, threadId, department, attachments, templateUrls } = await request.json()

  // המייל נשלח מכתובת המחלקה הנבחרת (לא מ-noreply), ותשובות חוזרות אליה
  const deptKey = (department as DepartmentKey) ?? 'main'
  const dept = DEPARTMENTS[deptKey] ?? DEPARTMENTS.main
  const fromName = `${BRAND_NAME} · ${dept.label}`
  const fromEmail = dept.email
  const replyTo = dept.email

  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/></head><body style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;">${body ?? ''}</body></html>`

  // Collect attachments
  const allAttachments: MailAttachment[] = []
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
        allAttachments.push({ filename: t.filename || 'attachment', mimeType: t.mimeType || res.headers.get('content-type') || 'application/octet-stream', contentB64: buf.toString('base64') })
      } catch { /* skip failed attachment */ }
    }
  }

  const result = await deliverMail(to, subject, html, allAttachments.length > 0 ? allAttachments : undefined, { replyTo, fromName, fromEmail })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })

  // תיעוד המייל היוצא ב-Supabase (לא חוסם)
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    admin.from('sent_emails').insert({
      from_name: fromName,
      to_email: to,
      subject,
      html,
      department: deptKey,
      reply_to: replyTo,
      sent_by: staff.email,
      attachments: allAttachments.map(a => ({ filename: a.filename, mimeType: a.mimeType })),
    }).then(({ error }) => { if (error) console.error('[mail/send] log error:', error.message) })
  } catch (e) { console.error('[mail/send] log threw:', e) }

  return NextResponse.json({ ok: true })
}
