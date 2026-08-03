import { createHmac, timingSafeEqual } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// חתימת HMAC לאסימונים — מקור אמת יחיד לכל האסימונים החתומים במערכת:
// סשן פורטל הצאצאים, סשן פורטל בתי ההחלמה, אסימון אימות טלפון/מייל, וקישורים
// ציבוריים (מכתב ברכה / משוב / תיקון שם).
//
// ⚠️ נכשל-סגור. עד כה כל אחד מהמקומות האלה חתם עם
//   process.env.OTP_NONCE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
// כלומר בסביבה שבה שני המשתנים חסרים — סביבה חדשה, משתנה שנשמט בהגדרה מחדש —
// ה-HMAC היה מחושב עם **מפתח ריק**. חתימה עם מפתח ריק אינה סוד: כל אחד יכול
// לחשב אותה, ולזייף סשן פורטל של כל משפחה, אסימון "אימתתי טלפון", וקישור
// ציבורי לכל תיק. המערכת לא הייתה מתריעה — היא הייתה ממשיכה לעבוד כרגיל.
//
// מכאן: בלי סוד אין חתימה ואין אימות, והכשל מדווח ביומן. פורטל שלא נפתח עדיף
// על פורטל פתוח לכל.
//
// ⚠️ מרוכז בקובץ אחד בכוונה: כשההיגיון הזה היה מועתק בחמישה מקומות, תיקון
// באחד מהם לא היה מגיע לשאר — וזה בדיוק סוג הפער שמייצר את החור.
// ─────────────────────────────────────────────────────────────────────────────

function secret(): string | null {
  return process.env.OTP_NONCE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null
}

/** האם ניתן לחתום בכלל. false = הסביבה אינה מוגדרת. */
export function signingConfigured(): boolean {
  return secret() !== null
}

/**
 * חתימת מטען. מחזיר null כשאין סוד חתימה — הקורא חייב להתייחס ל-null ככשל
 * ולא ליפול למחרוזת ריקה.
 */
export function signPayload(payload: string, encoding: 'hex' | 'base64url' = 'hex'): string | null {
  const key = secret()
  if (!key) {
    console.error('[signedToken] אין סוד חתימה (OTP_NONCE_SECRET / SUPABASE_SERVICE_ROLE_KEY) — הפעולה נדחית')
    return null
  }
  return createHmac('sha256', key).update(payload).digest(encoding)
}

/**
 * השוואת חתימה בזמן קבוע. false גם כשאין סוד (נכשל-סגור) וגם כשהאורכים שונים
 * — timingSafeEqual זורק על אורכים שונים, ולכן הבדיקה חייבת להקדים אותו.
 */
export function verifySignature(
  payload: string,
  signature: string,
  encoding: 'hex' | 'base64url' = 'hex',
): boolean {
  const expected = signPayload(payload, encoding)
  if (!expected) return false
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try { return timingSafeEqual(a, b) } catch { return false }
}
