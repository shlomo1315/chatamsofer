import { getServiceClient } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// העברה הדרגתית של קודי האימות מ-Gmail ל-Resend.
//
// 🔴 למה בהדרגה ולא בבת אחת: קוד אימות הוא המייל הקריטי ביותר במערכת —
// בלעדיו אף אחד לא נכנס לפורטל, ואין מסלול עוקף. Gmail-to-Gmail כמעט תמיד
// נמסר; דומיין ב-Resend תלוי במוניטין שנבנה לאורך זמן. מעבר מלא שנכשל
// משבית את הכניסה לכולם בבת אחת, ובלי שום דרך לדעת שזה קרה עד שמתלוננים.
//
// עם אחוז מבוקר: אם המסירה יורדת, זה נראה על 10% מהמשתמשים ולא על כולם,
// ואפשר להחזיר לאחור בלחיצה.
//
// ⚠️ ההגרלה **דטרמיניסטית לפי כתובת המייל** ולא אקראית: אותו אדם מקבל
// תמיד את אותו ערוץ. הגרלה אקראית הייתה מקפיצה משתמש בין הערוצים בכל
// בקשה — ואז תלונה על "לפעמים מגיע ולפעמים לא" הופכת לבלתי ניתנת לשחזור.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'resend_otp_rollout'
const CACHE_MS = 60_000

export interface OtpRollout {
  /** אחוז קודי האימות שיישלחו דרך Resend (0–100). 0 = הכל דרך Gmail. */
  percent: number
}

const DEFAULT: OtpRollout = { percent: 0 }

let cache: { at: number; value: OtpRollout } | null = null

/**
 * ⚠️ מטמון של דקה: הנתיב הזה רץ בכל שליחת קוד אימות, ושאילתה למסד בכל
 * שליחה הייתה מוסיפה השהיה למייל שכל התהליך ממתין לו. דקה מספיקה כדי
 * ששינוי במסך ייכנס לתוקף כמעט מיד.
 */
export async function getOtpRollout(): Promise<OtpRollout> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value
  const db = getServiceClient()
  if (!db) return DEFAULT
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
    const raw = (data?.value ?? {}) as Partial<OtpRollout>
    const percent = Math.max(0, Math.min(100, Math.round(Number(raw.percent) || 0)))
    const value = { percent }
    cache = { at: Date.now(), value }
    return value
  } catch {
    // ⚠️ נפילה ל-0 (כלומר Gmail): תקלה בקריאת ההגדרה לא אמורה להסיט
    // קודי אימות לערוץ שטרם הוכח.
    return DEFAULT
  }
}

export function clearOtpRolloutCache() { cache = null }

/**
 * גיבוב יציב של כתובת מייל למספר 0–99.
 *
 * ⚠️ FNV-1a ולא Math.random: אותה כתובת חייבת ליפול תמיד באותו צד, אחרת
 * המשתמש קופץ בין הערוצים ואי אפשר לשחזר תקלה.
 */
function bucketOf(email: string): number {
  const s = email.trim().toLowerCase()
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % 100
}

/**
 * האם קוד האימות לכתובת הזו יוצא דרך Resend.
 *
 * ⚠️ percent=0 מחזיר false תמיד, ו-100 מחזיר true תמיד — בלי תלות בגיבוב.
 */
export async function otpViaResend(email: string): Promise<boolean> {
  const { percent } = await getOtpRollout()
  if (percent <= 0) return false
  if (percent >= 100) return true
  return bucketOf(email) < percent
}
