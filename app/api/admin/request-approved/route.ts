import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { deliverMail, type MailAttachment } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { loanApprovedEmail, birthApprovedEmail, type RequestApprovedBeneficiary } from '@/lib/emailTemplates'
import { loadMaternityCardOnApproval } from '@/lib/maternityCards'
import { buildMaternityVouchers } from '@/lib/maternityVoucher'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// נקרא כאשר המזכיר מאשר בקשת הלוואה/לידה:
// 1. שולח לנרשם מייל מעוצב "בקשתך אושרה" עם הפרטים שלו ופרטי הבקשה.
// 2. אם המשפחה טרם אושרה — הופך אותה אוטומטית ל"מאושר" (לבקשות הבאות).
//    אין מייל נפרד על "אישור כצאצא" — רק על אישור הבקשה.
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

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
    ? `amount, approved_amount, installments, monthly_payment, purpose, beneficiary:beneficiaries(${benSelect})`
    : `baby_name, baby_gender, birth_date, recovery_home, birth_type, beneficiary:beneficiaries(${benSelect})`

  const { data: req, error } = await admin.from(table).select(reqSelect).eq('id', id).maybeSingle()
  if (error || !req) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })

  const ben = (req as unknown as Record<string, unknown>).beneficiary as (RequestApprovedBeneficiary & { id?: string; email?: string | null; eligibility_status?: string }) | null
  if (!ben?.id) return NextResponse.json({ error: 'נתמך לא נמצא' }, { status: 404 })

  // 1. מייל אישור הבקשה (לא חוסם)
  if (ben.email) {
    // אישור לידה → שולפים את רשימת המוקדים הפעילים לאיסוף כרטיס המזון (600 ₪)
    let centers: { name: string; city?: string | null; address?: string | null }[] = []
    if (type === 'maternity') {
      const { data: centerRows } = await admin
        .from('card_centers')
        .select('name, city, address')
        .eq('is_active', true)
        .order('name')
      centers = centerRows ?? []
    }
    const mail = type === 'loan'
      ? loanApprovedEmail(ben, req as unknown as { amount?: number; approved_amount?: number | null; installments?: number; monthly_payment?: number; purpose?: string })
      : birthApprovedEmail(ben, req as unknown as { baby_name?: string; baby_gender?: string; birth_date?: string; recovery_home?: string }, centers)

    // אישור לידה (רגילה, לא שקטה) → צירוף שני שוברי PDF מעוצבים: הבראה בבית החלמה + כרטיס מזון
    let attachments: MailAttachment[] | undefined
    if (type === 'maternity') {
      const birth = req as unknown as { birth_date?: string; recovery_home?: string; birth_type?: string }
      if ((birth.birth_type ?? 'live') !== 'silent') {
        try {
          const motherName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || (ben.full_name ?? '')
          attachments = await buildMaternityVouchers({
            motherName,
            birthDate: birth.birth_date,
            recoveryHome: birth.recovery_home,
            centers,
          })
        } catch (e) { console.error('[request-approved] voucher build failed:', e) }
      }
    }

    deliverMail(ben.email, mail.subject, mail.html, attachments, mailFor(type === 'loan' ? 'gemach' : 'maternity')).catch(e => console.error('[request-approved] mail failed:', e))
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

  // 3. אישור לידה → הטענת 600 ₪ אוטומטית בנדרים (איתור/הקמת המשפחה לפי ת.ז). לא חוסם.
  if (type === 'maternity') {
    try { await loadMaternityCardOnApproval(admin, id) }
    catch (e) { console.error('[request-approved] maternity nedarim load failed:', e) }
  }

  return NextResponse.json({ ok: true, promoted })
}
