import { NextResponse, type NextRequest } from 'next/server'
import { addWeeks } from 'date-fns'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// תאריך סיום ברירת המחדל: לידה + 6 שבועות (yyyy-mm-dd) — זהה לחישוב במסכי הפתיחה/העריכה.
function defaultSixWeeksEnd(birthDate: string): string {
  return addWeeks(new Date(birthDate), 6).toISOString().split('T')[0]
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// הארכת/איפוס זכאות יולדת באופן ידני.
//   action = 'extend' → קובע תאריך סיום זכאות חדש (חורג מ-6 השבועות), endDate חובה.
//   action = 'reset'  → חוזר לברירת המחדל (לידה + 6 שבועות) ומבטל את ההארכה הידנית.
// six_weeks_end הוא תאריך הסיום האפקטיבי שכל הלוגיקה (פריקה אוטומטית, פורטל, ימות) נשענת עליו.
export async function POST(request: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()

  let body: { aidId?: string; action?: 'extend' | 'reset'; endDate?: string; reason?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { aidId, action = 'extend', endDate, reason } = body
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה תיק' }, { status: 400 })
  if (action !== 'extend' && action !== 'reset') return NextResponse.json({ error: 'פעולה לא תקינה' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, birth_date, six_weeks_end, eligibility_extended')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return NextResponse.json({ error: 'התיק לא נמצא' }, { status: 404 })

  const defaultEnd = aid.birth_date ? defaultSixWeeksEnd(aid.birth_date) : null
  const previousEnd = aid.six_weeks_end ?? defaultEnd

  let updates: Record<string, unknown>
  let logDetails: Record<string, unknown>

  if (action === 'reset') {
    if (!defaultEnd) return NextResponse.json({ error: 'אין תאריך לידה לחישוב ברירת המחדל' }, { status: 400 })
    updates = {
      six_weeks_end: defaultEnd,
      eligibility_extended: false,
      eligibility_extended_at: null,
      eligibility_extended_by: null,
      eligibility_extension_reason: null,
      updated_at: new Date().toISOString(),
    }
    logDetails = { reason: 'החזרה לברירת מחדל (6 שבועות)', from: previousEnd, to: defaultEnd }
  } else {
    // extend
    if (!endDate || !ISO_DATE.test(endDate)) return NextResponse.json({ error: 'יש לבחור תאריך סיום זכאות תקין' }, { status: 400 })
    if (aid.birth_date && endDate <= aid.birth_date) {
      return NextResponse.json({ error: 'תאריך סיום הזכאות חייב להיות לאחר תאריך הלידה' }, { status: 400 })
    }
    updates = {
      six_weeks_end: endDate,
      eligibility_extended: true,
      eligibility_extended_at: new Date().toISOString(),
      eligibility_extended_by: staff.userId,
      eligibility_extension_reason: reason?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    logDetails = { reason: reason?.trim() || 'הארכת זכאות ידנית', from: previousEnd, to: endDate, default_end: defaultEnd }
  }

  const { error } = await admin.from('maternity_aids').update(updates).eq('id', aidId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // רישום בלוג הפעילות (כשל ברישום לא חוסם את הפעולה)
  try {
    await admin.from('activity_log').insert({
      user_id: staff.userId,
      action: action === 'reset' ? 'maternity_eligibility_reset' : 'maternity_eligibility_extended',
      entity_type: 'maternity_aid',
      entity_id: aidId,
      details: logDetails,
    })
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, six_weeks_end: updates.six_weeks_end, eligibility_extended: updates.eligibility_extended })
}
