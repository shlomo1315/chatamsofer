import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { tokenMatches, decodePush, isStaleNotification } from '@/lib/gmailPushVerify'
import { syncAccount } from '@/lib/gmailIndexSync'

export const dynamic = 'force-dynamic'
// ⚠️ ההתראה מפעילה סנכרון מצטבר. הוא קצר, אבל לא מיידי — וברירת המחדל
// עלולה לקטוע אותו באמצע.
export const maxDuration = 120

// ─────────────────────────────────────────────────────────────────────────────
// Gmail Push — ההתראה שהופכת את הסנכרון למיידי.
//
// 🔴 בלי הנתיב הזה המערכת מסתנכרנת רק כשמישהו לוחץ. איתו — גוגל דוחף התראה
// בשנייה שמייל נכנס, נקרא, או נמחק, והמערכת מגיבה מיד.
//
// ⚠️ 🔴 הכתובת ציבורית. כל מי שמנחש אותה יכול לשגר התראות מזויפות ולגרום
// לשריפת מכסת ה-API של Gmail בסנכרונים אינסופיים. לכן: טוקן סודי בכתובת,
// והוא נבדק *ראשון* — לפני כל פענוח, ולפני כל נגיעה במסד.
//
// ⚠️ 🔴 והכלל שקובע את כל טיפול השגיאות כאן: **תמיד מחזירים 200.**
// Pub/Sub מפרש כל תשובה אחרת כ"לא נמסר" וחוזר שוב ושוב במשך ימים. הודעה
// פגומה שנדחית ב-200 נעלמת; הודעה פגומה שמחזירה 500 חוזרת אלינו אלפי
// פעמים ומייצרת תקלה גדולה מזו שניסינו לדווח עליה.
// ─────────────────────────────────────────────────────────────────────────────

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** תשובת "התקבל, אל תנסה שוב". */
const ack = (note: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: true, note, ...extra })

export async function POST(request: NextRequest) {
  // ── 1. אימות, לפני הכל ──
  const token = request.nextUrl.searchParams.get('token')
  if (!tokenMatches(token, process.env.GMAIL_PUSH_TOKEN)) {
    // ⚠️ 401 ולא 200: זו אינה התראה תקינה מגוגל אלא בקשה זרה, ואין סיבה
    // לאשר אותה. גוגל עצמו לעולם לא יגיע לכאן בלי הטוקן.
    //
    // ⚠️ אבחון בלי לחשוף את הסוד: מדווחים *אורך* ותו ראשון/אחרון בלבד.
    // בלי זה אי אפשר להבחין בין "לא הוגדר", "נשלח ריק" ו"נשלח שונה" —
    // וכל אחד מהם דורש תיקון אחר לגמרי. הסוד עצמו לעולם אינו נכתב ללוג.
    const got = String(token ?? '')
    const want = String(process.env.GMAIL_PUSH_TOKEN ?? '')
    const peek = (s: string) => s.length < 4 ? `(${s.length} תווים)` : `${s.slice(0, 2)}…${s.slice(-2)} (${s.length} תווים)`
    console.warn(
      `[gmail-push] טוקן לא תואם · התקבל: ${got ? peek(got) : 'ריק/חסר'} · מוגדר בשרת: ${want ? peek(want) : '🔴 לא הוגדר כלל'}`,
    )
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const envelope = await request.json().catch(() => null)
  const payload = decodePush(envelope)
  if (!payload) return ack('מעטפה לא תקינה — נזרקה')

  const db = admin()
  if (!db) {
    // ⚠️ כאן דווקא כן 500: זו תקלה אצלנו, וההתראה *כן* צריכה לחזור אחרי
    // שהמערכת תתאושש — אחרת המייל הזה לא ייקלט לעולם.
    console.error('[gmail-push] אין חיבור למסד')
    return NextResponse.json({ error: 'db unavailable' }, { status: 500 })
  }

  // ── 2. איתור החשבון ──
  const { data } = await db.from('gmail_accounts')
    .select('id, email, refresh_token, last_history_id, last_push_history_id')
    .ilike('email', payload.emailAddress)
    .eq('is_active', true)
    .maybeSingle()

  const account = data as {
    id: string; email: string; refresh_token: string
    last_history_id: string | null; last_push_history_id: string | null
  } | null

  // ⚠️ חשבון שאינו אצלנו אינו שגיאה — ייתכן שהוסר או הושבת. מאשרים כדי
  // שגוגל יפסיק לנסות.
  if (!account) return ack(`חשבון לא מוכר: ${payload.emailAddress}`)

  // ── 3. כפילות ──
  // 🔴 Pub/Sub מוסר *לפחות* פעם אחת. בלי הבדיקה הזו כל מסירה חוזרת מפעילה
  // סנכרון מלא ושורפת מכסה.
  if (isStaleNotification(payload.historyId, account.last_push_history_id)) {
    return ack('התראה כפולה או ישנה — דולגה', { historyId: payload.historyId })
  }

  // ⚠️ הסימון נכתב *לפני* הסנכרון. שתי התראות שמגיעות יחד (מייל שנכנס
  // ומיד נקרא) היו מפעילות שני סנכרונים מקבילים על אותו חשבון, ושניהם
  // כותבים את אותן שורות.
  await db.from('gmail_accounts')
    .update({ last_push_history_id: payload.historyId })
    .eq('id', account.id)

  // ── 4. הסנכרון עצמו ──
  try {
    const res = await syncAccount(db, account)
    console.log(`[gmail-push] ${account.email}: ${res.mode} · נקלטו ${res.upserted} · תוויות ${res.touched} · הוסרו ${res.removed}`)
    return ack('סונכרן', { mode: res.mode, upserted: res.upserted, touched: res.touched })
  } catch (e) {
    // ⚠️ 200 גם בכישלון סנכרון, ובכוונה: ההתראה הבאה (או סנכרון ידני)
    // תמשיך מאותו סמן ותשלים את מה שהוחמץ — הסמן מתקדם רק בהצלחה. חזרה
    // אינסופית של אותה התראה לא הייתה מוסיפה דבר מלבד עומס.
    console.error('[gmail-push] סנכרון נכשל:', e instanceof Error ? e.message : e)
    return ack('הסנכרון נכשל — יושלם בהתראה הבאה')
  }
}

// ⚠️ גוגל שולח GET אימות חד-פעמי כשמגדירים subscription מסוג push.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'gmail-push' })
}
