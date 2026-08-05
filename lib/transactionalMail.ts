import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'

// ─────────────────────────────────────────────────────────────────────────────
// שליחת מייל תפעולי (קוד אימות) בשני מסלולים, לפי הנמען.
//
// ⚠️ [תקלת מסירה 05/08/2026] Resend קיבל 100% מהשליחות בלי שגיאה אחת, אבל
// הודעות ל-@gmail.com נתקעו בסטטוס "Sent" ומעולם לא נמסרו. ההוכחה הייתה
// בלוח של Resend: באותה שנייה בדיוק, הודעה לדומיין שאינו ג'ימייל הגיעה
// ל-"Delivered". כלומר הדומיין תקין, ה-DNS תקין, ו-Resend תקין — Gmail
// לבדו מאט את כל הדואר מהדומיין אחרי קפיצת נפח חדה.
//
// לכן: נמעני Gmail יוצאים דרך חשבון ה-Google Workspace של הארגון (Gmail API),
// וכל השאר ממשיכים ב-Resend כרגיל.
//
// למה זה עובד דווקא כאן: הדומיין מחזיק MX של smtp.google.com, רשומת
// google._domainkey (DKIM), ו-SPF ראשי עם include:_spf.google.com. מייל
// שיוצא מהחשבון עובר אפוא SPF ו-DKIM מיושרים מול Gmail — מסירה גוגל→גוגל.
//
// ⚠️ ל-Workspace יש תקרה יומית (כ-2,000 נמענים חיצוניים). לכן:
//   • תקרה רכה נשמרת כאן, מתחת לתקרה האמיתית.
//   • *כל* כשל — תקרה, חשבון לא מחובר, שגיאת API — נופל אוטומטית ל-Resend.
// כלומר המסלול הזה יכול רק להוסיף מסירות, לעולם לא לגרוע.
//
// ⚠️ המסלול הזה נועד לנפח קטן. הוא נעשה אפשרי רק משהפך אימות המייל לרשות
// (מתג בהגדרות): במקום 8,000 מיילים ביום רישום המוני, האימות מתפזר על ימים.
// אם חובת האימות תוחזר לרישום, הנפח יחרוג מהתקרה ורובו יחזור ל-Resend.
// ─────────────────────────────────────────────────────────────────────────────

// תקרה רכה — מתחת לתקרה האמיתית של Workspace, כדי להשאיר מרווח למיילים
// תפעוליים אחרים שיוצאים מאותו חשבון (מענה אוטומטי, אישורים).
const GMAIL_DAILY_CAP = 1500

// כתובת ושם השולח של מיילים תפעוליים. ניתנים להגדרה בלי שינוי קוד, כדי
// שקודי האימות ייצאו מכתובת ייעודית שברור ממנה שאין להשיב אליה.
//
// ⚠️ במסלול Gmail זה עובד רק אם הכתובת מוגדרת בחשבון כ-"Send mail as"
// ומאומתת. אחרת Gmail מתעלם ושולח מהכתובת הראשית — בלי להיכשל ובלי להתריע.
const FROM_EMAIL = process.env.VERIFY_FROM_EMAIL || 'noreply@chasamsofer.info'
const FROM_NAME = process.env.VERIFY_FROM_NAME || 'היכל החתם סופר'

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

export function isGmailAddress(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  return GMAIL_DOMAINS.has(email.slice(at + 1).trim().toLowerCase())
}

// מפתח המונה היומי. התאריך לפי שעון ישראל, כדי שהאיפוס יקרה בחצות המקומית
// ולא באמצע יום העבודה.
function counterKey(): string {
  const d = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return `gmail_daily_send:${d}`
}

// קריאה והגדלה של המונה היומי. אינו אטומי — ובכוונה: התקרה כאן רכה, וחריגה
// קלה בתנאי מרוץ תיתקל ממילא בתקרה האמיתית של Google ותיפול חזרה ל-Resend.
async function bumpDailyCount(admin: SupabaseClient): Promise<number> {
  const key = counterKey()
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle()
  const current = Number(data?.value ?? 0) || 0
  const next = current + 1
  await admin.from('app_settings').upsert(
    { key, value: String(next), updated_at: new Date().toISOString() }, { onConflict: 'key' },
  )
  return next
}

export interface TransactionalResult { ok: boolean; via: 'gmail' | 'resend'; id?: string; error?: string }

/**
 * שליחת מייל תפעולי. מנסה Gmail לנמעני ג'ימייל, ונופל ל-Resend בכל מקרה אחר.
 * admin נדרש רק למונה היומי; בלעדיו המסלול מדלג ישר ל-Resend.
 */
export async function sendTransactionalMail(
  admin: SupabaseClient | null,
  to: string,
  subject: string,
  html: string,
): Promise<TransactionalResult> {
  if (admin && isGmailAddress(to)) {
    try {
      const count = await bumpDailyCount(admin)
      if (count <= GMAIL_DAILY_CAP) {
        // ייבוא דינמי — googleapis כבד, ואין סיבה לטעון אותו במסלול שאינו ג'ימייל.
        const { getGmailClient, sendGmailMessage } = await import('@/lib/gmail')
        const gmail = await getGmailClient()
        await sendGmailMessage(gmail, { to, subject, html, from: FROM_EMAIL, fromName: FROM_NAME })
        return { ok: true, via: 'gmail' }
      }
      console.warn(`[transactional-mail] תקרת Gmail היומית (${GMAIL_DAILY_CAP}) נוצלה — ממשיכים ב-Resend`)
    } catch (e) {
      // ⚠️ כשל כאן אינו סופי: ממשיכים ל-Resend. אסור שתקלה במסלול המהיר
      // תמנע שליחה שהייתה מצליחה במסלול הרגיל.
      console.error('[transactional-mail] שליחה דרך Gmail נכשלה, נופלים ל-Resend:', e)
    }
  }

  // ⚠️ אותה כתובת שולח בשני המסלולים. אחרת אותו נרשם היה מקבל קוד פעם
  // מכתובת אחת ופעם מאחרת, לפי ספק הדואר שלו — מבלבל, ופוגע באמון.
  // replyTo נשאר של המחלקה: מי שבכל זאת ישיב, יגיע לתיבה מאוישת ולא לחלל.
  const res = await deliverMail(to, subject, html, undefined, {
    ...mailFor('igud'), fromEmail: FROM_EMAIL, fromName: FROM_NAME,
    skipLog: true, transactional: true,
  })
  if (!res || !res.ok) return { ok: false, via: 'resend', error: res?.error }
  return { ok: true, via: 'resend', id: res.id }
}
