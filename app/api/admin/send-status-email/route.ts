import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { templateStatusRejected } from '@/lib/email'
import { docsPendingEmail, approvalEmail } from '@/lib/emailTemplates'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { getDocTypes } from '@/lib/serverDocTypes'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const { id, status, reason, docsNotes } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'missing fields' }, { status: 400 })

  const client = getClient()
  const { data: ben, error } = await client
    .from('beneficiaries')
    .select('email, full_name, family_name, id_number, phone, city, marital_status, spouse_name, children_count, required_docs')
    .eq('id', id)
    .maybeSingle()

  if (error || !ben) return NextResponse.json({ error: 'beneficiary not found' }, { status: 404 })
  if (!ben.email) return NextResponse.json({ ok: true, skipped: 'no email' })

  let payload
  if (status === 'approved') {
    payload = approvalEmail(ben.full_name, undefined, {
      family_name: ben.family_name,
      id_number: ben.id_number,
      phone: ben.phone,
      city: ben.city,
      marital_status: ben.marital_status,
      spouse_name: ben.spouse_name,
      children_count: ben.children_count,
    })
  } else if (status === 'rejected') {
    payload = templateStatusRejected(ben.full_name, reason)
  } else if (status === 'docs_pending') {
    // רשימת המסמכים מהצ'קליסט שהמזכירות סימנה (נשמרה ב-required_docs), עם נפילה לפי מצב משפחתי
    const types = await getDocTypes()
    const labelOf = (k: string) => types.find(t => t.value === k)?.label ?? k
    const keys = (ben.required_docs ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
    const labels = keys.map(labelOf)
    payload = docsPendingEmail([ben.family_name, ben.full_name].filter(Boolean).join(' ') || ben.full_name, undefined, ben.marital_status, labels, docsNotes)
  } else {
    return NextResponse.json({ ok: true, skipped: 'no template for status' })
  }

  const result = await deliverMail(ben.email, payload.subject, payload.html, undefined, mailFor('igud'))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
