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
 * 🔴 הכלל: אמיתי רק אם הוגדר *ולא* במצב בדיקה. ספק אמיתי שאינו
 * מוגדר נופל למדומה ואינו זורק — אחרת החנות משביתה את עצמה ברגע
 * שמישהו מוחק שדה בהגדרות, וזה קורה בדיוק בשיא העומס.
 *
 * ⚠️ כל זרימת התשלום קוראת לכאן ולא מייבאת ספק ישירות, ולכן המעבר
 * מבדיקה לייצור הוא שינוי בהגדרות ובלי פריסה.
 */
export async function getPaymentProvider(): Promise<PaymentProvider> {
  try {
    const { getPaymentSettings } = await import('./settings')
    const s = await getPaymentSettings()

    // מצב בדיקה גובר על הכל — גם כשהפרטים מלאים ותקינים.
    if (s.testMode) return mockProvider

    const name = (s.provider ?? '').trim().toLowerCase()
    if (!name || name === 'mock') return mockProvider

    if (name === 'nedarim') {
      const { NedarimPaymentProvider } = await import('./nedarimProvider')
      const p = new NedarimPaymentProvider()
      // 🔴 ספק שאינו מוגדר במלואו נופל למדומה. הבאנר האדום בלוח
      // הבקרה יראה זאת מיד, וזה עדיף על חנות שמחזירה 500 לכל קונה.
      if (await p.isConfigured()) return p
      console.warn('[payments] ספק נדרים נבחר אך אינו מוגדר במלואו — נופל למדומה')
      return mockProvider
    }

    console.warn(`[payments] ספק לא מוכר בהגדרות: "${name}" — נופל למדומה`)
    return mockProvider
  } catch (e) {
    // ⚠️ כשל בקריאת ההגדרות (מסד לא זמין) אינו משבית את החנות.
    console.error('[payments] קריאת ההגדרות נכשלה — נופל למדומה:', e)
    return mockProvider
  }
}

/** האם הסליקה הפעילה היא מדומה — לבאנר האזהרה במסכים. */
export async function isMockPayment(): Promise<boolean> {
  const p = await getPaymentProvider()
  return p.name === 'mock'
}
