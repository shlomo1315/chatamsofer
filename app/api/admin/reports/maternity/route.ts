import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// נתוני גלם לדוחות יולדות (כל השדות הרלוונטיים לסינון/ייצוא). הסינון נעשה בצד לקוח.
export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401, headers: NO_STORE })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: NO_STORE })

  const { data, error } = await admin
    .from('maternity_aids')
    .select('id, birth_date, baby_name, status, card_status, card_balance, recovery_home, recovery_arrived, recovery_amount, recovery_amount_status, recovery_amount_at, recovery_nights, created_at, beneficiary:beneficiaries(full_name, family_name, spouse_name, spouse_id_number, id_number, city)')
    .order('birth_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((a: any) => ({
    id: a.id,
    motherName: [a.beneficiary?.family_name, a.beneficiary?.spouse_name || a.beneficiary?.full_name].filter(Boolean).join(' ') || '—',
    motherId: a.beneficiary?.spouse_id_number ?? a.beneficiary?.id_number ?? '',
    city: a.beneficiary?.city ?? '',
    babyName: a.baby_name ?? '',
    birthDate: a.birth_date ?? '',
    status: a.status ?? '',
    cardStatus: a.card_status ?? 'pending',
    cardBalance: a.card_balance ?? 0,
    recoveryHome: a.recovery_home ?? '',
    arrived: a.recovery_arrived,
    recoveryAmount: a.recovery_amount,
    recoveryAmountStatus: a.recovery_amount_status ?? '',
    recoveryAmountAt: a.recovery_amount_at ?? '',
    recoveryNights: a.recovery_nights,
  }))

  return NextResponse.json({ rows }, { headers: NO_STORE })
}
