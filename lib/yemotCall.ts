// שיחות יוצאות (קוד כניסה, הודעות): רק דרך טכנוליין. צד-שרת בלבד.
// שם הקובץ נשאר מטעמי תאימות; ימות המשיח כבר לא קיימת ואין נפילה אליה.

import { callConfigured as tlCallConfigured, placeCodeCall as tlPlaceCodeCall, placeTextCall } from '@/lib/telephony/client'

// ימות המשיח כבר לא קיימת: כל השיחות היוצאות עוברות רק דרך טכנוליין (lib/telephony/client.ts).
// כשל שם מוחזר למי שקרא, בלי נפילה לשום מערכת אחרת.
export function yemotCallConfigured(): boolean {
  return tlCallConfigured('main')
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
// ✅ נקודה-פסיק בין הספרות — הפורמט שעבד בשיחות האימות מ-04.08 עד 27.10 (לפני #399).
// ניתן לשינוי בלי פריסה דרך YEMOT_OTP_DIGIT_SEP.
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

// מסתיר מילות ספרות ומספרים בטקסט לוג, כדי שהקוד לא ייכתב ללוגים.
export function maskDigits(text: string): string {
  return text.split(' ').map(w => (DIGIT_WORDS.includes(w) ? '#' : w)).join(' ').replace(/\d/g, '#')
}

// שיחה יוצאת שמקריאה למתקשר את קוד הכניסה החד-פעמי. לא מתעד את הקוד.
export async function placeCodeCall(
  phone: string,
  code: string,
): Promise<{ ok: boolean; notConfigured?: boolean; error?: string }> {
  const r = await tlPlaceCodeCall('main', phone, code)
  if (!r.ok && !r.notConfigured) console.error('[otp-call] technoline failed:', r.error)
  return r
}

/** שיחה יוצאת שמקריאה טקסט חופשי ב-TTS (למשל אישור בקשה לחלוקת חגים). */
export async function placeTtsCall(
  phone: string,
  text: string,
): Promise<{ ok: boolean; notConfigured?: boolean; error?: string }> {
  const r = await placeTextCall('main', phone, text)
  if (!r.ok && !r.notConfigured) console.error('[tts-call] technoline failed:', r.error)
  return r
}

/** הקראת הודעה כללית (למשל אישור קליטת רישום). ההקלטה הישנה של ימות בוטלה: תמיד TTS. */
export async function placeAnnouncementCall(
  phone: string,
  text: string,
  _opts: { audioFile?: string | null } = {},
): Promise<{ ok: boolean; notConfigured?: boolean; error?: string; mode?: 'file' | 'tts' }> {
  void _opts
  return { ...(await placeTtsCall(phone, text)), mode: 'tts' }
}

// לבדיקות אבחון בלבד (נתיב אדמין): הטקסט כמו שהוא. הפרמטר shape נשאר לתאימות.
export function placeRawTtsCall(
  phone: string,
  text: string,
  _shape: 'string' | 'object' = 'string',
): Promise<{ ok: boolean; notConfigured?: boolean; error?: string }> {
  void _shape
  return placeTtsCall(phone, text)
}
