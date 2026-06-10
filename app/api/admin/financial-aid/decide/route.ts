import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { deliverMail } from '@/lib/sendMail'
import { financialAidDecisionEmail } from '@/lib/emailTemplates'

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

// עדכון ידני של החלטה (אישור עם סכום / דחייה / החזרה לממתין) + הודעה למבקש.
export async function POST(request: NextRequest) {
  if (!(await verifyStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const { id, status, amount } = await request.json()
  if (!id || !['approved', 'rejected', 'pending'].includes(status)) return NextResponse.json({ error: 'נתונים חסרים' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // לא ניתן לאשר בקשת סיוע למשפחה שטרם אושרה במערכת
  if (status === 'approved') {
    const { data: chk } = await admin
      .from('financial_aid_requests')
      .select('beneficiary:beneficiaries(eligibility_status)')
      .eq('id', id).maybeSingle()
    const elig = ((chk as Record<string, unknown> | null)?.beneficiary as { eligibility_status?: string } | undefined)?.eligibility_status
    if (elig !== 'approved') return NextResponse.json({ error: 'המשפחה טרם אושרה במערכת. יש לאשר את המשפחה תחילה.' }, { status: 400 })
  }

  const { error } = await admin.from('financial_aid_requests').update({
    status,
    amount: status === 'approved' ? (Number(amount) || 0) : null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // הודעה למבקש על החלטה (לא בעת החזרה לממתין)
  if (status === 'approved' || status === 'rejected') {
    const { data: req } = await admin
      .from('financial_aid_requests')
      .select('beneficiary:beneficiaries(full_name, family_name, email)')
      .eq('id', id).maybeSingle()
    const ben = (req as Record<string, unknown> | null)?.beneficiary as { full_name?: string; family_name?: string; email?: string } | undefined
    if (ben?.email) {
      const name = [ben.family_name, ben.full_name].filter(Boolean).join(' ') || ben.full_name || ''
      const mail = financialAidDecisionEmail(name, status === 'approved', status === 'approved' ? Number(amount) || 0 : null)
      deliverMail(ben.email, mail.subject, mail.html).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
