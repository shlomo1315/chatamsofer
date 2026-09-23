// ─────────────────────────────────────────────────────────────────────────────
// ספק סליקה — נדרים פלוס (תשלומים).
//
// 🔴 זהו מוצר *אחר* מ"נדרים קארד" שבשאר המערכת. נדרים קארד
// (lib/nedarim.ts, מוסדות 7018265 ו-7014553) מנהל כרטיסי מזון טעונים
// מתקציב המוסד — הוא אינו גובה כסף מאיש. כאן מדובר בגבייה אמיתית
// מכרטיס האשראי של הקונה, עם קוד מוסד וקוד API נפרדים לגמרי.
//
// ⚠️ ערבוב בין השניים הוא בלתי-הפיך בדיווח. ההגדרות יושבות תחת
// app_settings['payments_provider'] ולא תחת 'nedarim_card'.
//
// ── מסלול הסליקה ──
// דף מתארח (hosted page) ולא טופס אצלנו: פרטי הכרטיס לעולם אינם
// עוברים דרך השרת שלנו, ולכן אין עלינו חובות PCI. הלקוח מופנה
// לנדרים, משלם, וחוזר; האישור מגיע ב-callback שרת-לשרת.
//
// 🔴 ה-callback אינו נאמן: הוא בקשת HTTP שכל אחד יכול לשלוח.
// verifyCallback חייב לאמת מול נדרים לפני שהזמנה מסומנת כשולמה.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PaymentProvider, ChargeRequest, ChargeResult,
  VerifiedCharge, RefundRequest, RefundResult,
} from './types'
import { sanitizeProviderResponse } from './types'
import { getPaymentSettings } from './settings'

/**
 * כתובות נדרים תשלומים.
 *
 * ⚠️ ניתנות לדריסה במשתני סביבה: אם נדרים משנים נתיב, זה תיקון
 * בהגדרות ולא פריסה. הברירות הן הכתובות המתועדות.
 */
const PAY_PAGE = process.env.NEDARIM_PAY_URL
  || 'https://www.matara.pro/nedarimplus/online/'
const API_URL = process.env.NEDARIM_PAY_API_URL
  || 'https://www.matara.pro/nedarimplus/V6/Api.aspx'

/** ⚠️ פסק זמן מפורש: בקשה תלויה מחזיקה חיבור ומקפיאה את הקונה. */
const TIMEOUT_MS = 25_000

export class NedarimPaymentProvider implements PaymentProvider {
  readonly name = 'nedarim'

  private async creds(): Promise<{ mosadId: string; apiValid: string } | null> {
    const s = await getPaymentSettings()
    const mosadId = (s.mosadId ?? '').trim()
    const apiValid = (s.apiValid ?? '').trim()
    if (!mosadId || !apiValid) return null
    return { mosadId, apiValid }
  }

  async isConfigured(): Promise<boolean> {
    return (await this.creds()) !== null
  }

  /**
   * פנייה ל-API של נדרים.
   *
   * ⚠️ application/x-www-form-urlencoded ולא JSON — זה מה שנדרים
   * מצפים לו, אותו דפוס כמו lib/nedarim.ts.
   *
   * ⚠️ שדה ריק מושמט ולא נשלח כמחרוזת ריקה: נדרים מתייחסים לשדה
   * ריק כאל ערך ולא כאל היעדר.
   */
  private async call(
    params: Record<string, string | number | undefined>,
  ): Promise<Record<string, unknown>> {
    const c = await this.creds()
    if (!c) throw new Error('סליקת נדרים אינה מוגדרת')

    const form = new URLSearchParams()
    form.set('Mosad', c.mosadId)
    form.set('ApiValid', c.apiValid)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') form.set(k, String(v))
    }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: ctrl.signal,
        cache: 'no-store',
      })
    } finally {
      clearTimeout(timer)
    }

    const text = await res.text()
    if (!res.ok) throw new Error(`נדרים החזיר שגיאה (${res.status})`)

    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      // ⚠️ חלק מהפעולות מחזירות טקסט פשוט ולא JSON.
      return {
        Result: text.trim().toUpperCase().startsWith('OK') ? 'OK' : 'Error',
        Message: text.trim(),
      }
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const c = await this.creds()
    if (!c) return { ok: false, message: 'לא הוזנו קוד מוסד וקוד API' }

    try {
      // ⚠️ פעולה קלה שאינה יוצרת עסקה. אם נדרים אינם תומכים בה,
      // היא תחזיר שגיאה מפורשת — וזו עדיין תשובה שימושית: היא
      // מוכיחה שהכתובת נכונה ושהאימות התקבל.
      const r = await this.call({ Action: 'Validate' })
      const ok = String(r.Result ?? '').toUpperCase() === 'OK'
      return ok
        ? { ok: true, message: `החיבור תקין · מוסד ${c.mosadId}` }
        : { ok: false, message: String(r.Message ?? 'נדרים דחו את פרטי ההתחברות') }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'החיבור נכשל' }
    }
  }

  /**
   * יוצר עסקה ומחזיר כתובת לדף התשלום של נדרים.
   *
   * 🔴 הסכום נשלח בשקלים עם שתי ספרות: נדרים עובדים בשקלים, המערכת
   * באגורות. המרה שגויה כאן היא חיוב פי 100 או חלקי 100.
   */
  async createCharge(req: ChargeRequest): Promise<ChargeResult> {
    if (!Number.isInteger(req.amountAgorot) || req.amountAgorot <= 0) {
      return { ok: false, error: 'סכום לחיוב חייב להיות מספר שלם גדול מאפס' }
    }
    const c = await this.creds()
    if (!c) return { ok: false, error: 'סליקת נדרים אינה מוגדרת' }

    // ⚠️ toFixed(2) ולא חילוק פשוט: 12345/100 הוא 123.45 אבל
    // 1010/100 הוא 10.1, ונדרים מצפים ל-10.10.
    const shekels = (req.amountAgorot / 100).toFixed(2)

    const params = new URLSearchParams({
      Mosad: c.mosadId,
      Amount: shekels,
      // 🔴 מזהה ההזמנה חוזר ב-callback והוא מה שמקשר את התשלום
      // להזמנה. בלעדיו אי אפשר לדעת מה שולם.
      Zeout: req.orderNumber,
      Currency: '1',              // 1 = ש"ח
      Tashlumim: '1',             // תשלום אחד
      ...(req.customerName  ? { FirstName: req.customerName } : {}),
      ...(req.customerEmail ? { Mail: req.customerEmail } : {}),
      ...(req.customerPhone ? { Phone: req.customerPhone } : {}),
      ...(req.description   ? { Comment: req.description } : {}),
      ...(req.returnUrl     ? { ReturnUrl: req.returnUrl } : {}),
    })

    // ⚠️ אין כאן קריאת רשת: נדרים בונים את העסקה כשהלקוח מגיע לדף.
    // ה-transactionId האמיתי נקבע שם ומגיע אלינו ב-callback, ולכן
    // איננו מחזירים אותו עכשיו — רק את הכתובת.
    return { ok: true, redirectUrl: `${PAY_PAGE}?${params}` }
  }

  /**
   * מאמת דיווח תשלום.
   *
   * 🔴 הדיווח עצמו אינו ראיה — זו בקשת HTTP שכל אחד יכול לשלוח.
   * כאן מתבצעת שאילתת-חזרה לנדרים על אותה עסקה, והתוצאה שלה היא
   * מה שמכריע. בלי זה, כל אחד יכול "לשלם" בבקשה אחת.
   */
  async verifyCallback(raw: Record<string, unknown>): Promise<VerifiedCharge | null> {
    const txn = String(raw.TransactionId ?? raw.txn ?? raw.Id ?? '').trim()
    const orderNumber = String(raw.Zeout ?? raw.order ?? '').trim()
    if (!txn || !orderNumber) return null

    try {
      const r = await this.call({ Action: 'GetTransaction', TransactionId: txn })

      const ok = String(r.Result ?? '').toUpperCase() === 'OK'
      const status = String(r.Status ?? r.TransactionStatus ?? '').toLowerCase()
      const approved = ok && (status === 'success' || status === 'ok' || status === 'approved')

      // הסכום מנדרים בשקלים → אגורות. Math.round כי float.
      const amt = Number(r.Amount ?? r.Sum ?? 0)
      const amountAgorot = Number.isFinite(amt) ? Math.round(amt * 100) : 0

      return {
        orderId: orderNumber,
        transactionId: txn,
        amountAgorot,
        approvalCode: r.ConfirmationNumber ? String(r.ConfirmationNumber) : null,
        status: approved ? 'success' : 'failed',
        // ⚠️ מסונן לפני שמירה — פרטי כרטיס לא נשמרים במסד.
        raw: sanitizeProviderResponse(r),
      }
    } catch (e) {
      // 🔴 כשל באימות אינו "נכשל" ואינו "הצליח": מחזירים null,
      // והקורא מחזיר 400 כדי שנדרים ידווחו שוב. סימון ככישלון היה
      // מבטל הזמנה ששולמה בפועל.
      console.error('[payments/nedarim] אימות העסקה נכשל:', e)
      return null
    }
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    if (req.amountAgorot <= 0) {
      return { ok: false, error: 'סכום זיכוי חייב להיות גדול מאפס' }
    }
    const c = await this.creds()
    if (!c) return { ok: false, error: 'סליקת נדרים אינה מוגדרת' }

    try {
      const r = await this.call({
        Action: 'Refund',
        TransactionId: req.transactionId,
        Amount: (req.amountAgorot / 100).toFixed(2),
        ...(req.reason ? { Comment: req.reason } : {}),
      })

      if (String(r.Result ?? '').toUpperCase() === 'OK') {
        return { ok: true, refundId: String(r.RefundId ?? r.TransactionId ?? '') || undefined }
      }

      // ⚠️ ספק שאינו תומך בזיכוי דרך הממשק מסומן כ-manualRequired
      // ולא ככישלון: נתיב הזיכוי ירשום את התנועה ויאמר למשתמש
      // במפורש שעליו להעביר את הכסף ידנית.
      const msg = String(r.Message ?? '')
      if (/not\s*support|לא\s*נתמך|אינו\s*נתמך/i.test(msg)) {
        return { ok: false, manualRequired: true, error: msg }
      }
      return { ok: false, error: msg || 'הזיכוי נדחה' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'שגיאת תקשורת מול נדרים' }
    }
  }
}
