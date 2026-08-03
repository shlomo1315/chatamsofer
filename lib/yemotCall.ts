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

// טקסט בטוח להקראה בשיחה יוצאת.
//
// ⚠️ הפסיק מוסר — ואינו רק "לא מועיל" אלא מזיק: ימות מפצלת את הטקסט האישי
// בפסיקים למשתני התבנית, ותבנית עם משתנה אחד מקריאה רק את מה שלפני הפסיק
// הראשון. טקסט עם פסיק פירושו הודעה קטועה וניתוק. ההאטה נעשית במילים
// (ראו spokenCode) ולא בפיסוק.
// נקודה מוסרת גם: היא גרמה לימות להשהות ~15ש' לפני ההקראה.
function ttsSafe(text: string): string {
  return String(text ?? '')
    .replace(/[.,\-"'&|=]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// הקראת הקוד בשיחה יוצאת — ספרה אחרי ספרה, לאט וברור.
//
// 🚫 אסור פסיק. הטקסט האישי ב-RunCampaign מועבר לימות כערך בשדה phones, וימות
// מפצלת אותו בפסיקים למשתני התבנית (%tts1%, %tts2%, …). תבנית עם משתנה אחד
// מקריאה רק את החלק שלפני הפסיק הראשון — ולכן הניסיון להאט בפסיקים גרם לשיחה
// להקריא "קוד הכניסה שלך הוא" ולהתנתק מיד. זו הייתה תקלה חיה בפרודקשן.
//
// 🚫 אסורה גם נקודה: ימות משהה ~15 שניות לפניה.
//
// ✅ ההפרדה נעשית בנקודה-פסיק: סימן הפסקה תקני שאינו חלק מהתחביר של ימות,
// ולכן מועבר כמו שהוא ל-TTS. מילות מקום ("ספרה ראשונה") נוסו והוסרו — הן אכן
// האטו, אבל הפכו את ההקראה למסורבלת. הפתיח קצר ומיידי, ואחריו ספרות בלבד.
// ─────────────────────────────────────────────────────────────────────────────
const DIGIT_WORDS = ['אפס', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע']

/**
 * מפריד ההשהיה בין ספרה לספרה.
 *
 * ⚠️ המילים ("ספרה ראשונה") הוסרו — הן האטו את ההקראה אבל הפכו אותה למסורבלת.
 * ⚠️ פסיק אסור: הוא קוטע את ההודעה (ימות מפצלת בו למשתני התבנית).
 * ⚠️ נקודה אסורה: היא גורמת להשהיה של ~15 שניות.
 * נשאר נקודה-פסיק — סימן הפסקה תקני שאינו תחביר של ימות, ולכן מועבר ל-TTS
 * ומתורגם להפסקה. ניתן לשינוי בלי פריסה דרך YEMOT_OTP_DIGIT_SEP (למשל להכפיל
 * ל-";;" להפסקה ארוכה יותר, או לרוקן אם ההקראה נשמעת שבורה).
 */
const DIGIT_SEP = process.env.YEMOT_OTP_DIGIT_SEP ?? ' ; '

function digitsSpoken(code: string): string {
  return code.replace(/\D/g, '').split('')
    .map(d => DIGIT_WORDS[Number(d)] ?? d)
    .join(DIGIT_SEP)
}

export function spokenCode(code: string): string {
  const spoken = digitsSpoken(code)
  // ⚠️ "שלום" נשאר כמילת-חיץ אחת ויחידה: תחילת ההקראה נבלעת בזמן שהקו מתייצב
  // אחרי המענה, ובלעדיה הספרה הראשונה נחתכה וההקראה נשמעה בת 5 ספרות.
  // מילה אחת סופגת את החיתוך במקום שהקוד יספוג אותו.
  return `שלום הקוד שלכם הוא ${spoken} ואני חוזר שנית ${spoken}`
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
  // ⚠️ ttsSafe גם כאן, למרות ש-spokenCode אינו מייצר פיסוק: זו רשת ביטחון
  // מפני עריכה עתידית שתחזיר פסיק לטקסט — פסיק אחד קוטע את ההודעה ומנתק.
  return runTtsCall(phone, ttsSafe(spokenCode(code)))
}

// שיחה יוצאת שמנגנת קובץ מוקלט (קול טבעי) דרך תבנית קמפיין ייעודית שמנגנת קובץ.
// דורש YEMOT_ANNOUNCE_TEMPLATE_ID (תבנית בימות שמנגנת את קובץ ההודעה שהועלה).
async function runFileCall(phone: string): Promise<{ ok: boolean; notConfigured?: boolean; error?: string }> {
  const token = process.env.YEMOT_TOKEN
  const templateId = process.env.YEMOT_ANNOUNCE_TEMPLATE_ID
  const callerId = process.env.YEMOT_OTP_CALLER_ID
  if (!token || !templateId) return { ok: false, notConfigured: true }
  const tel = phone.replace(/\D/g, '')
  if (tel.length < 9) return { ok: false, error: 'מספר טלפון לא תקין' }

  const form = new URLSearchParams()
  form.set('token', token)
  form.set('templateId', templateId)
  form.set('phones', JSON.stringify({ [tel]: '' })) // התבנית מנגנת את הקובץ; אין טקסט אישי
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

// שיחה יוצאת שמקריאה הודעה כללית (למשל אישור קליטת רישום).
// אם הוגדרה תבנית קמפיין שמנגנת קובץ (YEMOT_ANNOUNCE_TEMPLATE_ID) — מפעילים אותה
// (מנגנת את ההקלטה הטבעית). אם הקמפיין נכשל (לא חויג) — נפילה-לאחור ל-TTS כדי שבכל
// מקרה תצא שיחה אחת. מחזיר גם mode/error לאבחון.
export async function placeAnnouncementCall(
  phone: string,
  text: string,
  _opts: { audioFile?: string | null } = {},
): Promise<{ ok: boolean; notConfigured?: boolean; error?: string; mode?: 'file' | 'tts' }> {
  void _opts
  if (process.env.YEMOT_ANNOUNCE_TEMPLATE_ID) {
    const r = await runFileCall(phone)
    if (r.ok) return { ...r, mode: 'file' }
    // קמפיין הקובץ החזיר שגיאה → לא בוצע חיוג; מנסים TTS (שיחה אחת בלבד).
    const t = await runTtsCall(phone, ttsSafe(text))
    return { ok: t.ok, notConfigured: t.notConfigured, mode: 'tts', error: `קמפיין הקובץ נכשל: ${r.error}${t.ok ? ' — בוצעה שיחת TTS במקום' : `; גם TTS נכשל: ${t.error}`}` }
  }
  const t = await runTtsCall(phone, ttsSafe(text))
  return { ...t, mode: 'tts' }
}
