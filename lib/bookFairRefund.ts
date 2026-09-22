// ─────────────────────────────────────────────────────────────────────────────
// זיכוי הזמנה ביריד הספרים — החישוב והכללים.
//
// 🔴 הרקע: עד היום היה אפשר ללחוץ "זוכה" בכרטיס ההזמנה, הסטטוס השתנה,
// ו-refunded_agorot נשאר 0. התוצאה: ההזמנה מסומנת כמזוכה, וההכנסות
// בלוח הבקרה (total - refunded) ממשיכות לספור את הסכום המלא. באג כסף
// שקט — אף שגיאה, אף התראה, רק מספר שגוי בדוח.
//
// ⚠️ המודול הזה הוא חישוב טהור בלבד, בלי גישה למסד. כך אפשר לבדוק את
// כללי הכסף בטסטים, והם הדבר היחיד כאן שאסור לטעות בו.
// ─────────────────────────────────────────────────────────────────────────────

import type { BookFairOrderStatus } from '@/types/bookFair'

/** שורת הזמנה לצורך חישוב זיכוי. */
export interface RefundableItem {
  id: string
  book_id: string | null
  title_snapshot: string
  quantity: number
  unit_price_agorot: number
  line_total_agorot: number
}

export interface RefundableOrder {
  status: BookFairOrderStatus
  total_agorot: number
  shipping_agorot: number
  refunded_agorot: number
}

/** כמה עותקים להחזיר מכל ספר, לפי שורת הזמנה. */
export interface RefundLine {
  itemId: string
  quantity: number
}

export interface RefundPlan {
  ok: boolean
  error?: string
  /** הסכום לזיכוי בפעולה הזו. */
  amountAgorot: number
  /** סך הזיכוי המצטבר אחרי הפעולה. */
  totalRefundedAgorot: number
  /** הסטטוס שההזמנה תקבל. */
  nextStatus: BookFairOrderStatus
  /** האם זהו זיכוי מלא של כל ההזמנה. */
  isFull: boolean
}

/**
 * סטטוסים שניתן לזכות מהם.
 *
 * ⚠️ רק הזמנה שבה נגבה כסף בפועל. זיכוי של הזמנה שלא שולמה אינו
 * "תיקון" אלא המצאה של תנועה כספית שלא הייתה — וההכנסות היו יורדות
 * מתחת למה שנכנס בפועל.
 */
const REFUNDABLE: BookFairOrderStatus[] = [
  'paid', 'picking', 'packed', 'shipped', 'delivered',
  'payment_mismatch', 'partially_refunded',
]

export function canRefund(status: BookFairOrderStatus): boolean {
  return REFUNDABLE.includes(status)
}

/**
 * בונה תוכנית זיכוי ומאמת אותה.
 *
 * 🔴 מחזיר שגיאה ולא זורק: הקורא הוא ראוט שצריך להחזיר 400 עם הסבר,
 * ולא 500.
 *
 * @param amountAgorot סכום לזיכוי. undefined = זיכוי מלא של היתרה.
 */
export function planRefund(
  order: RefundableOrder,
  amountAgorot?: number,
): RefundPlan {
  const fail = (error: string): RefundPlan => ({
    ok: false, error, amountAgorot: 0,
    totalRefundedAgorot: order.refunded_agorot,
    nextStatus: order.status, isFull: false,
  })

  if (!canRefund(order.status)) {
    return fail('לא ניתן לזכות הזמנה במצב זה — זיכוי אפשרי רק להזמנה ששולמה')
  }

  // היתרה שטרם זוכתה. זו התקרה, ולא total_agorot: בזיכוי חלקי שני
  // הסכום כבר קטן.
  const remaining = order.total_agorot - order.refunded_agorot
  if (remaining <= 0) {
    return fail('ההזמנה זוכתה במלואה')
  }

  // ⚠️ ברירת המחדל היא זיכוי מלא של *היתרה*, לא של הסכום המקורי.
  const amount = amountAgorot === undefined ? remaining : amountAgorot

  if (!Number.isInteger(amount)) {
    // 🔴 אגורות הן מספר שלם. שבר כאן פירושו שמישהו העביר שקלים
    // במקום אגורות, וזיכוי של פי 100 מהנדרש.
    return fail('סכום הזיכוי חייב להיות מספר שלם של אגורות')
  }
  if (amount <= 0) return fail('סכום הזיכוי חייב להיות גדול מאפס')
  if (amount > remaining) {
    return fail(`סכום הזיכוי (${amount}) גבוה מהיתרה שטרם זוכתה (${remaining})`)
  }

  const totalRefunded = order.refunded_agorot + amount
  const isFull = totalRefunded >= order.total_agorot

  return {
    ok: true,
    amountAgorot: amount,
    totalRefundedAgorot: totalRefunded,
    nextStatus: isFull ? 'refunded' : 'partially_refunded',
    isFull,
  }
}

/**
 * מחשב את סכום הזיכוי לפי שורות שנבחרו להחזרה.
 *
 * ⚠️ המשלוח אינו מוחזר אוטומטית בהחזרה חלקית: הוא כבר בוצע. בהחזרה
 * מלאה הקורא מעביר includeShipping.
 */
export function refundAmountForLines(
  items: RefundableItem[],
  lines: RefundLine[],
  opts: { includeShipping?: boolean; shippingAgorot?: number } = {},
): { ok: boolean; error?: string; amountAgorot: number } {
  let sum = 0

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      return { ok: false, error: 'כמות להחזרה חייבת להיות מספר שלם חיובי', amountAgorot: 0 }
    }
    const item = items.find(i => i.id === line.itemId)
    if (!item) {
      return { ok: false, error: 'שורת הזמנה לא נמצאה', amountAgorot: 0 }
    }
    if (line.quantity > item.quantity) {
      return {
        ok: false,
        error: `לא ניתן להחזיר ${line.quantity} מתוך ${item.quantity} — "${item.title_snapshot}"`,
        amountAgorot: 0,
      }
    }
    // ⚠️ מחיר היחידה מהצילום ולא מהקטלוג: הספר יכול היה להתייקר מאז,
    // והלקוח מקבל בחזרה בדיוק את מה ששילם.
    sum += item.unit_price_agorot * line.quantity
  }

  if (opts.includeShipping) sum += opts.shippingAgorot ?? 0

  if (sum <= 0) {
    return { ok: false, error: 'לא נבחר דבר להחזרה', amountAgorot: 0 }
  }
  return { ok: true, amountAgorot: sum }
}
