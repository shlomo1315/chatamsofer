import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { portalCookieName } from '../login/route'
import { verifyRecoveryPortalToken } from '@/lib/recoveryPortalAuth'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { recoveryRealizedEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// בית ההחלמה מזין את הסכום שמומש עבור הלידה ושולח לאישור. רק כשסומן "הגיעה".
export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  const { home, aidId, amount, nights, receiptNumber, stayFrom, stayTo, receiptUrl } = await request.json()
  if (!home || !aidId) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  // קישור ישיר לקבלה (חלופה להעלאת קובץ) — נשמר רק אם http/https תקין.
  const linkUrl = typeof receiptUrl === 'string' && /^https?:\/\/\S+$/i.test(receiptUrl.trim())
    ? receiptUrl.trim() : null
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt < 0) return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  const nightsNum = Number(nights)
  if (!Number.isInteger(nightsNum) || nightsNum < 1) {
    return NextResponse.json({ error: 'יש להזין מספר לילות' }, { status: 400 })
  }
  // ⚠️ מספר הקבלה אינו נדרש עוד: הקבלה עצמה מצורפת והמספר מופיע עליה, ושדה
  // נפרד רק הכפיל הקלדה ידנית. הערך עדיין מתקבל ונשמר אם נשלח — כדי שרשומות
  // ישנות שכבר נושאות מספר לא יאבדו אותו בעדכון.
  const receipt = typeof receiptNumber === 'string' ? receiptNumber.trim() : ''

  // טווח תאריכי השהייה — חובה, פורמט ISO, ובתוך חלון 5 השבועות האחרונים
  const ISO = /^\d{4}-\d{2}-\d{2}$/
  const from = typeof stayFrom === 'string' && ISO.test(stayFrom) ? stayFrom : null
  const to = typeof stayTo === 'string' && ISO.test(stayTo) ? stayTo : null
  if (!from || !to) return NextResponse.json({ error: 'יש לסמן את תאריכי השהייה בלוח' }, { status: 400 })
  const fromMs = new Date(from).getTime(), toMs = new Date(to).getTime()
  const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime()
  const windowStart = todayMs - 35 * 86400000
  // ⚠️ יום ההגעה חייב להיות בעבר (עד היום) — אי אפשר להצהיר על הגעה עתידית.
  // אבל יום העזיבה *כן* רשאי ליפול בעתיד, וזה השינוי: מי שהגיעה היום זכאית
  // ליומיים (או לארבעה), והנציג רושם את מלוא הזכאות מיד. עד כה נדרש
  // toMs <= todayMs, ולכן סימון של היום התקבל כיום בודד בלבד.
  //
  // התקרה על יום העזיבה נשמרת בלי בדיקה נפרדת: הטווח חייב להתאים ל-nightsNum
  // (מיד למטה), ו-nightsNum מוגבל לימי הזכאות של היולדת (בהמשך, אחרי שליפת
  // הרשומה). כלומר to לעולם אינו חורג מיום ההגעה + ימי הזכאות.
  if (toMs < fromMs || fromMs < windowStart || fromMs > todayMs) {
    return NextResponse.json(
      { error: 'תאריכי השהייה מחוץ לחלון הזכאות — יום ההגעה חייב להיות בחמשת השבועות האחרונים ולא בעתיד' },
      { status: 400 },
    )
  }
  // מספר הימים חייב להתאים לטווח (הפרש + 1, כולל יום ההגעה)
  if (Math.round((toMs - fromMs) / 86400000) + 1 !== nightsNum) {
    return NextResponse.json({ error: 'מספר הימים אינו תואם את הטווח שנבחר' }, { status: 400 })
  }

  const cookieStore = await cookies()
  if (!verifyRecoveryPortalToken(cookieStore.get(portalCookieName(home))?.value, home)) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // אבטחה: הרשומה שייכת לבית ההחלמה הזה, וסומן שהיולדת הגיעה
  const { data: aid } = await admin.from('maternity_aids')
    .select('id, recovery_home, recovery_arrived, recovery_receipt_url, recovery_locked, is_twins, recovery_eligibility_days, beneficiaries(family_name, full_name, spouse_name)')
    .eq('id', aidId).maybeSingle()
  if (!aid || aid.recovery_home !== home) {
    return NextResponse.json({ error: 'הרשומה לא נמצאה בבית החלמה זה' }, { status: 404 })
  }
  // מספר הלילות לא יעלה על ימי הזכאות (רגילה=2 · תאומים=4; או ערך שנקבע ידנית)
  const maxNights = aid.recovery_eligibility_days ?? (aid.is_twins ? 4 : 2)
  if (nightsNum > maxNights) {
    return NextResponse.json({ error: `מספר הלילות המרבי הוא ${maxNights}` }, { status: 400 })
  }
  if (aid.recovery_locked) {
    return NextResponse.json({ error: 'הרשומה נעולה — פנה למשרד' }, { status: 403 })
  }
  if (aid.recovery_arrived !== true) {
    return NextResponse.json({ error: 'יש לסמן "הגיעה" לפני הזנת הסכום' }, { status: 400 })
  }
  // קבלה חובה — או קובץ שהועלה (recovery_receipt_url ב-DB) או קישור ישיר שנשלח כעת.
  const finalReceiptUrl = aid.recovery_receipt_url || linkUrl
  if (!finalReceiptUrl) {
    return NextResponse.json({ error: 'יש לצרף קובץ קבלה (העלאה או קישור ישיר)' }, { status: 400 })
  }

  const { error } = await admin.from('maternity_aids').update({
    recovery_amount: amt,
    recovery_nights: nightsNum,
    recovery_stay_from: from,
    recovery_stay_to: to,
    // ⚠️ נכתב רק כשנשלח ערך. כתיבה של '' הייתה מוחקת מספר קבלה שכבר קיים
    // ברשומות שנקלטו לפני שהשדה הוסר מהטופס.
    ...(receipt ? { recovery_receipt_number: receipt } : {}),
    // שמירת הקישור הישיר אם הוזן (כשלא הועלה קובץ פיזי)
    recovery_receipt_url: finalReceiptUrl,
    recovery_amount_status: 'executed', // בית ההחלמה מסמן ביצוע — אין צורך באישור נוסף
    recovery_amount_at: new Date().toISOString(),
    recovery_locked: true, // נעילה מיידית — עריכה חוזרת רק לאחר פתיחת המשרד
    updated_at: new Date().toISOString(),
  }).eq('id', aidId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // מייל התראה על מימוש זכאות — הודעה תפעולית פנימית.
  // נשלחת אך ורק לתיבת מחלקת יולדות, ולעולם לא ליולדת עצמה.
  try {
    const ben = Array.isArray(aid.beneficiaries) ? aid.beneficiaries[0] : aid.beneficiaries
    const motherName = ben
      ? [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || '—'
      : '—'
    const mail = recoveryRealizedEmail({ home, motherName, amount: amt, nights: nightsNum, receipt })
    const dept = mailFor('maternity')
    await deliverMail(dept.fromEmail, mail.subject, mail.html, undefined, dept)
  } catch { /* כשל מייל לא חוסם */ }

  return NextResponse.json({ ok: true })
}
