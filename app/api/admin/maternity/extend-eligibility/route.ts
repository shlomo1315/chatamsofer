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

  let body: {
    aidId?: string; action?: 'extend' | 'reset'; endDate?: string; reason?: string
    /** מה מאריכים: כרטיס המזון, בית ההחלמה, או שניהם. ברירת מחדל — שניהם. */
    scope?: 'card' | 'recovery' | 'both'
    /** תאריך נפרד לבית ההחלמה. רק כש-scope='both' ונבחרו תאריכים שונים. */
    recoveryEndDate?: string
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { aidId, action = 'extend', endDate, reason, recoveryEndDate } = body
  const scope = body.scope ?? 'both'
  if (!['card', 'recovery', 'both'].includes(scope)) {
    return NextResponse.json({ error: 'היקף ההארכה אינו תקין' }, { status: 400 })
  }
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה תיק' }, { status: 400 })
  if (action !== 'extend' && action !== 'reset') return NextResponse.json({ error: 'פעולה לא תקינה' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, birth_date, six_weeks_end, eligibility_extended, recovery_end_override')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return NextResponse.json({ error: 'התיק לא נמצא' }, { status: 404 })

  const defaultEnd = aid.birth_date ? defaultSixWeeksEnd(aid.birth_date) : null
  const previousEnd = aid.six_weeks_end ?? defaultEnd
  // סוף הזכאות לבית החלמה **כפי שהוא חל כרגע** — הדריסה אם קיימת, אחרת
  // התאריך של הכרטיס, אחרת החישוב האוטומטי (35 יום).
  const prevRecoveryEnd = aid.recovery_end_override
    ?? aid.six_weeks_end
    ?? (aid.birth_date
      ? new Date(new Date(aid.birth_date).getTime() + 35 * 86400000).toISOString().split('T')[0]
      : null)

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
      // 🔴 מנקה גם את הדריסה: בלי זה "החזרה ל-6 שבועות" הייתה משאירה את
      // בית ההחלמה מוארך, והמזכירה הייתה מניחה שהכול חזר לברירת המחדל.
      recovery_end_override: null,
      eligibility_extension_scope: null,
      updated_at: new Date().toISOString(),
    }
    logDetails = { reason: 'החזרה לברירת מחדל (6 שבועות)', from: previousEnd, to: defaultEnd }
  } else {
    // extend
    if (!endDate || !ISO_DATE.test(endDate)) return NextResponse.json({ error: 'יש לבחור תאריך סיום זכאות תקין' }, { status: 400 })
    if (aid.birth_date && endDate <= aid.birth_date) {
      return NextResponse.json({ error: 'תאריך סיום הזכאות חייב להיות לאחר תאריך הלידה' }, { status: 400 })
    }
    // ─────────────────────────────────────────────────────────────────────
    // 🔴 מה נכתב, לפי ההיקף שנבחר:
    //
    //   card     — six_weeks_end בלבד. בית ההחלמה נשאר על מה שהיה, ולכן
    //              נכתבת לו דריסה מפורשת עם הערך הקודם — אחרת הוא היה
    //              נגרר אחרי הכרטיס ומוארך בלי שביקשו.
    //   recovery — recovery_end_override בלבד. הכרטיס אינו זז.
    //   both     — שניהם. תאריך נפרד לבית ההחלמה רק אם נבחר במפורש.
    //
    // ⚠️ המקרה הראשון הוא העדין: בלי הדריסה, "הארכת הכרטיס בלבד" הייתה
    // מאריכה בשקט גם את בית ההחלמה, כי recoveryWindowEnd נגזר מהכרטיס.
    // ─────────────────────────────────────────────────────────────────────
    const recoveryTarget = recoveryEndDate && ISO_DATE.test(recoveryEndDate)
      ? recoveryEndDate
      : endDate

    updates = {
      eligibility_extended: true,
      eligibility_extended_at: new Date().toISOString(),
      eligibility_extended_by: staff.userId,
      eligibility_extension_reason: reason?.trim() || null,
      eligibility_extension_scope: scope,
      updated_at: new Date().toISOString(),
    }

    if (scope === 'card') {
      updates.six_weeks_end = endDate
      // ⚠️ מקבע את בית ההחלמה על מה שחל עליו עכשיו, כדי שלא ייגרר.
      updates.recovery_end_override = prevRecoveryEnd
    } else if (scope === 'recovery') {
      updates.recovery_end_override = endDate
      // ⚠️ six_weeks_end לא נוגעים בו — הכרטיס אינו מוארך.
    } else {
      updates.six_weeks_end = endDate
      // ⚠️ null כשהתאריכים זהים: כך בית ההחלמה חוזר להיגזר מהכרטיס,
      // ואין דריסה מיותרת שתישאר ותבלבל בהארכה הבאה.
      updates.recovery_end_override = recoveryTarget === endDate ? null : recoveryTarget
    }

    logDetails = {
      reason: reason?.trim() || 'הארכת זכאות ידנית',
      scope,
      from: previousEnd, to: endDate,
      recovery_from: prevRecoveryEnd, recovery_to: recoveryTarget,
      default_end: defaultEnd,
    }
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

  // ⚠️ מוחזר פירוט מלא — החלונית מציגה בדיוק מה בוצע, ולא "הצלחה" סתמית.
  return NextResponse.json({
    ok: true,
    six_weeks_end: updates.six_weeks_end,
    eligibility_extended: updates.eligibility_extended,
    result: action === 'reset'
      ? { action: 'reset' as const, cardEnd: defaultEnd, recoveryEnd: defaultEnd }
      : {
        action: 'extend' as const,
        scope,
        cardFrom: previousEnd,
        cardTo: scope === 'recovery' ? previousEnd : endDate,
        cardChanged: scope !== 'recovery',
        recoveryFrom: prevRecoveryEnd,
        recoveryTo: scope === 'card' ? prevRecoveryEnd : (logDetails.recovery_to as string),
        recoveryChanged: scope !== 'card',
      },
  })
}
