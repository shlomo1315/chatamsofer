import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { portalCookieName } from '../login/route'
import { verifyRecoveryPortalToken } from '@/lib/recoveryPortalAuth'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { recoveryTopupEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// תשלום משלים: בית ההחלמה מוסיף קבלה נוספת לרשומה שכבר הוגשה ונעולה.
//
// זה המסלול שפותר את המקרה השכיח — יולדת שתכננה לילה אחד והאריכה לשניים.
// עד כה הרשומה הייתה נעולה, הקבלה הישנה נדרסת בכל העלאה, ובית ההחלמה נתקע.
// כאן הקבלה *מצטרפת* לקודמות והסכום מצטבר, בלי לפתוח את הרשומה לעריכה.
export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  const { home, aidId, amount, nights, note, receiptUrl } = await request.json()
  if (!home || !aidId) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })

  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: 'יש להזין את סכום ההפרש לגבייה' }, { status: 400 })
  }
  // הקבלה חובה — תשלום משלים בלי אסמכתא הוא בדיוק מה שמנסים למנוע.
  const url = typeof receiptUrl === 'string' && /^https?:\/\/\S+$/i.test(receiptUrl.trim())
    ? receiptUrl.trim() : null
  if (!url) return NextResponse.json({ error: 'יש לצרף קובץ קבלה עבור התשלום המשלים' }, { status: 400 })

  // לילות נוספים — אופציונלי, אבל אם נשלח חייב להיות מספר שלם חיובי.
  const nightsRaw = nights === '' || nights == null ? null : Number(nights)
  if (nightsRaw != null && (!Number.isInteger(nightsRaw) || nightsRaw < 0)) {
    return NextResponse.json({ error: 'מספר הלילות אינו תקין' }, { status: 400 })
  }
  const noteText = typeof note === 'string' ? note.trim().slice(0, 500) : ''

  const cookieStore = await cookies()
  if (!verifyRecoveryPortalToken(cookieStore.get(portalCookieName(home))?.value, home)) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: aid } = await admin.from('maternity_aids')
    .select('id, recovery_home, recovery_amount, recovery_nights, recovery_amount_status, is_twins, recovery_eligibility_days, beneficiaries(family_name, full_name, spouse_name)')
    .eq('id', aidId).maybeSingle()
  if (!aid || aid.recovery_home !== home) {
    return NextResponse.json({ error: 'הרשומה לא נמצאה בבית החלמה זה' }, { status: 404 })
  }
  // תשלום משלים אפשרי רק אחרי הגשה ראשונה — אחרת זו הגשה רגילה.
  if (aid.recovery_amount_status !== 'executed') {
    return NextResponse.json({ error: 'יש להשלים תחילה את ההגשה הראשונה' }, { status: 400 })
  }

  // תקרת הלילות נשמרת גם כאן: הלילות שכבר נרשמו + הנוספים לא יעברו את הזכאות.
  const maxNights = aid.recovery_eligibility_days ?? (aid.is_twins ? 4 : 2)
  const totalNights = (aid.recovery_nights ?? 0) + (nightsRaw ?? 0)
  if (nightsRaw != null && totalNights > maxNights) {
    return NextResponse.json(
      { error: `סך הלילות (${totalNights}) עולה על הזכאות (${maxNights}) — פנו למשרד` },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const { error: insErr } = await admin.from('recovery_receipts').insert({
    aid_id: aidId, home, url, amount: amt, nights: nightsRaw, note: noteText || null,
  })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // הסכום המצטבר מחושב מהטבלה עצמה ולא מחיבור לערך הישן — כך שגם אם הוגשו
  // שתי בקשות במקביל, הסכום שנשמר תמיד תואם את סך הקבלות בפועל.
  const { data: all } = await admin.from('recovery_receipts')
    .select('amount').eq('aid_id', aidId)
  const newTotal = (all ?? []).reduce((s, r: { amount: number | string }) => s + Number(r.amount || 0), 0)

  const { error: updErr } = await admin.from('maternity_aids').update({
    recovery_amount: newTotal,
    ...(nightsRaw ? { recovery_nights: totalNights } : {}),
    recovery_topup_at: now,
    updated_at: now,
  }).eq('id', aidId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // התראה למשרד — התשלום כבר נכנס לחשבון, זו הודעה תפעולית.
  try {
    const ben = Array.isArray(aid.beneficiaries) ? aid.beneficiaries[0] : aid.beneficiaries
    const motherName = ben
      ? [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || '—'
      : '—'
    const mail = recoveryTopupEmail({
      home, motherName, amount: amt, total: newTotal,
      nights: nightsRaw, note: noteText, receiptUrl: url,
    })
    const dept = mailFor('maternity')
    await deliverMail(dept.fromEmail, mail.subject, mail.html, undefined, dept)
  } catch { /* כשל מייל לא חוסם */ }

  return NextResponse.json({ ok: true, total: newTotal, nights: nightsRaw ? totalNights : aid.recovery_nights })
}
