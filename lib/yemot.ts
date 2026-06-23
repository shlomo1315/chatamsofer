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
