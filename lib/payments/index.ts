// ─────────────────────────────────────────────────────────────────────────────
// בורר ספק הסליקה.
//
// 🔴 כל זרימת התשלום קוראת לכאן ולא מייבאת ספק ישירות. כך המעבר
// מספק מדומה לאמיתי הוא שינוי בהגדרות ולא שינוי בקוד — וזו הדרישה
// המפורשת של המשתמש: להזין את פרטי נדרים בעצמו, בלי פריסה.
// ─────────────────────────────────────────────────────────────────────────────

import type { PaymentProvider } from './types'
import { mockProvider } from './mockProvider'

export type { PaymentProvider, ChargeRequest, ChargeResult, VerifiedCharge } from './types'
export { sanitizeProviderResponse } from './types'

/**
 * הספק הפעיל.
 *
 * ⚠️ כרגע מחזיר תמיד את המדומה — ספק נדרים ייכנס כאן בשלב 5, אחרי
 * שמסך ההגדרות ייבנה. זה מכוון: כל החנות נבנית ונבדקת לפני שפרטי
 * הסליקה ידועים.
 *
 * 🔴 כשייכנס הספק האמיתי, הכלל יהיה: אמיתי רק אם הוגדר *ולא* במצב
 * בדיקה. ספק אמיתי שאינו מוגדר חייב ליפול למדומה ולא לזרוק — אחרת
 * החנות משביתה את עצמה ברגע שמישהו מוחק שדה בהגדרות.
 */
export async function getPaymentProvider(): Promise<PaymentProvider> {
  return mockProvider
}

/** האם הסליקה הפעילה היא מדומה — לבאנר האזהרה במסכים. */
export async function isMockPayment(): Promise<boolean> {
  const p = await getPaymentProvider()
  return p.name === 'mock'
}
