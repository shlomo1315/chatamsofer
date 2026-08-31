// ─────────────────────────────────────────────────────────────────────────────
// יצירת שלוחות בימות אוטומטית.
//
// 🔴 עד כה המנהל היה צריך להיכנס לימות ולהגדיר שם כל שלוחה בעצמו —
// ואז לא הרווחנו דבר מהמסך שלנו. ext.ini הוא קובץ ההגדרות של שלוחה
// בימות, והעלאתו דרך UploadFile **יוצרת את השלוחה בפועל**.
//
// ⚠️ קובץ שגוי אינו נכשל ברעש: הוא יוצר שלוחה שמשמיעה שקט, וזו תקלה
// שמתגלה רק מתלונה של מתקשר. לכן כל ערך מסונן לפני שהוא נכתב.
//
// ⚠️ מקור: התיעוד הרשמי של ימות (f2.freeivr.co.il/topic/55).
//   POST https://www.call2all.co.il/ym/api/UploadFile
//   token, path=ivr2:/7/ext.ini, file=<תוכן>
// ─────────────────────────────────────────────────────────────────────────────

/**
 * הנתיב של ext.ini לשלוחה.
 *
 * 🔴 null על נתיב פסול: העלאת קובץ למקום לא ידוע יכולה לדרוס הגדרה
 * קיימת של שלוחה אחרת. הסינון הוא רשימת היתר — ספרות ולוכסנים בלבד.
 */
export function extIniPath(folder: string | null | undefined): string | null {
  const raw = String(folder ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!raw) return null
  // ⚠️ ספרות ולוכסנים בלבד: כל דבר אחר (נקודות, רווחים, תווים עבריים)
  // אינו שם שלוחה חוקי בימות, ו-".." היה יוצא מהתיקייה.
  if (!/^\d+(\/\d+)*$/.test(raw)) return null
  return `ivr2:/${raw}/ext.ini`
}

/** ⚠️ שם הפרמטר בימות — אותיות לטיניות וקו תחתון בלבד. */
const VALID_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export interface ExtIniInput {
  /** ערך ה-type בימות (voice_mail, zmanim…). */
  type: string
  /** פרמטרים נוספים לפי הסוג. */
  extra?: Record<string, string | number | null | undefined>
}

/**
 * תוכן ext.ini.
 *
 * ⚠️ ערך ריק **מדולג** ואינו נכתב כשורה ריקה: ימות מפרשת "key=" כערך
 * ריק מפורש, מה שעלול לדרוס ברירת מחדל תקינה.
 *
 * 🔴 שורה חדשה בתוך ערך נחסמת — היא הייתה מזריקה הגדרה נוספת לקובץ,
 * למשל להפוך שלוחה רגילה לכניסת ניהול.
 */
export function buildExtIni(input: ExtIniInput): string {
  const type = String(input.type ?? '').trim()
  // ⚠️ סוג פסול → קובץ ריק ולא קובץ שבור: העלאת קובץ שבור יוצרת
  // שלוחה מקולקלת, בעוד מחרוזת ריקה נעצרת אצל הקורא.
  if (!VALID_KEY.test(type)) return ''

  const lines = [`type=${type}`]

  for (const [k, v] of Object.entries(input.extra ?? {})) {
    if (!VALID_KEY.test(k)) continue
    const val = String(v ?? '').trim()
    if (!val) continue
    // 🔴 ההזרקה: שורה חדשה בערך = הגדרה נוספת בקובץ.
    if (/[\n\r]/.test(val)) continue
    lines.push(`${k}=${val}`)
  }

  // ⚠️ שורה חדשה בסוף — ימות מצפה לכך.
  return lines.join('\n') + '\n'
}
