// שיחה יוצאת דרך ימות המשיח — מקריאה למתקשר קוד כניסה חד-פעמי (TTS). צד-שרת בלבד.
//
// ⚠️ בטיחות: השיחה מתבצעת אך ורק כשמוגדר YEMOT_OTP_TEMPLATE_ID. כל עוד אינו מוגדר —
// yemotCallConfigured() מחזיר false ו-placeCodeCall לא יוצר שום שיחה.
//
// מנגנון: RunCampaign על תבנית *נקייה* (בלי הודעה כללית, maxDialAttempts=1) עם
// ttsMode=1 והקוד כטקסט אישי ב-phones. כך מוקרא רק הקוד, שיחה אחת, בלי חזרות:
//   • templateId = YEMOT_OTP_TEMPLATE_ID — תבנית ללא הודעה ועם ניסיון חיוג אחד.
//   • ttsMode=1 — מקריא את הטקסט האישי כ-TTS (בלי זה השיחה מתנתקת בלי הקראה).
//   • phones = { "<מספר>": "<קוד להקראה>" } — אובייקט JSON, ערך = הטקסט האישי.
// אם התבנית כוללת הודעה כללית — היא תושמע לפני הקוד; לכן יש להשתמש בתבנית ריקה.

const YEMOT_API = 'https://www.call2all.co.il/ym/api'

export function yemotCallConfigured(): boolean {
  return !!process.env.YEMOT_TOKEN && !!process.env.YEMOT_OTP_TEMPLATE_ID
}

// טקסט בטוח להקראה. מסירים פסיקים (חותכים את ההודעה) וגם נקודות (ימות מתייחסת
// אליהן כהפסקה ארוכה מאוד — מה שגרם לעיכוב של 15ש' לפני ההקראה). הפרדה ברווחים.
function ttsSafe(text: string): string {
  return String(text ?? '').replace(/[.,\-"'&|=]/g, ' ').replace(/[ \t]+/g, ' ').trim()
}

// משפט ההקראה: הספרות ספרה-ספרה (רווחים = הפרדה), פעמיים לבהירות. בלי נקודות/פסיקים.
function spokenCode(code: string): string {
  const digits = code.replace(/\D/g, '').split('').join(' ')
  return ttsSafe(`קוד הכניסה שלך הוא ${digits} שוב ${digits}`)
}

// מבצע שיחה יוצאת יחידה שמקריאה טקסט TTS כלשהו. לעולם לא זורק.
// מחזיר { ok, error? }. אם לא מוגדר — { ok:false, notConfigured:true }.
async function runTtsCall(
  phone: string,
  spokenText: string,
): Promise<{ ok: boolean; notConfigured?: boolean; error?: string }> {
  const token = process.env.YEMOT_TOKEN
  const templateId = process.env.YEMOT_OTP_TEMPLATE_ID
  const callerId = process.env.YEMOT_OTP_CALLER_ID // אופציונלי — נקבע גם בתבנית
  if (!token || !templateId) return { ok: false, notConfigured: true }

  const tel = phone.replace(/\D/g, '')
  if (tel.length < 9) return { ok: false, error: 'מספר טלפון לא תקין' }

  const form = new URLSearchParams()
  form.set('token', token)
  form.set('templateId', templateId)
  form.set('phones', JSON.stringify({ [tel]: spokenText }))
  form.set('ttsMode', '1')
  form.set('withSMS', '0')
  if (callerId) form.set('callerId', callerId)

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

// שיחה יוצאת שמקריאה למתקשר את קוד הכניסה החד-פעמי. לא מתעד את הקוד.
export function placeCodeCall(
  phone: string,
  code: string,
): Promise<{ ok: boolean; notConfigured?: boolean; error?: string }> {
  return runTtsCall(phone, spokenCode(code))
}

// שיחה יוצאת שמקריאה הודעה כללית (למשל אישור קליטת רישום). הטקסט עובר ttsSafe.
export function placeAnnouncementCall(
  phone: string,
  text: string,
): Promise<{ ok: boolean; notConfigured?: boolean; error?: string }> {
  return runTtsCall(phone, ttsSafe(text))
}
