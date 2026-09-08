// ─────────────────────────────────────────────────────────────────────────────
// מה שנשמע בטלפון על מוקד — מקור אמת יחיד.
//
// 🔴 המתקשר צריך לדעת *לאן ללכת ומתי*, לא רק את שם המוקד. הכתובת והשעות
// כבר מוגדרות בטבלת המוקדים והן מה שמופיע בשובר — וזה בדיוק מה שצריך
// להישמע בקו, מאותו מקור.
//
// ⚠️ הפונקציה הזו משמשת גם את השלוחה וגם את התצוגה למנהל ("כך זה יישמע"),
// כדי שמה שהמנהל בודק יהיה מה שהמתקשר שומע. שני מימושים נפרדים היו
// נפרדים זה מזה בשקט ברגע שאחד מהם משתנה.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpeakableCenter {
  city?: string | null
  name?: string | null
  address?: string | null
  hours?: string | null
}

/**
 * שם המוקד להקראה.
 *
 * ⚠️ פסיק ולא "·" (המפריד של centerLabel): המפריד הגרפי נועד למסך,
 * וב-TTS הוא נקרא כרעש או נבלע. פסיק מייצר הפסקה טבעית.
 *
 * ⚠️ עיר ששמה זהה לשם המוקד לא תיאמר פעמיים.
 */
export function spokenCenterName(c: SpeakableCenter | null | undefined): string {
  const city = (c?.city ?? '').trim()
  const name = (c?.name ?? '').trim()
  if (city && name && city !== name) return `${city}, ${name}`
  return name || city || ''
}

/**
 * המשפט המלא: היכן המוקד ומתי הוא פתוח.
 *
 * ⚠️ כל חלק נוסף רק אם הוא קיים. משפט עם חור באמצע ("הכתובת היא , השעות")
 * נשמע כתקלה, ומוקד בלי כתובת הוא מצב אמיתי במערכת.
 *
 * ⚠️ נקודות בין החלקים — הן ההפסקה שמאפשרת לרשום כתובת תוך כדי שמיעה.
 */
export function spokenCenterDetails(c: SpeakableCenter | null | undefined): string {
  const parts: string[] = []
  const nm = spokenCenterName(c)
  if (nm) parts.push(nm)

  const address = (c?.address ?? '').trim()
  if (address) parts.push(`הכתובת: ${address}`)

  const hours = (c?.hours ?? '').trim()
  if (hours) parts.push(`שעות הפתיחה: ${hours}`)

  return parts.join('. ')
}
