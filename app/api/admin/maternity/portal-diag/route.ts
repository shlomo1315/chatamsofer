import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { isWithinRecoveryWindow, recoveryWindowEnd } from '@/lib/maternity'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// בירור מהיר: למה יולדת מאושרת אינה מופיעה בפורטל בית ההחלמה שלה.
//
// 🔴 פורטל בית ההחלמה (app/api/portal/data) מציג רק תיקים עם
// status='active' ו-recovery_home התואם *בדיוק* לשם בית ההחלמה, וגם
// בתוך חלון הזכאות (35 יום) — אלא אם כבר מומש (recovery_amount_status
// = 'executed'). כל אחד מהתנאים האלה יכול להסביר "מאושרת אך לא נראית".
//
// GET ?id_number=<ת"ז האם או ת"ז האשה>
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const idNumber = (request.nextUrl.searchParams.get('id_number') ?? '').trim()
  if (!idNumber) return NextResponse.json({ error: 'חסר מספר תעודת זהות' }, { status: 400 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await db.from('beneficiaries')
    .select('id, full_name, family_name, spouse_name, id_number, spouse_id_number, eligibility_status')
    .or(`id_number.eq.${idNumber},spouse_id_number.eq.${idNumber}`)
    .maybeSingle()

  if (!ben) return NextResponse.json({ error: 'לא נמצאה משפחה עם תעודת זהות זו' }, { status: 404 })

  const { data: aids } = await db.from('maternity_aids')
    .select('id, status, recovery_home, birth_date, six_weeks_end, recovery_amount_status, is_twins, created_at')
    .eq('beneficiary_id', ben.id)
    .order('created_at', { ascending: false })

  const report = (aids ?? []).map(a => {
    const withinWindow = isWithinRecoveryWindow(a)
    const executed = a.recovery_amount_status === 'executed'
    const visibleInPortal = a.status === 'active' && !!a.recovery_home && (withinWindow || executed)
    const reasons: string[] = []
    if (a.status !== 'active') reasons.push(`תיק הלידה בסטטוס "${a.status}" ולא "active" — הלידה טרם אושרה בפועל (גם אם המשפחה עצמה מאושרת)`)
    if (!a.recovery_home) reasons.push('לא נבחר בית החלמה בתיק זה')
    if (a.recovery_home && !withinWindow && !executed) {
      reasons.push(`חלון הזכאות (35 יום) הסתיים ב-${recoveryWindowEnd(a)?.toLocaleDateString('he-IL') ?? '—'} והתשלום עדיין לא סומן כ"מומש"`)
    }
    return {
      aid_id: a.id, status: a.status, recovery_home: a.recovery_home,
      birth_date: a.birth_date, recovery_window_end: recoveryWindowEnd(a),
      recovery_amount_status: a.recovery_amount_status,
      visibleInPortal, reasons,
    }
  })

  return NextResponse.json({
    beneficiary: {
      id: ben.id, name: [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' '),
      eligibility_status: ben.eligibility_status,
    },
    aids: report,
  })
}
