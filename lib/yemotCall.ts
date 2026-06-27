// שיחה יוצאת דרך ימות המשיח — מנתבת את המתקשר לשלוחת ה-OTP (yemot-otp) שמקריאה
// לו את הקוד החד-פעמי. מודול צד-שרת בלבד.
//
// ⚠️ בטיחות: השיחה מתבצעת אך ורק כשמוגדר YEMOT_OTP_TEMPLATE_ID (מזהה תבנית קמפיין
// שהוגדרה בניהול ימות לניתוב לשלוחת ה-OTP, עם *ניסיון אחד בלבד*). כל עוד המשתנה
// לא מוגדר — yemotCallConfigured() מחזיר false ו-placeCodeCall לא יוצר שום שיחה.
//
// מנגנון (השלוחה הייעודית):
//   • התבנית בימות מוגדרת: "ניתוב לשלוחה" → שלוחת ה-OTP (type=api → /api/webhooks/yemot-otp),
//     מספר ניסיונות = 1 (קריטי! ברירת המחדל של ימות היא 3 ניסיונות = שיחות חוזרות).
//   • placeCodeCall מפעיל את התבנית למספר היחיד. השלוחה שולפת את הקוד מה-DB
//     לפי מספר המתקשר ומקריאה אותו — בלי שום הודעה כללית/טקסט בקמפיין.
// כך הקוד הדינמי אינו עובר דרך טקסט הקמפיין כלל, ואין תלות בתבניות/הודעות קיימות.

const YEMOT_API = 'https://www.call2all.co.il/ym/api'

export function yemotCallConfigured(): boolean {
  return !!process.env.YEMOT_TOKEN && !!process.env.YEMOT_OTP_TEMPLATE_ID
}

// מפעיל שיחה יוצאת יחידה שמנתבת את המתקשר לשלוחת ה-OTP. לעולם לא זורק.
// מחזיר { ok, error? }. אם לא מוגדר — { ok:false, notConfigured:true }.
export async function placeCodeCall(
  phone: string,
): Promise<{ ok: boolean; notConfigured?: boolean; error?: string }> {
  const token = process.env.YEMOT_TOKEN
  const templateId = process.env.YEMOT_OTP_TEMPLATE_ID
  const callerId = process.env.YEMOT_OTP_CALLER_ID // אופציונלי — נקבע גם בתבנית
  if (!token || !templateId) return { ok: false, notConfigured: true }

  const tel = phone.replace(/\D/g, '')
  if (tel.length < 9) return { ok: false, error: 'מספר טלפון לא תקין' }

  // RunCampaign עם templateId של תבנית שמנתבת לשלוחת ה-OTP. phones = המספר היחיד
  // (פורמט אובייקט JSON שעובד בימות). הטקסט אינו בשימוש — השלוחה מקריאה את הקוד.
  const form = new URLSearchParams()
  form.set('token', token)
  form.set('templateId', templateId)
  form.set('phones', JSON.stringify({ [tel]: '' }))
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
