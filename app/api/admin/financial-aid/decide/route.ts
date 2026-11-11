import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { financialAidApplicantEmail } from '@/lib/emailTemplates'
import { aidPersonName, type AidRowForMail } from '@/lib/aidDepartmentV2'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const STATUSES = ['approved', 'rejected', 'pending', 'inquiry'] as const

// המזכירות שומרת סטטוס (או רק הערה פנימית). בסטטוס סופי נשלח מייל למגיש.
export async function POST(request: NextRequest) {
  const staff = await requirePermission('financial_aid', 'edit')
  if (!staff) return forbidden()
  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // שמירת הערת המזכירות בלבד
  if (body.status === undefined && typeof body.notes === 'string') {
    const { error } = await admin.from('financial_aid_requests').update({ notes: body.notes.slice(0, 2000), updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const status = body.status as (typeof STATUSES)[number]
  if (!STATUSES.includes(status)) return NextResponse.json({ error: 'סטטוס לא חוקי' }, { status: 400 })
  const amount = status === 'approved' ? Math.round(Number(body.amount)) : null
  if (status === 'approved' && !(amount && amount > 0 && amount < 10_000_000)) return NextResponse.json({ error: 'יש להזין סכום מאושר' }, { status: 400 })
  const note = String(body.note ?? '').trim().slice(0, 1000)

  const { data: req } = await admin
    .from('financial_aid_requests')
    .select('*, beneficiary:beneficiaries(full_name, family_name, email, marital_status, eligibility_status)')
    .eq('id', id).maybeSingle()
  if (!req) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })
  const r = req as Record<string, unknown> & { status?: string; beneficiary_id?: string | null; applicant_email?: string | null; aid_type?: string | null; request_no?: number | null; applicant_details?: { marital_status?: string } | null }
  const benRaw = r.beneficiary
  const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as { full_name?: string; family_name?: string; email?: string; marital_status?: string; eligibility_status?: string } | undefined

  if (status === 'approved' && r.beneficiary_id && ben?.eligibility_status !== 'approved') {
    return NextResponse.json({ error: 'המשפחה טרם אושרה במערכת. יש לאשר את המשפחה תחילה.' }, { status: 400 })
  }

  const final = status === 'approved' || status === 'rejected'
  const buildMail = () => {
    const marital = ben?.marital_status ?? r.applicant_details?.marital_status ?? ''
    return financialAidApplicantEmail({
      name: aidPersonName({ ...(r as unknown as AidRowForMail), beneficiary: ben ?? null }),
      female: /אלמנה|גרושה/.test(marital) || r.aid_type === 'widow',
      requestNo: r.request_no ?? null,
      approved: status === 'approved',
      amount,
      note,
      medical: r.aid_type === 'medical',
    })
  }
  // תצוגה מקדימה של המייל למגיש, בלי לשמור ובלי לשלוח
  if (body.preview) {
    if (!final) return NextResponse.json({ error: 'אין מייל בסטטוס הזה' }, { status: 400 })
    return NextResponse.json({ ok: true, ...buildMail() })
  }
  const now = new Date().toISOString()
  const update: Record<string, unknown> = { status, amount, reviewed_by: staff.userId, updated_at: now }
  if (final) update.decision_note = note || null
  let { error } = await admin.from('financial_aid_requests').update(update).eq('id', id)
  if (error && 'decision_note' in update) {
    // לפני המיגרציה אין עמודת decision_note
    delete update.decision_note
    ;({ error } = await admin.from('financial_aid_requests').update(update).eq('id', id))
  }
  if (error) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })

  await logActivity(admin, {
    userId: staff.userId,
    action: 'financial_aid_decided',
    entityType: 'financial_aid_request',
    entityId: id,
    details: { from: r.status ?? null, to: status, amount },
  })

  let mailed = false
  if (final) {
    const to = String(r.applicant_email || ben?.email || '').trim()
    if (to) {
      const mail = buildMail()
      try {
        await deliverMail(to, mail.subject, mail.html, undefined, mailFor('medical'))
        await admin.from('financial_aid_requests').update({ final_message_sent_at: new Date().toISOString() }).eq('id', id)
        mailed = true
      } catch { /* ההחלטה נשמרה גם אם המייל נכשל */ }
    }
  }

  return NextResponse.json({ ok: true, mailed })
}
