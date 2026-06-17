import { NextResponse, type NextRequest } from 'next/server'
import { deliverMail, type MailAttachment } from '@/lib/sendMail'
import { DEPARTMENTS, BRAND_NAME, type DepartmentKey } from '@/lib/departments'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const { to, subject, body, threadId, department, attachments, templateUrls } = await request.json()

  // Determine reply-to from department
  const deptKey = (department as DepartmentKey) ?? 'main'
  const dept = DEPARTMENTS[deptKey] ?? DEPARTMENTS.main
  const fromName = `${BRAND_NAME} · ${dept.label}`
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

  const result = await deliverMail(to, subject, html, allAttachments.length > 0 ? allAttachments : undefined, { replyTo, fromName })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
