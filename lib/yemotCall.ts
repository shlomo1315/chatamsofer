// שיחה יוצאת דרך ימות המשיח — מקריאה למתקשר קוד כניסה חד-פעמי (TTS inline).
// מודול צד-שרת בלבד.
//
// ⚠️ בטיחות: השיחה מתבצעת אך ורק כשמוגדר YEMOT_OTP_CALLER_ID (מספר ה-DID של המערכת).
// כל עוד המשתנה לא מוגדר — yemotCallConfigured() מחזיר false ו-placeCodeCall לא יוצר שום שיחה.
// כך הפיצ'ר רדום עד שמפעילים אותו במכוון.
//
// מנגנון: RunCampaign של call2all עם הודעה אישית בלבד — שיחה יוצאת שמקריאה
// טקסט אישי לכל מספר, ללא קשר לקמפיינים/תבניות קיימים. הפורמט הקריטי:
//   phones = אובייקט JSON { "<מספר>": "<טקסט אישי להקראה>" }   (לא מערך!)
// חשוב: לא שולחים ttsMode! ttsMode=1 גורם לימות לנגן קודם "הודעה כללית" של
// תבנית קמפיין (ההודעה על המוקדים/בית שמש ששמע המשתמש) ורק אחריה את הטקסט.
// בלי ttsMode — מוקרא רק הטקסט האישי (הקוד).

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

  // RunCampaign + ttsMode=1 — שיחה יוצאת שמקריאה את הקוד כטקסט אישי.
  // phones חייב להיות אובייקט JSON { "<מספר>": "<טקסט>" } (לא מערך).
  const form = new URLSearchParams()
  form.set('token', token)
  form.set('callerId', callerId)
  form.set('phones', JSON.stringify({ [tel]: spokenCode(code) }))
  // ⚠️ ללא ttsMode! ttsMode=1 גורם לימות לנגן קודם "הודעה כללית" של תבנית קמפיין
  // ואז את הטקסט האישי. בלעדיו — מוקרא רק הטקסט האישי (הקוד) מתוך ערך phones.
  form.set('withSMS', '0')

  try {
    const res = await fetch(`${YEMOT_API}/RunCampaign`, { method: 'POST', body: form })
    const json = await res.json().catch(() => null)
    if (!json || (json.responseStatus && json.responseStatus !== 'OK')) {
      return { ok: false, error: json ? String(json.message ?? json.responseStatus) : `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
