// שיחות יוצאות (קוד כניסה, הודעות): רק דרך טכנוליין. צד-שרת בלבד.

import { callConfigured as tlCallConfigured, placeCodeCall as tlPlaceCodeCall, placeTextCall } from '@/lib/telephony/client'

// כשל מוחזר למי שקרא, בלי נפילה לשום מערכת אחרת.
export function phoneCallConfigured(): boolean {
  return tlCallConfigured('main')
}

// הקראת הקוד בשיחה יוצאת: ספרה אחרי ספרה, עם נקודה-פסיק ביניהן להפסקה קצרה.
// בלי פסיקים ובלי נקודות, שקוטעים את ההקראה. ניתן לשינוי בלי פריסה דרך OTP_DIGIT_SEP.
const DIGIT_WORDS = ['אפס', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע']
const DIGIT_SEP = process.env.OTP_DIGIT_SEP ?? ' ; '

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

