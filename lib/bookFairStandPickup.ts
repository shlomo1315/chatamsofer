// ─────────────────────────────────────────────────────────────────────────────
// איסוף עצמי בדוכן היריד — לוגיקה טהורה (נבדקת ב-bookFairStandPickup.test.ts).
//
// 🔴 זו הפעם הראשונה שאזור המוכרים רואה נתוני לקוח. לכן החשיפה מצומצמת
// בכוונה:
//   · התאמה מדויקת בלבד (מספר הזמנה שלם או טלפון שלם) — אין חיפוש חלקי
//     שמאפשר לדפדף בלקוחות.
//   · רק הזמנות לאיסוף עצמי.
//   · שם + 4 ספרות אחרונות של הטלפון. בלי כתובת, בלי מייל, בלי טלפון מלא.
// ─────────────────────────────────────────────────────────────────────────────

export type PickupQuery =
  | { kind: 'phone'; phone: string }
  | { kind: 'order'; orderNumber: string }

/** נרמול טלפון ישראלי לצורה שבמסד: 0XXXXXXXXX. */
export function normalizePhone(raw: string): string {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.startsWith('972')) d = '0' + d.slice(3)
  return d
}

/**
 * מה הוקלד: טלפון או מספר הזמנה.
 *
 * ⚠️ ההבחנה לפי אורך: מספרי הזמנה הם 6 ספרות (121213) או קוד עם אותיות
 * (BF-26-XXXXXX), וטלפון ישראלי הוא 9–10 ספרות. ספרות בלבד באורך 9+ ⇒ טלפון.
 */
export function classifyPickupQuery(raw: string): PickupQuery | null {
  const q = String(raw ?? '').replace(/[‎‏‪-‮⁦-⁩]/g, '').trim()
  if (!q) return null
  const digitsOnly = /^[\d\s\-+()]+$/.test(q)
  if (digitsOnly) {
    const phone = normalizePhone(q)
    if (/^0\d{8,9}$/.test(phone)) return { kind: 'phone', phone }
    if (/^\d{3,8}$/.test(phone)) return { kind: 'order', orderNumber: phone }
    return null
  }
  // קוד עם אותיות — רק תווים שמספר הזמנה מכיל בפועל.
  const code = q.toUpperCase()
  if (!/^[A-Z0-9-]{3,40}$/.test(code)) return null
  return { kind: 'order', orderNumber: code }
}

/** 4 ספרות אחרונות בלבד — מספיק לזיהוי מול הלקוח, לא לשחזור המספר. */
export function maskPhone(phone: string | null | undefined): string | null {
  const d = String(phone ?? '').replace(/\D/g, '')
  if (d.length < 4) return null
  return `•••-${d.slice(-4)}`
}

/** סטטוסים שבהם ההזמנה שולמה וממתינה למסירה. */
export const PICKUP_READY_STATUSES = ['paid', 'picking', 'packed', 'partially_refunded'] as const

export type PickupState =
  | 'ready'       // שולמה, לאיסוף, טרם נמסרה
  | 'delivered'   // כבר נמסרה
  | 'unpaid'      // טרם שולמה — אין למסור
  | 'shipping'    // הזמנה למשלוח, לא לאיסוף
  | 'cancelled'   // בוטלה / נכשלה / זוכתה במלואה

export function pickupState(o: {
  status: string
  delivery_method: string
  picked_up_at?: string | null
}): PickupState {
  if (o.picked_up_at || o.status === 'delivered') return 'delivered'
  if (['cancelled', 'failed', 'refunded'].includes(o.status)) return 'cancelled'
  if (o.delivery_method !== 'pickup') return 'shipping'
  if ((PICKUP_READY_STATUSES as readonly string[]).includes(o.status)) return 'ready'
  return 'unpaid'
}
