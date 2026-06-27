// שיחה יוצאת דרך ימות המשיח — מקריאה למתקשר קוד כניסה חד-פעמי (TTS inline).
// מודול צד-שרת בלבד.
//
// ⚠️ בטיחות: השיחה מתבצעת אך ורק כשמוגדר YEMOT_OTP_CALLER_ID (מספר ה-DID של המערכת).
// כל עוד המשתנה לא מוגדר — yemotCallConfigured() מחזיר false ו-placeCodeCall לא יוצר שום שיחה.
// כך הפיצ'ר רדום עד שמפעילים אותו במכוון.
//
// מנגנון: SendTTS של call2all — שיחה יוצאת יחידה שמקריאה טקסט (ttsMessage) ישירות
// לשיחה שנענתה. בניגוד ל-RunCampaign (שמשמיע *תבנית* קבועה, ולכן ניתב את השיחה
// למערכת הראשית/שלוחה 7 במקום להקריא את הקוד) — SendTTS מקריא את הטקסט שנשלח לו,
// ולכן מתאים לקוד דינמי שונה בכל שיחה. פרמטרים: token, phones, callerId, ttsMessage.

const YEMOT_API = 'https://www.call2all.co.il/ym/api'

export function yemotCallConfigured(): boolean {
  return !!process.env.YEMOT_TOKEN && !!process.env.YEMOT_OTP_CALLER_ID
}

// טקסט בטוח להקראה. פסיקים נשמרים (הם יוצרים הפסקות בין הספרות); רק תווים
// שעלולים לשבש את הפרמטר/ההקראה מוסרים.
function ttsSafe(text: string): string {
  return String(text ?? '').replace(/[.\-"'&|=]/g, ' ').replace(/\s+/g, ' ').trim()
}

// בונה את משפט ההקראה: הספרות ספרה-ספרה (פסיקים = הפסקות), פעמיים לבהירות.
function spokenCode(code: string): string {
  const digits = code.replace(/\D/g, '').split('').join(', ')
  return ttsSafe(`קוד הכניסה שלך הוא ${digits} , שוב, ${digits}`)
}

// מבצע שיחה יוצאת למספר יחיד שמקריאה את הקוד. לעולם לא זורק; לא מתעד את הקוד.
// מחזיר { ok, error? }. אם לא מוגדר — { ok:false, notConfigured:true }.
export async function placeCodeCall(
  phone: string,
  code: string,
): Promise<{ ok: boolean; notConfigured?: boolean; error?: string }> {
  const token = process.env.YEMOT_TOKEN
  const callerId = process.env.YEMOT_OTP_CALLER_ID
  if (!token || !callerId) return { ok: false, notConfigured: true }

  const tel = phone.replace(/\D/g, '')
  if (tel.length < 9) return { ok: false, error: 'מספר טלפון לא תקין' }

  // SendTTS — שיחה יוצאת יחידה שמקריאה את הקוד כ-TTS. phones = המספר היחיד,
  // callerId = ה-DID, ttsMessage = הטקסט להקראה.
  const form = new URLSearchParams()
  form.set('token', token)
  form.set('callerId', callerId)
  form.set('phones', tel)
  form.set('ttsMessage', spokenCode(code))

  try {
    const res = await fetch(`${YEMOT_API}/SendTTS`, { method: 'POST', body: form })
    const json = await res.json().catch(() => null)
    if (!json || (json.responseStatus && json.responseStatus !== 'OK')) {
      return { ok: false, error: json ? String(json.message ?? json.responseStatus) : `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
