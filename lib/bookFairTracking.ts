// ─────────────────────────────────────────────────────────────────────────────
// דף מעקב ההזמנה — ציר השלבים ופרטי הקשר למשרד (לוגיקה טהורה).
//
// 🔴 שלושה שלבים בלבד, כמו שהלקוח חושב עליהם: נקלטה → נשלחה → התקבלה.
// הסטטוסים הפנימיים (ליקוט, אריזה) הם "נקלטה" מבחינתו.
//
// ⚠️ באיסוף עצמי השלב האמצעי הוא "מוכנה לאיסוף" ולא "נשלחה" — לא נשלח
// כלום, ו"נשלחה" היה שולח את הלקוח לחכות לדוור.
// ─────────────────────────────────────────────────────────────────────────────

export type TrackingStep = { label: string; done: boolean; current: boolean }

/** סטטוסים שבהם יש בכלל ציר להציג — ההזמנה שולמה והיא בדרך. */
const ACTIVE = ['paid', 'picking', 'packed', 'shipped', 'delivered', 'partially_refunded']

/**
 * כמה שלבים הושלמו (1–3), או null כשאין ציר להציג (לא שולמה / בוטלה).
 */
export function trackingStage(status: string, deliveryMethod: string): 1 | 2 | 3 | null {
  if (!ACTIVE.includes(status)) return null
  if (status === 'delivered') return 3
  if (status === 'shipped') return 2
  // ⚠️ באיסוף עצמי "ארוזה" = מוכנה לאיסוף. במשלוח "ארוזה" עדיין לא יצאה.
  if (status === 'packed' && deliveryMethod === 'pickup') return 2
  return 1
}

export function trackingSteps(status: string, deliveryMethod: string): TrackingStep[] | null {
  const stage = trackingStage(status, deliveryMethod)
  if (stage === null) return null
  const labels = deliveryMethod === 'pickup'
    ? ['נקלטה', 'מוכנה לאיסוף', 'נאספה']
    : ['נקלטה', 'נשלחה', 'התקבלה']
  return labels.map((label, i) => ({ label, done: i < stage, current: i === stage - 1 }))
}

/**
 * האם להציג את הודעת "תוך 14 ימי עסקים".
 *
 * ⚠️ רק במשלוח, ורק עד שנמסרה: אחרי המסירה ההודעה כבר לא נכונה, ובאיסוף
 * עצמי אין משלוח שיתעכב.
 */
export function showShippingEta(status: string, deliveryMethod: string): boolean {
  const stage = trackingStage(status, deliveryMethod)
  return deliveryMethod === 'shipping' && stage !== null && stage < 3
}

// ── פרטי הקשר למשרד ──────────────────────────────────────────────────────────

export const OFFICE_CONTACT_KEY = 'book_fair_office_contact'
export const DEFAULT_OFFICE_EMAIL = 'yerid@chasamsofer.info'

export type OfficeContact = { phone: string | null; email: string }

/** טלפון תקין לתצוגה: 9–10 ספרות שמתחילות ב-0. אחרת null. */
export function cleanOfficePhone(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/\D/g, '')
  return /^0\d{8,9}$/.test(d) ? d : null
}

/**
 * פענוח הערך מ-app_settings.
 *
 * ⚠️ app_settings.value היא עמודת text — הערך שמור כ-JSON מחרוזתי.
 * ערך פגום ⇒ מייל ברירת המחדל בלבד, בלי טלפון (לא ממציאים מספר).
 */
export function parseOfficeContact(raw: unknown): OfficeContact {
  let obj: Record<string, unknown> = {}
  try {
    obj = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>) ?? {}
  } catch { /* פגום */ }
  const email = String(obj?.email ?? '').trim()
  return {
    phone: cleanOfficePhone(obj?.phone),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : DEFAULT_OFFICE_EMAIL,
  }
}

/** 0527101315 → 052-710-1315 · 025371234 → 02-537-1234 */
export function formatIsraeliPhone(d: string): string {
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
  return d
}
