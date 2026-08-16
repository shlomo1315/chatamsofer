import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireMailAccess, unauthorized, forbidden } from '@/lib/apiAuth'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'
import { canAccessInboundMail, allowedMailboxEmails } from '@/lib/mailAccess'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ׳׳¢׳‘׳™׳¨ ׳׳™׳™׳ ׳׳׳—׳׳§׳”: ׳׳›׳ ׳™׳¡ ׳©׳•׳¨׳” ׳™׳©׳™׳¨׳•׳× ׳-inbound_emails ׳›׳“׳™ ׳©׳™׳•׳₪׳™׳¢ ׳‘׳×׳™׳‘׳× ׳”׳“׳•׳׳¨ ׳©׳ ׳”׳׳—׳׳§׳”,
// ׳׳׳ ׳×׳׳•׳× ׳‘-Resend inbound webhook (׳©׳׳ ׳׳ ׳×׳‘ ׳׳™׳™׳׳™׳ ׳₪׳ ׳™׳׳™׳™׳).
export async function POST(request: NextRequest) {
  const staff = await requireMailAccess()
  if (!staff) return unauthorized()

  const { messageId, targetDepartment, note } = await request.json()

  if (!messageId || !targetDepartment) {
    return NextResponse.json({ error: '׳—׳¡׳¨׳™׳ ׳₪׳¨׳׳˜׳¨׳™׳' }, { status: 400 })
  }

  const dep = DEPARTMENTS[targetDepartment as DepartmentKey]
  if (!dep) return NextResponse.json({ error: '׳׳—׳׳§׳” ׳׳ ׳§׳™׳™׳׳×' }, { status: 400 })

  const admin = getAdminClient()

  // ׳׳™׳׳•׳× ׳’׳™׳©׳” ׳›׳₪׳•׳: (1) ׳”׳׳©׳×׳׳© ׳׳•׳¨׳©׳” ׳׳§׳¨׳•׳ ׳׳× ׳”׳׳™׳™׳ ׳”׳׳§׳•׳¨׳™ ג€” ׳׳—׳¨׳× ׳׳₪׳©׳¨ ׳׳”׳¢׳‘׳™׳¨
  // ׳׳¢׳¦׳׳• ׳׳™׳™׳ ׳©׳ ׳׳—׳׳§׳” ׳–׳¨׳” ׳•׳׳§׳¨׳•׳ ׳׳× ׳×׳•׳›׳ ׳•; (2) ׳׳—׳׳§׳× ׳”׳™׳¢׳“ ׳”׳™׳ ׳׳—׳× ׳”׳×׳™׳‘׳•׳×
  // ׳”׳׳•׳¨׳©׳•׳× ׳׳• ג€” ׳׳—׳¨׳× ׳׳₪׳©׳¨ "׳׳©׳×׳•׳" ׳׳™׳™׳ ׳‘׳×׳™׳‘׳” ׳–׳¨׳”. ׳׳ ׳”׳ ׳¢׳•׳‘׳¨ ׳׳× ׳©׳ ׳™׳”׳ (null).
  if (!(await canAccessInboundMail(admin, staff, String(messageId)))) return forbidden()
  const allowedEmails = allowedMailboxEmails(staff)
  if (allowedEmails !== null && !allowedEmails.includes(dep.email)) {
    return forbidden('׳׳™׳ ׳”׳¨׳©׳׳” ׳׳”׳¢׳‘׳™׳¨ ׳׳×׳™׳‘׳” ׳–׳•')
  }

  // ׳©׳׳™׳₪׳× ׳”׳׳§׳•׳¨
  const { data: original, error: fetchErr } = await admin
    .from('inbound_emails')
    .select('*')
    .eq('id', messageId)
    .maybeSingle()

  if (fetchErr || !original) {
    return NextResponse.json({ error: '׳”׳׳™׳™׳ ׳”׳׳§׳•׳¨׳™ ׳׳ ׳ ׳׳¦׳' }, { status: 404 })
  }

  // ׳”-note ׳׳’׳™׳¢ ׳׳”׳׳©׳×׳׳© ׳•׳׳•׳–׳¨׳§ ׳-HTML ג€” escape ׳›׳“׳™ ׳׳׳ ׳•׳¢ ׳”׳–׳¨׳§׳× HTML/׳¡׳§׳¨׳™׳₪׳˜ ׳׳×׳™׳‘׳× ׳”׳™׳¢׳“.
  const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  const noteHtml = note
    ? `<div style="background:#fffbeb;border-right:3px solid #f59e0b;padding:8px 12px;margin-bottom:12px;color:#92400e;font-size:13px;">${escapeHtml(String(note))}</div>`
    : ''
  const forwardedBody = `
    ${noteHtml}
    <div style="border-top:1px solid #e2e8f0;padding-top:12px;margin-top:8px;color:#64748b;font-size:12px;">
      <strong>׳”׳•׳¢׳‘׳¨ ׳:</strong> ${original.from_email} &nbsp;|&nbsp;
      <strong>׳:</strong> ${original.to_email} &nbsp;|&nbsp;
      <strong>׳¢"׳™:</strong> ${staff.email}
    </div>
    <div style="margin-top:8px;">
      ${original.html ?? original.plain_text ?? ''}
    </div>
  `

  const { error: insertErr } = await admin.from('inbound_emails').insert({
    // ׳©׳•׳׳¨׳™׳ ׳׳× ׳”׳›׳×׳•׳‘׳× ׳”׳׳§׳•׳¨׳™׳× ׳©׳ ׳”׳©׳•׳׳— ג€” ׳›׳ ׳©"׳”׳©׳‘" ׳™׳—׳–׳•׳¨ ׳׳¦׳׳¦׳, ׳׳ ׳׳׳—׳׳§׳”
    from_email: original.from_email,
    from_name: original.from_name ?? null,
    to_email: dep.email,
    subject: `Fwd: ${original.subject ?? ''}`,
    html: forwardedBody,
    plain_text: original.plain_text ? `${note ? `${note}\n\n---\n` : ''}${original.plain_text}` : null,
    attachments: original.attachments ?? [],
    is_read: false,
    received_at: new Date().toISOString(),
  })

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
