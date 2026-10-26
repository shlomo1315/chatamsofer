import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { escapeHtml } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// שליחת ההודעה הסופית למבקש: הנוסח נערך ונשלח ידנית ע"י המזכיר.
export async function POST(request: NextRequest) {
  const staff = await requirePermission('financial_aid', 'edit')
  if (!staff) return forbidden()
  const { id, subject, body } = await request.json()
  if (!id || !String(subject ?? '').trim() || !String(body ?? '').trim()) {
    return NextResponse.json({ error: 'יש למלא נושא ותוכן' }, { status: 400 })
  }
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: req } = await admin
    .from('financial_aid_requests')
    .select('applicant_email, beneficiary:beneficiaries(email)')
    .eq('id', id).maybeSingle()
  if (!req) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })
  const benRaw = (req as Record<string, unknown>).beneficiary
  const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as { email?: string | null } | undefined
  const to = String((req as { applicant_email?: string | null }).applicant_email || ben?.email || '').trim()
  if (!to) return NextResponse.json({ error: 'אין כתובת מייל למבקש' }, { status: 400 })

  const html = `<div dir="rtl" style="font-family:Heebo,Arial,sans-serif;font-size:15px;line-height:1.8;color:#0f172a;white-space:pre-wrap;">${escapeHtml(String(body))}</div>`
  try {
    await deliverMail(to, String(subject).trim(), html, undefined, mailFor('medical'))
  } catch {
    return NextResponse.json({ error: 'שליחת המייל נכשלה' }, { status: 500 })
  }
  await admin.from('financial_aid_requests').update({ final_message_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
  await logActivity(admin, { userId: staff.userId, action: 'financial_aid_final_message', entityType: 'financial_aid_request', entityId: String(id), details: { to } })
  return NextResponse.json({ ok: true })
}
