// ─────────────────────────────────────────────────────────────────────────────
// ממשק ספק הסליקה — הפשטה אחת לכל המחלקה.
//
// 🔴 הסיבה לקיומו: פרטי נדרים (קוד מוסד, טוקן, סוג המוצר שאושר) אינם
// ידועים בזמן הבנייה, והמשתמש יזין אותם בעצמו במסך ההגדרות. בלי הפשטה,
// כל החנות הייתה ממתינה להם. עם הפשטה — בונים ובודקים הכול מול ספק
// מדומה, ומחליפים אותו כשהפרטים מגיעים.
//
// ⚠️ המימוש היחיד שנוגע ברשת הוא הספק עצמו. הלוגיקה מקבלת ספק כפרמטר
// ואינה מייבאת אותו — כך היא נבדקת ביחידה בלי רשת ובלי מסד.
// ─────────────────────────────────────────────────────────────────────────────

/** בקשת חיוב. כל הסכומים באגורות. */
export interface ChargeRequest {
  orderId: string
  orderNumber: string
  amountAgorot: number
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  /** לאן להחזיר את הלקוח אחרי התשלום (מסלול האתר בלבד). */
  returnUrl?: string
  description?: string
}

export interface ChargeResult {
  ok: boolean
  /**
   * כתובת דף הסליקה. 🔴 העדפה מוחלטת לדף מתארח: כשהלקוח מקליד את
   * הכרטיס אצל הספק, הוא לעולם אינו נוגע בשרת שלנו ואיננו נכנסים
   * לחובות אבטחת כרטיסי אשראי.
   */
  redirectUrl?: string
  /** מזהה העסקה אצל הספק, אם הוחזר מיד. */
  transactionId?: string
  error?: string
}


/** מה שהספק דיווח בקריאה חוזרת, אחרי שאומת. */
export interface VerifiedCharge {
  orderId: string
  transactionId: string
  amountAgorot: number
  /** מספר אישור — אצל חלק מהספקים זה כל מה שחוזר. */
  approvalCode?: string | null
  status: 'success' | 'failed'
  /** ⚠️ אחרי סינון — ללא מספר כרטיס, קוד אימות או תוקף. */
  raw?: Record<string, unknown>
}

export interface RefundRequest {
  orderId: string
  transactionId: string
  amountAgorot: number
  reason?: string
}

export interface RefundResult {
  ok: boolean
  refundId?: string
  error?: string
  /** ⚠️ true כשהספק אינו תומך בזיכוי דרך הממשק — צריך לבצע ידנית. */
  manualRequired?: boolean
}

export interface PaymentProvider {
  readonly name: string

  /** האם הוגדרו פרטי התחברות תקינים. */
  isConfigured(): Promise<boolean>

  /** בדיקת חיבור אמיתית — מה שמאחורי כפתור "בדיקת חיבור" בהגדרות. */
  testConnection(): Promise<{ ok: boolean; message: string }>

  createCharge(req: ChargeRequest): Promise<ChargeResult>

  /**
   * 🔴 אימות דיווח מהספק. הדיווח עצמו אינו נאמן: הוא מגיע בבקשת רשת
   * שכל אחד יכול לשלוח. המימוש חייב לאמת מול הספק (או לאמת חתימה)
   * לפני שהוא מחזיר תוצאה — הזמנה מסומנת כשולמה רק על סמך זה.
   */
  verifyCallback(raw: Record<string, unknown>): Promise<VerifiedCharge | null>

  refund(req: RefundRequest): Promise<RefundResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// סינון תשובת הספק לפני שמירה
// ─────────────────────────────────────────────────────────────────────────────

/**
 * מפתחות שנראים כנתוני כרטיס. ההשוואה על שם המפתח בלבד — אנחנו לא
 * מנחשים לפי תוכן, כדי לא למחוק בטעות שדות תקינים.
 */
const SENSITIVE = /card|pan|cvv|cvc|expir|tokef|mispar_kartis|kartis|track|magnetic/i

/**
 * 🔴 מסנן תשובת ספק לפני שמירה במסד.
 *
 * ⚠️ שמירת תשובת סליקה גולמית היא חשיפת פרטי אשראי בשורת מסד — הם
 * ידלפו לכל גיבוי, לכל ייצוא, ולכל מי שיקרא את הטבלה. ארבע הספרות
 * האחרונות מותרות ושימושיות לזיהוי, ולכן מפתח שמכיל 'last' נשמר.
 */
export function sanitizeProviderResponse(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (SENSITIVE.test(k) && !/last|4\s*digits|arba/i.test(k)) {
      out[k] = '[הוסר]'
      continue
    }
    // ⚠️ רקורסיה על אובייקטים מקוננים: ספקים עוטפים את התשובה בכמה שכבות,
    // ומפתח רגיש בעומק היה נשמר במלואו.
    out[k] = (v && typeof v === 'object' && !Array.isArray(v))
      ? sanitizeProviderResponse(v)
      : v
  }
  return out
}
