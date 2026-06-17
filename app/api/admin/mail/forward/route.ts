import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// מעביר מייל למחלקה: מכניס שורה ישירות ל-inbound_emails כדי שיופיע בתיבת הדואר של המחלקה,
// ללא תלות ב-Resend inbound webhook (שלא מנתב מיילים פנימיים).
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const { messageId, targetDepartment, note } = await request.json()

  if (!messageId || !targetDepartment) {
    return NextResponse.json({ error: 'חסרים פרמטרים' }, { status: 400 })
  }

  const dep = DEPARTMENTS[targetDepartment as DepartmentKey]
  if (!dep) return NextResponse.json({ error: 'מחלקה לא קיימת' }, { status: 400 })

  const admin = getAdminClient()

  // שליפת המקור
  const { data: original, error: fetchErr } = await admin
    .from('inbound_emails')
    .select('*')
    .eq('id', messageId)
    .maybeSingle()

  if (fetchErr || !original) {
    return NextResponse.json({ error: 'המייל המקורי לא נמצא' }, { status: 404 })
  }

  const noteHtml = note
    ? `<div style="background:#fffbeb;border-right:3px solid #f59e0b;padding:8px 12px;margin-bottom:12px;color:#92400e;font-size:13px;">${note}</div>`
    : ''
  const forwardedBody = `
    ${noteHtml}
    <div style="border-top:1px solid #e2e8f0;padding-top:12px;margin-top:8px;color:#64748b;font-size:12px;">
      <strong>הועבר מ:</strong> ${original.from_email} &nbsp;|&nbsp;
      <strong>ל:</strong> ${original.to_email} &nbsp;|&nbsp;
      <strong>ע"י:</strong> ${staff.email}
    </div>
    <div style="margin-top:8px;">
      ${original.body_html ?? original.body_text ?? ''}
    </div>
  `

  const { error: insertErr } = await admin.from('inbound_emails').insert({
    from_email: original.from_email,
    from_name: original.from_name ?? null,
    to_email: dep.email,
    subject: `Fwd: ${original.subject ?? ''}`,
    body_html: forwardedBody,
    body_text: original.body_text ? `${note ? `${note}\n\n---\n` : ''}${original.body_text}` : null,
    is_read: false,
    received_at: new Date().toISOString(),
    resend_email_id: null,
  })

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
