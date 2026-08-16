import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from './sendMail'
import { mailFor, DEPARTMENTS, type DepartmentKey } from './departments'
import { shell } from './emailTemplates'
import { shouldSkipAutoReply, isAutoSubmittedMail } from './maintenanceReply'
import { getAutoReplyConfig, buildAutoReplyBody, type AutoReplySettings } from './autoReplyConfig'

// ─────────────────────────────────────────────────────────────────────────────
// שליחת המענה האוטומטי — נקודת הכניסה היחידה.
//
// מחליפה את maybeAutoReplyYerid / maybeAutoReplyInbox8 / maybeAutoReplyGemach /
// maybeAutoReplyIgud / maybeSendMaintenanceReply. מכיוון שיש כאן מנגנון אחד
// בלבד, autoReplyRouting.ts (שהחליט מי מקבל את הגנרי ומי לא) מיותר: אין יותר
// שני מענים שיכולים לרוץ על אותו מייל, ולכן גם לא הבאג שבו הגנרי אכל את
// מכסת המענים של הייעודי.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 בולם הלולאה האחרון — זהה ל-underAutoReplyCap, אך עם מכסה לכל אגף.
 *
 * נכשל-סגור: אם השאילתה נכשלה איננו יודעים כמה מענים כבר יצאו, ואז שתיקה
 * עדיפה על לולאה.
 */
async function underCap(db: SupabaseClient, email: string, cap: number): Promise<boolean> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await db
    .from('auto_reply_log')
    .select('id', { count: 'exact', head: true })
    .eq('to_email', email)
    .gte('created_at', weekAgo)

  if (error) {
    console.error(`[auto-reply] 🔴 בדיקת התקרה נכשלה (${error.message}) — לא נשלח מענה ל-${email}`)
    return false
  }
  if ((count ?? 0) >= cap) {
    console.warn(`[auto-reply] 🔴 תקרת מענים ל-${email} — נחסם (${count} מתוך ${cap} בשבוע)`)
    return false
  }
  return true
}

/** בונה את המייל המלא בעיצוב האחיד, עם צבע האגף. */
export function renderAutoReply(dept: DepartmentKey, settings: AutoReplySettings) {
  const d = DEPARTMENTS[dept] ?? DEPARTMENTS.main
  return {
    subject: settings.subject,
    html: shell({
      preheader: settings.message.replace(/\s+/g, ' ').slice(0, 90),
      accent: d.color,
      title: 'פנייתכם התקבלה',
      subtitle: `היכל החתם סופר · ${d.label}`,
      body: buildAutoReplyBody(settings, d.color),
    }),
  }
}

/**
 * שולח מענה אוטומטי לתיבה שאליה הגיע המייל, אם מופעל בהגדרות.
 * מחזיר true אם נשלח בפועל.
 *
 * ⚠️ המענה נשלח לכל פונה, בלי קשר לתוכן המייל ובלי בדיקה אם השולח רשום.
 * ⚠️ כל דילוג נרשם עם סיבתו: כשהמענה נדם בעבר, השתיקה הייתה מוחלטת ואף
 * לוג לא אמר מדוע — האבחון דרש קריאת קוד במקום קריאת לוג.
 */
export async function sendAutoReply(
  db: SupabaseClient,
  opts: {
    fromEmail: string
    department?: DepartmentKey | null
    headers?: unknown
    /**
     * ⚠️ אינו משמש לנעילה, ובמכוון: dual-delivery מייצר שני עותקים עם
     * message_id שונה, ולכן הוא אינו מזהה אמין של "אותה הודעה". נשמר
     * בחתימה לצורכי אבחון בלבד.
     */
    messageId?: string
  },
): Promise<boolean> {
  try {
    const dept = (opts.department ?? 'main') as DepartmentKey
    if (!DEPARTMENTS[dept]) return false

    const config = await getAutoReplyConfig(db)
    const settings = config[dept]
    if (!settings?.enabled) return false
    if (!settings.message.trim()) {
      console.warn(`[auto-reply] ${dept} מופעל אך הנוסח ריק — לא נשלח`)
      return false
    }

    const from = (opts.fromEmail ?? '').toLowerCase().trim()
    if (!from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return false

    // ── שלוש שכבות ההגנה, לפי סדר עלות ──
    if (shouldSkipAutoReply(from)) {
      console.log(`[auto-reply] דילוג (${dept}): דפוס כתובת חסומה — ${from}`)
      return false
    }
    if (isAutoSubmittedMail(opts.headers)) {
      console.log(`[auto-reply] דילוג (${dept}): המייל מצהיר שהוא אוטומטי — ${from}`)
      return false
    }

    // 🔴 נעילה לפי *שולח + תיבה*, ובמכוון לא לפי messageId.
    //
    // ⚠️ הבאג שזה מתקן: Google dual-delivery מייצר **שני עותקים נפרדים
    // של אותו מייל, כל אחד עם message_id משלו**. נעילה לפי messageId לא
    // זיהתה אותם כאותה הודעה, והפונה קיבל את אותו מענה פעמיים בהפרש
    // שניות. שתי קליטות בלוג ("נקלטו 3" ואז "נקלטו 1") הן אותו מייל.
    //
    // ⚠️ התיבה נשארת במפתח: מייל שהופנה גם ל-office וגם ל-igud אמור
    // לקבל מענה משתיהן, ולכן הן אינן חוסמות זו את זו.
    //
    // ⚠️ המחיר: פונה ששולח שני מיילים *שונים* לאותה תיבה תוך 10 דקות
    // יקבל מענה אחד בלבד. זה מקובל — המענה גנרי וזהה בשני המקרים, ומענה
    // כפול מרעיש הרבה יותר ממענה שהושהה.
    const lockKey = `auto_reply:${dept}:${from}`.slice(0, 200)
    const LOCK_TTL_MS = 10 * 60 * 1000
    const nowMs = Date.now()
    const { data: prevLock } = await db.from('app_settings').select('value').eq('key', lockKey).maybeSingle()
    const prevAt = prevLock?.value ? Date.parse(String(prevLock.value)) : NaN
    if (!isNaN(prevAt) && (nowMs - prevAt) < LOCK_TTL_MS) {
      console.log(`[auto-reply] דילוג (${dept}): כבר נענה על ההודעה הזו — ${from}`)
      return false
    }
    await db.from('app_settings').upsert(
      { key: lockKey, value: new Date(nowMs).toISOString(), updated_at: new Date(nowMs).toISOString() },
      { onConflict: 'key' },
    )

    if (!(await underCap(db, from, settings.weeklyCap))) {
      console.log(`[auto-reply] דילוג (${dept}): תקרת מענים שבועית — ${from}`)
      return false
    }

    const mail = renderAutoReply(dept, settings)
    const res = await deliverMail(from, mail.subject, mail.html, undefined, {
      ...mailFor(dept),
      tracking: false,
      skipLog: true,
      // 🔴 לא דרך מאגר Gmail — המענה חייב לצאת מכתובת האגף.
      //
      // ⚠️ Gmail מכבד כתובת "מאת" רק אם היא רשומה בחשבון כאליאס מאומת,
      // ואחרת מחליף אותה בשקט בכתובת החשבון עצמו. התוצאה: מי ששלח
      // ל-office@ קיבל תשובה מ-code@chasamsofer.info — חשבון השליחה
      // הטכני — וזה נראה כמו מייל זר ולא כמענה של האגף שאליו פנה.
      //
      // ⚠️ הניתוב ל-Gmail נועד לעקוף חסימת קצב בשליחות המוניות (קודי
      // אימות). המענה האוטומטי הוא מייל בודד לפונה יחיד, ולכן אין לו
      // מה להרוויח שם — ויש לו מה להפסיד: את זהות השולח.
      gmailPriority: 'never',
    })
    if (!res.ok) {
      console.error(`[auto-reply] שליחה נכשלה (${dept}):`, res.error)
      return false
    }

    // ⚠️ נרשם *אחרי* שליחה מוצלחת בלבד: רישום מראש היה סופר גם ניסיונות
    // שנכשלו, וחוסם כתובת לגיטימית שמעולם לא קיבלה מענה.
    await db.from('auto_reply_log').insert({ to_email: from, subject: mail.subject })
      .then(undefined, () => { /* הלוג אינו חוסם את המענה עצמו */ })
    console.log(`[auto-reply] נשלח מענה (${dept}) אל ${from}`)
    return true
  } catch (e) {
    console.error('[auto-reply] threw:', e)
    return false
  }
}
