import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { deliverMail } from '@/lib/sendMail'
import { loanApprovedEmail, birthApprovedEmail, type RequestApprovedBeneficiary } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function verifyStaff() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// נקרא כאשר המזכיר מאשר בקשת הלוואה/לידה:
// 1. שולח לנרשם מייל מעוצב "בקשתך אושרה" עם הפרטים שלו ופרטי הבקשה.
// 2. אם המשפחה טרם אושרה — הופך אותה אוטומטית ל"מאושר" (לבקשות הבאות).
//    אין מייל נפרד על "אישור כצאצא" — רק על אישור הבקשה.
export async function POST(request: NextRequest) {
  const user = await verifyStaff()
  if (!user) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  let body: { type?: string; id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const { type, id } = body
  if (!id || (type !== 'loan' && type !== 'maternity')) {
    return NextResponse.json({ error: 'פרמטרים חסרים' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const benSelect = 'id, full_name, family_name, id_number, spouse_name, marital_status, phone, city, children_count, email, eligibility_status'
  const table = type === 'loan' ? 'loans' : 'maternity_aids'
  const reqSelect = type === 'loan'
    ? `amount, installments, monthly_payment, purpose, beneficiary:beneficiaries(${benSelect})`
    : `baby_name, baby_gender, birth_date, recovery_home, beneficiary:beneficiaries(${benSelect})`

  const { data: req, error } = await admin.from(table).select(reqSelect).eq('id', id).maybeSingle()
  if (error || !req) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })

  const ben = (req as Record<string, unknown>).beneficiary as (RequestApprovedBeneficiary & { id?: string; email?: string | null; eligibility_status?: string }) | null
  if (!ben?.id) return NextResponse.json({ error: 'נתמך לא נמצא' }, { status: 404 })

  // 1. מייל אישור הבקשה (לא חוסם)
  if (ben.email) {
    const mail = type === 'loan'
      ? loanApprovedEmail(ben, req as { amount?: number; installments?: number; monthly_payment?: number; purpose?: string })
      : birthApprovedEmail(ben, req as { baby_name?: string; baby_gender?: string; birth_date?: string; recovery_home?: string })
    deliverMail(ben.email, mail.subject, mail.html).catch(e => console.error('[request-approved] mail failed:', e))
  }

  // 2. הפיכה אוטומטית ל"מאושר" אם טרם אושר — ללא מייל נפרד
  let promoted = false
  if (ben.eligibility_status !== 'approved') {
    const { error: upErr } = await admin
      .from('beneficiaries')
      .update({ eligibility_status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', ben.id)
    if (!upErr) promoted = true
    else console.error('[request-approved] promote failed:', upErr.message)
  }

  return NextResponse.json({ ok: true, promoted })
}
