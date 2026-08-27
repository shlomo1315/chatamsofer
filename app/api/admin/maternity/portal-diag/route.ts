import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requirePermission, unauthorized, forbidden, getServiceClient } from '@/lib/apiAuth'
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
// GET  ?id_number=<ת"ז האם או ת"ז האשה>            — אבחון בלבד.
// GET  ?id_number=...&fix=1&days=7            — אבחון, ואם הסיבה היא
//   שחלון הזכאות נסגר — מאריך אותו ב-N ימים קדימה (ברירת מחדל: 7),
//   בדיוק כמו לחיצה על "הארכת זכאות" בכרטיס היולדת, כולל רישום בלוג.
//   פועל רק על תיקים שבאמת חסומים מהפורטל בגלל חלון הזכאות — לא על תיקים
//   שאינם "active" או בלי recovery_home.
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

  // ⚠️ פעולה רק עם ?fix=1 מפורש — ורק על התיק הרלוונטי היחיד (status='active',
  // יש recovery_home, מחוץ לחלון). פעולה שכותבת אותה הרשאה שאישור "הארכת
  // זכאות" בכרטיס היולדת ביצע ידנית — כולל רישום בלוג ואישורים, רק בקריאה אחת.
  const wantsFix = request.nextUrl.searchParams.get('fix') === '1'
  let fixed: { aid_id: string; new_recovery_window_end: string } | null = null
  if (wantsFix) {
    const editor = await requirePermission('maternity', 'edit')
    if (!editor) return forbidden()
    const days = Math.max(1, Number(request.nextUrl.searchParams.get('days') ?? 7) || 7)
    const target = (aids ?? []).find(a =>
      a.status === 'active' && !!a.recovery_home &&
      !isWithinRecoveryWindow(a) && a.recovery_amount_status !== 'executed')
    if (target) {
      const newEnd = new Date(); newEnd.setDate(newEnd.getDate() + days)
      const endIso = newEnd.toISOString().split('T')[0]
      const { error: updErr } = await db.from('maternity_aids').update({
        six_weeks_end: endIso,
        eligibility_extended: true,
        eligibility_extended_at: new Date().toISOString(),
        eligibility_extended_by: editor.userId,
        eligibility_extension_reason: 'הארכה דחופה — יולדת נמצאת בפועל בבית ההחלמה ולא נראתה בפורטל',
        updated_at: new Date().toISOString(),
      }).eq('id', target.id)
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
      // רישום ללוג הוא נלווה — כשל בו לא אמור לבטל הארכה שכבר נשמרה.
      try {
        await db.from('activity_log').insert({
          user_id: editor.userId, action: 'maternity_eligibility_extended', entity_type: 'maternity_aids', entity_id: target.id,
          details: { reason: 'תיקון דחוף מהאבחון — נראות בפורטל בית ההחלמה', to: endIso },
        })
      } catch { /* best-effort */ }
      fixed = { aid_id: target.id, new_recovery_window_end: endIso }
      // מרעננים את הערכים שיוצגו למטה כך שהדוח ישקף מיד את התיקון.
      const idx = (aids ?? []).findIndex(a => a.id === target.id)
      if (idx >= 0 && aids) aids[idx] = { ...aids[idx], six_weeks_end: endIso }
    }
  }

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
    fixed,
    beneficiary: {
      id: ben.id, name: [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' '),
      eligibility_status: ben.eligibility_status,
    },
    aids: report,
  })
}
