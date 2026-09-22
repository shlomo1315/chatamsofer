// ─────────────────────────────────────────────────────────────────────────────
// ספק סליקה מדומה.
//
// 🔴 זה מה שמאפשר לבנות ולבדוק את כל החנות — עגלה, צ'קאאוט, אישור,
// מייל, מעקב — בלי לדעת דבר על פרטי נדרים. הוא אינו "קוד זמני": הוא
// נשאר לתמיד ככלי בדיקה, וכל שינוי בזרימת התשלום נבדק מולו קודם.
//
// ⚠️ מזהה את עצמו בבירור בכל תשובה. ספק מדומה שנראה אמיתי הוא הדרך
// המהירה ביותר להאמין שכסף נגבה כשלא נגבה דבר.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PaymentProvider, ChargeRequest, ChargeResult,
  VerifiedCharge, RefundRequest, RefundResult,
} from './types'

/**
 * 🔴 סכום שמסתיים ב-13 אגורות נכשל בכוונה.
 *
 * בלי דרך לייצר כישלון, מסלול הכישלון — הודעת השגיאה ללקוח, שחרור
 * השריון, סימון ההזמנה — לא נבדק אף פעם, ומתגלה שבור רק כשכרטיס אמיתי
 * נדחה אצל לקוח אמיתי.
 */
export function mockShouldFail(amountAgorot: number): boolean {
  return amountAgorot % 100 === 13
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock'

  /** העסקאות שנוצרו — נגישות לבדיקות ולדף התשלום המדומה. */
  private charges = new Map<string, { orderId: string; amountAgorot: number }>()

  async isConfigured(): Promise<boolean> {
    return true
  }

  async testConnection() {
    return { ok: true, message: 'ספק מדומה — פעיל. לא מתבצעת סליקה אמיתית.' }
  }

  async createCharge(req: ChargeRequest): Promise<ChargeResult> {
    if (req.amountAgorot <= 0) {
      return { ok: false, error: 'סכום לחיוב חייב להיות גדול מאפס' }
    }

    const transactionId = `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    this.charges.set(transactionId, { orderId: req.orderId, amountAgorot: req.amountAgorot })

    // ⚠️ מפנה לדף סליקה מדומה *שלנו* — מדמה את דף הספק המתארח, כולל
    // הבחירה בין הצלחה לכישלון. כך הזרימה שנבדקת זהה לאמיתית.
    const params = new URLSearchParams({
      txn: transactionId,
      order: req.orderId,
      amount: String(req.amountAgorot),
      ...(req.returnUrl ? { return: req.returnUrl } : {}),
    })

    return { ok: true, transactionId, redirectUrl: `/fair/mock-payment?${params}` }
  }

  async verifyCallback(raw: Record<string, unknown>): Promise<VerifiedCharge | null> {
    const transactionId = String(raw.txn ?? raw.transactionId ?? '')
    const orderId = String(raw.order ?? raw.orderId ?? '')
    if (!transactionId || !orderId) return null

    // ⚠️ מאמת מול העסקאות שיצרנו, כדי שגם הספק המדומה יתנהג כמו ספק
    // אמיתי: דיווח על עסקה שלא נוצרה כאן נדחה.
    const known = this.charges.get(transactionId)
    const amountAgorot = known?.amountAgorot ?? Number(raw.amount ?? 0)
    if (!amountAgorot) return null

    const failed = raw.result === 'fail' || mockShouldFail(amountAgorot)

    return {
      orderId: known?.orderId ?? orderId,
      transactionId,
      amountAgorot,
      approvalCode: failed ? null : `MOCK${String(Math.floor(Math.random() * 900000) + 100000)}`,
      status: failed ? 'failed' : 'success',
      raw: { provider: 'mock', note: 'סליקה מדומה — לא נגבה כסף' },
    }
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    if (req.amountAgorot <= 0) return { ok: false, error: 'סכום זיכוי חייב להיות גדול מאפס' }
    return { ok: true, refundId: `MOCKREF-${Date.now()}` }
  }
}

/**
 * ⚠️ מופע יחיד למודול: מפת העסקאות חייבת לשרוד בין הבקשה שיוצרת את
 * החיוב לבין הבקשה שמאמתת אותו.
 *
 * 🔴 זו בדיוק הסיבה שהוא מתאים לפיתוח בלבד — בפרודקשן עם כמה מופעי
 * שרת, המפה אינה משותפת ביניהם. הספק האמיתי שומר מצב אצלו.
 */
export const mockProvider = new MockPaymentProvider()
