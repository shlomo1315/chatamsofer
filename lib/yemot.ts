// העלאת קבצים לימות המשיח (call2all) מצד השרת. דורש משתנה הסביבה YEMOT_TOKEN.
// משמש להעלאת הקלטות אנושיות שיושמעו בשלוחת ה-API במקום קול ממוחשב (TTS).
const YEMOT_API = 'https://www.call2all.co.il/ym/api'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 חשבון ימות נפרד לכל מחלקה.
//
// ⚠️ זה מה שהפיל את שלוחת היריד ליום שלם: כל ההעלאות עברו בטוקן אחד
// (YEMOT_TOKEN), ולכן הקבצים של היריד נחתו בחשבון של החגים. ה-API
// דיווח שהם קיימים ותקינים — ומבחינתו הם היו — אבל השיחה של היריד
// רצה בחשבון אחר לגמרי ולא מצאה אותם.
//
// התסמין היה מטעה לחלוטין: `f-` נכשל ב-100% ו-`t-` עבד ב-100%, מה
// שנראה כמו בעיית פורמט או מבנה. זה היה נתיב.
//
// ⚠️ נפילה-לאחור ל-YEMOT_TOKEN: בלעדיה, הוספת המשתנה החדש הייתה
// שוברת את החגים והיולדות שעובדות היום.
// ─────────────────────────────────────────────────────────────────────────────
export type YemotScope = 'bookFair' | 'default'

export function yemotToken(scope: YemotScope = 'default'): string | undefined {
  if (scope === 'bookFair') {
    const t = process.env.YEMOT_BOOK_FAIR_TOKEN
    if (t && t.trim()) return t.trim()
  }
  return process.env.YEMOT_TOKEN
}

export function yemotConfigured(scope: YemotScope = 'default'): boolean {
  return !!yemotToken(scope)
}

// העלאת קובץ (UploadFile, multipart). יוצר את התיקייה במידת הצורך וממיר אודיו לפורמט של ימות.
// path לדוגמה: 'ivr2:/7/rec_ask_card.wav'. מחזיר את הנתיב שנשמר בימות.
export async function uploadFileToYemot(
  path: string,
  file: Blob,
  filename: string,
  scope: YemotScope = 'default',
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const token = yemotToken(scope)
  if (!token) return { ok: false, error: 'YEMOT_TOKEN אינו מוגדר בשרת' }

  const form = new FormData()
  form.set('token', token)
  form.set('path', path)
  form.set('convertAudio', '1') // המרת אודיו לפורמט הניגון של ימות
  form.set('file', file, filename)

  try {
    const res = await fetch(`${YEMOT_API}/UploadFile`, { method: 'POST', body: form })
    const json = await res.json().catch(() => null)
    if (!json || json.responseStatus !== 'OK') {
      return { ok: false, error: json ? JSON.stringify(json) : `HTTP ${res.status}` }
    }
    return { ok: true, path: String(json.path ?? path) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// הורדת קובץ מימות — להאזנה להקלטות שהשאירו מתקשרים.
//
// 🔴 דרך השרת ולא קישור ישיר לדפדפן: הכתובת של ימות דורשת את ה-token,
// וקישור שכולל אותו היה חושף את מפתח המערכת בכל דף שמציג הקלטה.
//
// ⚠️ ימות מחזירה JSON עם שגיאה (ולא קוד HTTP) כשהקובץ אינו קיים —
// לכן נבדק סוג התוכן ולא רק הסטטוס. בלי זה היינו מחזירים "אודיו"
// שהוא בעצם הודעת שגיאה, והנגן היה נשבר בלי הסבר.
// ─────────────────────────────────────────────────────────────────────────────
export async function downloadFileFromYemot(
  path: string,
  scope: YemotScope = 'default',
): Promise<{ ok: boolean; data?: ArrayBuffer; contentType?: string; error?: string }> {
  const token = yemotToken(scope)
  if (!token) return { ok: false, error: 'YEMOT_TOKEN אינו מוגדר בשרת' }

  try {
    const url = `${YEMOT_API}/DownloadFile?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }

    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      const j = await res.json().catch(() => null)
      return { ok: false, error: j ? JSON.stringify(j) : 'הקובץ לא נמצא' }
    }

    const data = await res.arrayBuffer()
    if (!data.byteLength) return { ok: false, error: 'הקובץ ריק' }
    return { ok: true, data, contentType: ct || 'audio/wav' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// מחיקת קובץ מימות.
//
// 🔴 למה זה נדרש: שמות הקבצים כוללים חותמת זמן (כדי לעקוף את מטמון
// ימות — ראו generate-voice), ולכן כל יצירה מחדש משאירה את הקובץ הקודם
// בתיקייה. בלי ניקוי, תיקיית השלוחה מתמלאת בעשרות הקלטות נטושות ואי
// אפשר לדעת איזו מהן פעילה.
//
// ⚠️ כישלון מחיקה *אינו* מפיל את הפעולה: הקובץ החדש כבר הועלה ונשמר,
// והשיחה תשמיע אותו כראוי. קובץ יתום הוא אי-נוחות, לא תקלה.
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteFileFromYemot(
  path: string,
  scope: YemotScope = 'default',
): Promise<{ ok: boolean; error?: string }> {
  const token = yemotToken(scope)
  if (!token) return { ok: false, error: 'YEMOT_TOKEN אינו מוגדר בשרת' }

  try {
    const url = `${YEMOT_API}/FileAction?token=${encodeURIComponent(token)}`
      + `&action=delete&path=${encodeURIComponent(path)}`
    const res = await fetch(url)
    const json = await res.json().catch(() => null)
    if (!json || json.responseStatus !== 'OK') {
      return { ok: false, error: json ? JSON.stringify(json) : `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// יצירת שלוחה בימות אוטומטית.
//
// 🔴 המנהל אינו נוגע בימות. הוא בוחר "תא קולי" במסך שלנו, ממלא כתובת
// מייל, ולוחץ שמור — והשלוחה נוצרת שם בפועל. אחרת לא הרווחנו דבר
// מהמסך: הגדרה ידנית בימות היא בדיוק מה שבאנו לחסוך.
//
// ⚠️ ext.ini הוא קובץ ההגדרות של שלוחה בימות. העלאתו *יוצרת או
// מעדכנת* את השלוחה — ולכן היא נשלחת בכל שמירה, וההגדרה כאן היא
// תמיד מקור האמת.
//
// ⚠️ convertAudio מושבת כאן: זהו קובץ טקסט, וההמרה הייתה פוגמת בו.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * יוצר/מעדכן שלוחה בימות.
 *
 * ⚠️ תוכן ריק אינו נשלח: הוא היה יוצר שלוחה ללא סוג, שמשמיעה שקט.
 */
export async function syncExtensionToYemot(
  path: string,
  iniContent: string,
  scope: YemotScope = 'default',
): Promise<{ ok: boolean; error?: string }> {
  const token = yemotToken(scope)
  if (!token) return { ok: false, error: 'YEMOT_TOKEN אינו מוגדר בשרת' }
  if (!iniContent.trim()) return { ok: false, error: 'הגדרת השלוחה ריקה' }

  const form = new FormData()
  form.set('token', token)
  form.set('path', path)
  // ⚠️ ללא convertAudio — זהו טקסט ולא אודיו.
  form.set('file', new Blob([iniContent], { type: 'text/plain' }), 'ext.ini')

  try {
    const res = await fetch(`${YEMOT_API}/UploadFile`, { method: 'POST', body: form })
    const json = await res.json().catch(() => null)
    if (!json || json.responseStatus !== 'OK') {
      return { ok: false, error: json ? JSON.stringify(json) : `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
