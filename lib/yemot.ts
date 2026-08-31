// העלאת קבצים לימות המשיח (call2all) מצד השרת. דורש משתנה הסביבה YEMOT_TOKEN.
// משמש להעלאת הקלטות אנושיות שיושמעו בשלוחת ה-API במקום קול ממוחשב (TTS).
const YEMOT_API = 'https://www.call2all.co.il/ym/api'

export function yemotConfigured(): boolean {
  return !!process.env.YEMOT_TOKEN
}

// העלאת קובץ (UploadFile, multipart). יוצר את התיקייה במידת הצורך וממיר אודיו לפורמט של ימות.
// path לדוגמה: 'ivr2:/7/rec_ask_card.wav'. מחזיר את הנתיב שנשמר בימות.
export async function uploadFileToYemot(
  path: string,
  file: Blob,
  filename: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const token = process.env.YEMOT_TOKEN
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
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.YEMOT_TOKEN
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
