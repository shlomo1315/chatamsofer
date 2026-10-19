// שיחה יוצאת של זיכויי היריד דרך ימות המשיח. צד-שרת בלבד.
//
// RunCampaign על תבנית ייעודית (YEMOT_BOOK_FAIR_CREDIT_TEMPLATE_ID) שמחייגת ללקוח ומעבירה אותו
// לשלוחה שמוגדרת כ-api_link ל-/api/webhooks/yemot-credits. כל התוכן (ספרים, סכום,
// איסוף פרטי הבנק) מושמע מה-webhook, ולכן התבנית עצמה ריקה: בלי הודעה ועם ניסיון חיוג אחד.
// חשבון ימות נפרד ליריד: משתמשים רק ב-YEMOT_BOOK_FAIR_TOKEN, בלא חזרה ל-YEMOT_TOKEN הכללי.
// בלי YEMOT_BOOK_FAIR_TOKEN ו-YEMOT_BOOK_FAIR_CREDIT_TEMPLATE_ID לא יוצאת שום שיחה.
// מספר מחייג אופציונלי: YEMOT_BOOK_FAIR_CALLER_ID (לא YEMOT_OTP_CALLER_ID, שהוא של החשבון הכללי).

const YEMOT_API = 'https://www.call2all.co.il/ym/api'

export function creditCallConfigured(): boolean {
  return !!process.env.YEMOT_BOOK_FAIR_TOKEN && !!process.env.YEMOT_BOOK_FAIR_CREDIT_TEMPLATE_ID
}

export async function placeCreditCall(phone: string): Promise<{ ok: boolean; notConfigured?: boolean; error?: string }> {
  const token = process.env.YEMOT_BOOK_FAIR_TOKEN
  const templateId = process.env.YEMOT_BOOK_FAIR_CREDIT_TEMPLATE_ID
  if (!token || !templateId) return { ok: false, notConfigured: true }
  const tel = phone.replace(/\D/g, '')
  if (tel.length < 9) return { ok: false, error: 'מספר טלפון לא תקין' }

  const form = new URLSearchParams()
  form.set('token', token)
  form.set('templateId', templateId)
  form.set('phones', JSON.stringify({ [tel]: '' }))
  form.set('withSMS', '0')
  const callerId = process.env.YEMOT_BOOK_FAIR_CALLER_ID
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
