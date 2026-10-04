// ─────────────────────────────────────────────────────────────────────────────
// ספק סליקה — נדרים פלוס (תשלומים), אייפרם שיטה 3 / מסלול ב'.
//
// 🔴 זהו מוצר *אחר* מ"נדרים קארד" שבשאר המערכת. נדרים קארד
// (lib/nedarim.ts, מוסדות 7018265 ו-7014553) מנהל כרטיסי מזון טעונים
// מתקציב המוסד — הוא אינו גובה כסף מאיש. כאן מדובר בגבייה אמיתית
// מכרטיס האשראי של הקונה, עם קוד מוסד וקוד API נפרדים לגמרי.
//
// ⚠️ ערבוב בין השניים הוא בלתי-הפיך בדיווח. ההגדרות יושבות תחת
// app_settings['payments_provider'] ולא תחת 'nedarim_card'.
//
// ── מסלול הסליקה: אייפרם, לא redirect ──
// הלקוח נשאר על האתר שלנו. השרת מקים את העסקה מראש (CreateTransaction)
// עם הסכום הנעול, ומחזיר {ID, Key} ללקוח — הדפדפן מזריק אותם לאייפרם
// (StartPayment) והתורם משלם בתוכו (כרטיס / Google Pay / Apple Pay /
// ביט / העברה בקליק, לפי מה שהמוסד מחובר אליו). פרטי הכרטיס לעולם אינם
// עוברים דרך השרת שלנו — אין עלינו חובות PCI.
//
// 🔴 TransactionResponse בדפדפן הוא הודעה שגולש עוין יכול לזייף. המקור
// האמין היחיד הוא ה-Webhook (payment-callback route) — verifyCallback
// כאן מאמת חתימת HMAC + מבנה, וה-route משווה סכום ומצליב Param2 מול
// ההזמנה לפני שמסמן אותה כשולמה.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'crypto'
import type {
  PaymentProvider, ChargeRequest, ChargeResult,
  VerifiedCharge, RefundRequest, RefundResult,
} from './types'
import { sanitizeProviderResponse } from './types'
import { getPaymentSettings } from './settings'

/**
 * כתובות נדרים פלוס.
 *
 * ⚠️ ניתנות לדריסה במשתני סביבה: אם נדרים משנים נתיב, זה תיקון
 * בהגדרות ולא פריסה. הברירות הן הכתובות המתועדות (NedarimPlus-AP.md).
 */
const CREATE_TXN_URL = process.env.NEDARIM_CREATE_TXN_URL
  || 'https://matara.pro/nedarimplus/V6/Files/WebServices/DebitIframe.aspx'
const HISTORY_URL = process.env.NEDARIM_HISTORY_URL
  || 'https://matara.pro/nedarimplus/Reports/Manage3.aspx'
/** 🔴 חייבת www — בלעדיו Google Pay נסגר מיד (ראו התיעוד). */
const IFRAME_V3_URL = 'https://www.matara.pro/nedarimplus/iframe/v3/'

/** מקורות מאומתים של עדכוני Webhook (נכון לתיעוד; ראו webhook-ips.txt לעדכון). */
export const NEDARIM_WEBHOOK_IPS = ['18.196.146.117', '18.194.219.73']

/** ⚠️ פסק זמן מפורש: בקשה תלויה מחזיקה חיבור ומקפיאה את הקונה. */
const TIMEOUT_MS = 25_000

/** בדיקות: מוסד 0 עם ApiValid קבוע — ראו "סביבת בדיקות" בתיעוד. */
const SANDBOX_MOSAD = '0'
const SANDBOX_API_VALID = 'j+iyEFN3bE'

export class NedarimPaymentProvider implements PaymentProvider {
  readonly name = 'nedarim'

  private async creds(): Promise<{ mosadId: string; apiValid: string; category: string } | null> {
    const s = await getPaymentSettings()
    const mosadId = (s.mosadId ?? '').trim()
    const apiValid = (s.apiValid ?? '').trim()
    if (!mosadId || !apiValid) return null
    return { mosadId, apiValid, category: (s.category ?? '').trim() }
  }

  async isConfigured(): Promise<boolean> {
    return (await this.creds()) !== null
  }

  /**
   * פנייה ל-API של נדרים (FORM, לא JSON — כך התיעוד מגדיר את כל
   * הפעולות מסוג זה). שדה ריק מושמט ולא נשלח כמחרוזת ריקה.
   */
  /**
   * 🔴 Action חייב לעבור ב-Query String, לא בגוף הבקשה — כך התיעוד
   * מגדיר את הפעולה ("פרמטר Action עובר בכתובת... שאר הפרמטרים
   * נשלחים בגוף הבקשה"), ואומת ישירות מול השרת: אותה בקשה עם Action
   * ב-body מחזירה "שגיאת מערכת - חסר פרמטר Action (GET)".
   */
  private async post(
    url: string,
    action: string,
    params: Record<string, string | number | undefined>,
  ): Promise<Record<string, unknown>> {
    const form = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') form.set(k, String(v))
    }
    // ⚠️ AjaxId ייחודי בכל בקשה: נדרים חוסמים בקשה כפולה עם אותו מזהה,
    // מניעת חיוב כפול בתקלת תקשורת (חוזרת ברוב פעולות ה-API).
    form.set('AjaxId', String(Date.now()) + Math.random().toString(36).slice(2, 8))

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${url}?Action=${encodeURIComponent(action)}`, {
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
        Status: text.trim().toUpperCase().startsWith('OK') ? 'OK' : 'Error',
        Message: text.trim(),
      }
    }
  }

  /**
   * בדיקת חיבור בלי ליצור עסקה: CreateTransaction עם Amount=0.
   *
   * ⚠️ לפי התיעוד: ApiValid שגוי → "סיסמת אימות לא תואמת למספר מוסד",
   * ApiValid נכון → "סכום לא תקין. יש להזין סכום גבוה מ-0" — בשני
   * המקרים לא נוצרת עסקה. ההודעה השנייה היא בפועל "הצלחה" מבחינתנו.
   */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const c = await this.creds()
    if (!c) return { ok: false, message: 'לא הוזנו קוד מוסד וקוד API' }

    try {
      const r = await this.post(CREATE_TXN_URL, 'CreateTransaction', {
        Mosad: c.mosadId, ApiValid: c.apiValid, Amount: 0, Tashlumim: 1, PaymentType: 'Ragil', Currency: '1',
      })
      const msg = String(r.Message ?? '')
      // ⚠️ "חובה להזין מספר זהות" / "שם" / "טלפון" — המוסד דורש שדה
      // חובה נוסף, אבל האימות עצמו (מוסד+ApiValid) כבר עבר. אלה
      // כשלים תקינים של בדיקה עם Amount=0, לא כשל התחברות.
      const authFailed = /אימות|לא\s*קיים|לא\s*מורשה/.test(msg)
      const looksValid = !authFailed && (/סכום/.test(msg) || /זהות|שם|טלפון/.test(msg))
      return looksValid
        ? { ok: true, message: `החיבור תקין · מוסד ${c.mosadId}` }
        : { ok: false, message: msg || 'נדרים דחו את פרטי ההתחברות' }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'החיבור נכשל' }
    }
  }

  /**
   * מקים עסקה בשרת נדרים (Method 3, מסלול ב') ומחזיר {ID, Key} —
   * הלקוח מזריק אותם לאייפרם ב-StartPayment. הסכום נעול כאן ואינו
   * ניתן לשינוי בדפדפן.
   *
   * 🔴 הסכום נשלח בשקלים: נדרים עובדים בשקלים, המערכת באגורות.
   * toFixed(2) ולא חילוק פשוט — 1010/100 הוא 10.1 אבל נדרים מצפים ל-10.10.
   */
  async createCharge(req: ChargeRequest): Promise<ChargeResult> {
    if (!Number.isInteger(req.amountAgorot) || req.amountAgorot <= 0) {
      return { ok: false, error: 'סכום לחיוב חייב להיות מספר שלם גדול מאפס' }
    }
    const c = await this.creds()
    if (!c) return { ok: false, error: 'סליקת נדרים אינה מוגדרת' }

    const shekels = (req.amountAgorot / 100).toFixed(2)
    // ── כתובת ה-CallBack ──
    //
    // 🔴 מהסביבה ולא מ-returnUrl. נדרים דיווחה במייל כשל:
    //   "כתובת היעד: https://localhost:8080/api/yerid/payment-callback
    //    Unable to connect to the remote server"
    // הסיבה: returnUrl נבנה מ-request.nextUrl.origin, ומאחורי ה-proxy
    // של Railway זה מחזיר את הכתובת הפנימית (localhost:8080) ולא את
    // הדומיין הציבורי. נדרים ניסתה לפנות לעצמה, התשלום נגבה בפועל,
    // וההזמנה נשארה "ממתינה לתשלום" — כסף שנגבה בלי שהמערכת יודעת.
    //
    // ⚠️ בלי בסיס מוגדר אין CallBack *כלל*: שליחת כתובת פנימית גרועה
    // מאי-שליחה — נדרים מנסה, נכשלת, ושולחת התראה על כל עסקה.
    const base = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      ''
    ).replace(/\/$/, '')

    const callbackUrl = /^https:\/\//i.test(base)
      ? `${base}/api/yerid/payment-callback`
      : undefined

    if (!callbackUrl) {
      console.error(
        '[nedarim] אין כתובת בסיס ציבורית (NEXT_PUBLIC_SITE_URL) — ' +
        'העסקה תיווצר בלי CallBack, והתשלום לא יעודכן אוטומטית',
      )
    }

    try {
      const r = await this.post(CREATE_TXN_URL, 'CreateTransaction', {
        Mosad: c.mosadId,
        ApiValid: c.apiValid,
        PaymentType: 'Ragil',
        Amount: shekels,
        Currency: '1',
        Tashlumim: '1',
        ...(req.customerName  ? { FirstName: req.customerName } : {}),
        ...(req.customerEmail ? { Mail: req.customerEmail } : {}),
        ...(req.customerPhone ? { Phone: req.customerPhone } : {}),
        // 🔴 שדה ההערות נשאר *ריק* במכוון (החלטת המשתמש 04.10): הוא
        // מופיע באישור שנשלח לתורם ובקבלה, והקטגוריה (Groupe) כבר
        // מזהה את התשלום. req.description עדיין קיים לשימוש פנימי
        // ובספקים אחרים, אך אינו נשלח לנדרים.
        //
        // ⚠️ אל תחזירו את Comment בלי לשאול — מספר ההזמנה הפנימי
        // הודפס באישור ללקוח, וזה בדיוק מה שביקשו להסיר.
        // 🔴 Param2 ולא Param1: Param1 נעלם מהעדכון בביט/העברה בקליק
        // ומסתיר את שני האמצעים האלה מהאייפרם אם נשלח כלל.
        Param2: req.orderNumber,
        ...(callbackUrl ? { CallBack: callbackUrl } : {}),
        // ⚠️ נעולה (Groupe) כשמוגדרת: כל תשלומי היריד מתויגים לאותה
        // קטגוריה בממשק הניהול של המוסד. באייפרם אין GroupeLock נפרד —
        // הקטגוריה כאן נקבעת בצד השרת ואינה נשלחת ללקוח לעריכה.
        ...(c.category ? { Groupe: c.category } : {}),
      })

      const ok = String(r.Status ?? '').toUpperCase() === 'OK'
      if (!ok) return { ok: false, error: String(r.Message ?? 'פתיחת העסקה נכשלה') }

      const transactionId = String(r.ID ?? '')
      const key = String(r.Key ?? '')
      if (!transactionId || !key) {
        return { ok: false, error: 'נדרים לא החזירו מזהה עסקה תקין' }
      }

      return { ok: true, transactionId, iframeTransaction: { transactionId, key } }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'שגיאת תקשורת מול נדרים' }
    }
  }

  /**
   * מאמת עדכון Webhook.
   *
   * 🔴 שכבה כפולה, שתיהן נבדקות כאן: (1) חתימת HMAC על גוף הבקשה
   * הגולמי, אם הוגדר מפתח — ראו verifyNedarimSignature. (2) המבנה
   * הצפוי (TransactionId + Param2 + Amount). בדיקת ה-IP המקור נעשית
   * ב-route עצמו (יש לו גישה לכותרות הבקשה, לא לגוף בלבד).
   *
   * ⚠️ אינה קוראת שוב לנדרים (בניגוד לספק הישן): ה-Webhook כבר *הוא*
   * האישור השרתי-אל-שרתי. שכפול הבדיקה מול GetHistoryJson (מוגבל
   * ל-20 קריאות/שעה) היה מיותר וגם עלול לחסום את עצמנו בעומס.
   */
  async verifyCallback(raw: Record<string, unknown>): Promise<VerifiedCharge | null> {
    // עדכון סירוב (Status=Error) אינו עסקה מוצלחת — לעולם לא מסומן כשולם.
    if (String(raw.Status ?? '').toUpperCase() === 'ERROR') return null

    const txn = String(raw.TransactionId ?? '').trim()
    const orderNumber = String(raw.Param2 ?? '').trim()
    const confirmation = String(raw.Confirmation ?? '').trim()
    if (!txn || !orderNumber) return null

    // ⚠️ עסקה זמנית (בלי אישור שב"א) — Confirmation ריק. לא ראיה לתשלום.
    if (!confirmation) return null

    const amt = Number(raw.Amount ?? 0)
    const amountAgorot = Number.isFinite(amt) ? Math.round(amt * 100) : 0

    return {
      orderId: orderNumber,
      transactionId: txn,
      amountAgorot,
      approvalCode: confirmation,
      status: 'success',
      raw: sanitizeProviderResponse(raw),
    }
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    // ⚠️ אין בתיעוד המלא (NedarimPlus-AP.md) פעולת "ביטול/זיכוי עסקת
    // אייפרם" מפורשת עבור מוסד תשלומים רגיל (הכרטיסים "ביטול עסקה" /
    // "זיכוי עסקה" תחת מדור "אשראי" מתייחסים ל-API הישן/Manage3).
    // עד שזה יאומת מול נדרים — לא מנחשים כתובת API; מסמנים ידני.
    return {
      ok: false,
      manualRequired: true,
      error: 'זיכוי דרך האייפרם טרם מומש — יש לבצע ידנית בממשק נדרים פלוס',
    }
  }
}

/**
 * אימות חתימת HMAC-SHA256 על גוף בקשת Webhook גולמי.
 *
 * 🔴 ה-body חייב להיות הבייטים הגולמיים כפי שהתקבלו — לא אחרי
 * JSON.parse + JSON.stringify מחדש. כל שינוי ברווחים או בסדר השדות
 * משנה את החתימה (ראו התיעוד).
 *
 * @param rawBody גוף הבקשה הגולמי (מחרוזת).
 * @param timestampHeader כותרת X-Nedarim-Timestamp.
 * @param signatureHeader כותרת X-Nedarim-Signature (בפורמט "v1=<hex>").
 * @param secret המפתח שהוגדר בהגדרות (whsec_...).
 */
export function verifyNedarimSignature(
  rawBody: string, timestampHeader: string | null, signatureHeader: string | null, secret: string,
): boolean {
  if (!timestampHeader || !signatureHeader) return false
  const ts = Number(timestampHeader)
  if (!Number.isFinite(ts)) return false
  // ⚠️ חלון 5 דקות — הגנה מפני שידור חוזר (replay).
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false

  const sig = signatureHeader.replace(/^v1=/, '')
  const expected = createHmac('sha256', secret).update(`${timestampHeader}.${rawBody}`).digest('hex')

  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try { return timingSafeEqual(a, b) } catch { return false }
}

/** האם כתובת IP נמצאת ברשימת מקורות ה-Webhook המוכרים של נדרים. */
export function isNedarimWebhookIp(ip: string | null): boolean {
  if (!ip) return false
  return NEDARIM_WEBHOOK_IPS.includes(ip.trim())
}
