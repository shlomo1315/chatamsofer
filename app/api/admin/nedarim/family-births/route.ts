// לידות המשפחה (לפי ת"ז) — להצגת "סיבת הטעינות" במודאל נדרים קארד.
// כל לידה = טעינת כרטיס; כאן מחזירים תאריך לידה, שם התינוק וסטטוס.
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(request: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403, headers: NO_STORE })
  const zeout = (request.nextUrl.searchParams.get('zeout') ?? '').replace(/\D/g, '')
  if (!zeout) return NextResponse.json({ births: [] }, { headers: NO_STORE })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // איתור המשפחה לפי ת"ז ראשי או של בן/בת הזוג
  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, family_name, full_name, spouse_name')
    .or(`id_number.eq.${zeout},spouse_id_number.eq.${zeout}`)
    .maybeSingle()
  if (!ben) return NextResponse.json({ births: [] }, { headers: NO_STORE })

  const { data: aids } = await admin
    .from('maternity_aids')
    .select('id, birth_date, baby_name, baby_gender, recovery_home, status, card_status, created_at')
    .eq('beneficiary_id', ben.id)
    .order('birth_date', { ascending: false })

  const motherName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ')
  return NextResponse.json({
    motherName,
    births: (aids ?? []).map((a) => ({
      id: a.id, birthDate: a.birth_date, babyName: a.baby_name, babyGender: a.baby_gender,
      recoveryHome: a.recovery_home, status: a.status, cardStatus: a.card_status, createdAt: a.created_at,
    })),
  }, { headers: NO_STORE })
}
