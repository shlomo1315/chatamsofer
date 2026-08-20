// ─────────────────────────────────────────────────────────────────────────────
// חידוש אוטומטי של מנוי ה-push של Gmail.
//
// 🔴 הבעיה שזה פותר: מנוי ה-watch של Gmail פג אחרי **7 ימים בדיוק**. גוגל
// אינו מתריע, אינו מנסה שוב, ואינו מחזיר שגיאה — הדחיפות פשוט מפסיקות.
// התוצאה: הסנכרון המיידי נדם בשקט שבוע אחרי ההפעלה, המסך המשיך להציג
// "מופעל", ואיש לא ידע עד שמישהו הבחין שמייל לא הגיע.
//
// זה בדיוק מה שקרה: המנוי הופעל ידנית, פג כעבור שבוע, ולא היה שום מנגנון
// שיחדש אותו. לחיצה על "הפעל סנכרון מיידי" עבדה — אבל רק עד לפקיעה הבאה.
//
// ⚠️ החידוש רץ כשנותרו פחות מ-3 ימים ולא ביום הפקיעה: אם החידוש נכשל
// (תקלת רשת, טוקן שפג), נשארים עוד שני ימים של נסיונות לפני שהסנכרון
// באמת נופל. חידוש ברגע האחרון לא משאיר מרווח לכישלון.
//
// ⚠️ קריאה חוזרת ל-users.watch בטוחה לחלוטין — היא מאריכה מנוי קיים
// ואינה יוצרת כפילות. לכן אפשר להריץ את זה כל שעה בלי חשש.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { getGmailClientForToken } from './gmail'

/** חלון החידוש — מחדשים כשנותרו פחות מכך עד הפקיעה. */
const RENEW_BEFORE_MS = 3 * 24 * 60 * 60 * 1000

/**
 * גרסת הגדרת המנוי. מעלים אותה בכל שינוי ב-labelIds.
 *
 * 🔴 בלי זה, שינוי בהגדרה נכנס לתוקף רק בפקיעה הבאה — עד שבוע שלם שבו
 * המנוי הישן ממשיך לרוץ עם ההגדרה הישנה, ואיש אינו יודע.
 *
 * ⚠️ v2 = הוספת SENT. קודם המנוי היה על INBOX בלבד, ולכן מייל *יוצא*
 * לא הפעיל Push כלל ולא הופיע במערכת עד סנכרון ידני.
 */
export const WATCH_CONFIG_VERSION = 'v2-inbox-sent'

export interface RenewResult {
  checked: number
  renewed: number
  failed: number
  details: { email: string; ok: boolean; expiresAt?: string | null; error?: string }[]
}

/**
 * מחדש כל מנוי שעומד לפוג. מחזיר סיכום.
 *
 * ⚠️ לא זורק לעולם: הוא רץ מתוך scheduler, וכשל בחשבון אחד לא אמור
 * להפיל את החידוש של השאר.
 */
export async function renewExpiringWatches(db: SupabaseClient): Promise<RenewResult> {
  const out: RenewResult = { checked: 0, renewed: 0, failed: 0, details: [] }

  const topic = process.env.GMAIL_PUBSUB_TOPIC
  if (!topic) {
    console.warn('[gmail-watch-renew] GMAIL_PUBSUB_TOPIC אינו מוגדר — דילוג')
    return out
  }

  const { data, error } = await db
    .from('gmail_accounts')
    .select('id, email, refresh_token, watch_expires_at, watch_config_version')
    .eq('is_active', true)

  if (error) {
    console.error('[gmail-watch-renew] שליפת החשבונות נכשלה:', error.message)
    return out
  }

  const accounts = (data ?? []) as {
    id: string; email: string; refresh_token: string; watch_expires_at: string | null
    watch_config_version: string | null
  }[]

  const now = Date.now()

  for (const acc of accounts) {
    // ⚠️ חשבון בלי תאריך פקיעה נחשב "צריך חידוש": או שהמנוי מעולם לא
    // הופעל, או שהוא נעצר. בשני המקרים הפעלה מחדש היא הפעולה הנכונה.
    const expMs = acc.watch_expires_at ? new Date(acc.watch_expires_at).getTime() : 0
    // 🔴 גם כשההגדרה השתנתה — לא רק כשקרובה הפקיעה.
    //
    // ⚠️ בלי הבדיקה הזו, הוספת SENT ל-labelIds הייתה נכנסת לתוקף רק
    // בפקיעה הבאה: עד שבוע שלם שבו המנוי הישן ממשיך לרוץ, מייל יוצא
    // אינו מסונכרן, והמשתמש נדרש לכבות ולהפעיל ידנית.
    const staleConfig = acc.watch_config_version !== WATCH_CONFIG_VERSION
    const needsRenew = !expMs || (expMs - now) < RENEW_BEFORE_MS || staleConfig
    if (!needsRenew) continue
    if (staleConfig) {
      console.log(`[gmail-watch-renew] ${acc.email}: הגדרה ישנה (${acc.watch_config_version ?? 'ללא'}) — חידוש מיידי`)
    }

    out.checked++
    try {
      const gmail = getGmailClientForToken(acc.refresh_token)
      const res = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          // ⚠️ זהה בדיוק להפעלה הידנית (app/api/admin/gmail/watch): מנוי
          // שמוגדר אחרת בחידוש היה משנה בשקט אילו הודעות נדחפות.
          //
          //
          // 🔴 SENT חובה לצד INBOX. קודם היה INBOX בלבד, כלומר Google דחף
          // התראה *רק* על דואר נכנס — מייל יוצא לא הפעיל Push ולא הופיע
          // במערכת עד סנכרון ידני. תיבה שלמה נשארה עם 0 הודעות "נשלחו".
          topicName: topic,
          labelIds: ['INBOX', 'SENT'],
          labelFilterBehavior: 'INCLUDE',
        },
      })

      const expNum = res.data?.expiration ? Number(res.data.expiration) : null
      const expiresAt = expNum && Number.isFinite(expNum)
        ? new Date(expNum).toISOString()
        : null

      await db.from('gmail_accounts').update({
        watch_started_at: new Date().toISOString(),
        watch_expires_at: expiresAt,
        // ⚠️ נשמר רק אחרי חידוש שהצליח: אילו נשמר מראש, כישלון היה
        // מסמן את ההגדרה כעדכנית והחידוש לא היה חוזר.
        watch_config_version: WATCH_CONFIG_VERSION,
        // ⚠️ last_history_id *אינו* מתעדכן כאן, בניגוד להפעלה הידנית:
        // בחידוש יש כבר סמן היסטוריה תקין, ודריסתו הייתה מדלגת על כל
        // ההודעות שהגיעו מאז הסנכרון האחרון.
        last_error: null,
      }).eq('id', acc.id)

      out.renewed++
      out.details.push({ email: acc.email, ok: true, expiresAt })
      console.log(`[gmail-watch-renew] חודש: ${acc.email} · פג ב-${expiresAt ?? 'לא ידוע'}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      out.failed++
      out.details.push({ email: acc.email, ok: false, error: msg })
      console.error(`[gmail-watch-renew] 🔴 חידוש נכשל: ${acc.email}:`, msg)
      // הכשל נרשם על החשבון כדי שיופיע במסך ולא רק בלוגים.
      await db.from('gmail_accounts')
        .update({ last_error: `חידוש הסנכרון המיידי נכשל: ${msg}` })
        .eq('id', acc.id)
        .then(undefined, () => {})
    }
  }

  return out
}
