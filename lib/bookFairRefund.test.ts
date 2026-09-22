import { describe, it, expect } from 'vitest'
import {
  planRefund, canRefund, refundAmountForLines,
  type RefundableOrder, type RefundableItem,
} from './bookFairRefund'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הבאג שהמודול הזה נולד כדי לסגור: כפתור "זוכה" בכרטיס ההזמנה שינה
// את הסטטוס והשאיר refunded_agorot על 0. ההזמנה נראתה מזוכה, וההכנסות
// (total - refunded) המשיכו לספור את הסכום המלא.
//
// הסיכון כאן הוא כסף, ולכן הטסטים מכסים בעיקר את הקצוות: זיכוי כפול,
// זיכוי מעבר ליתרה, ושקלים שהוזנו במקום אגורות.
// ─────────────────────────────────────────────────────────────────────────────

const ORDER: RefundableOrder = {
  status: 'paid',
  total_agorot: 12_500,      // 125 ₪
  shipping_agorot: 3_500,    // 35 ₪
  refunded_agorot: 0,
}

const ITEMS: RefundableItem[] = [
  { id: 'a', book_id: 'b1', title_snapshot: 'ספר א', quantity: 2, unit_price_agorot: 3_000, line_total_agorot: 6_000 },
  { id: 'b', book_id: 'b2', title_snapshot: 'ספר ב', quantity: 1, unit_price_agorot: 3_000, line_total_agorot: 3_000 },
]

describe('canRefund', () => {
  it('מאפשר זיכוי רק אחרי שנגבה כסף', () => {
    expect(canRefund('paid')).toBe(true)
    expect(canRefund('delivered')).toBe(true)
    expect(canRefund('partially_refunded')).toBe(true)
    expect(canRefund('payment_mismatch')).toBe(true)
  })

  it('🔴 חוסם הזמנה שלא שולמה — זיכוי כזה ממציא תנועה כספית', () => {
    expect(canRefund('pending_payment')).toBe(false)
    expect(canRefund('cancelled')).toBe(false)
    expect(canRefund('failed')).toBe(false)
  })

  it('חוסם הזמנה שכבר זוכתה במלואה', () => {
    expect(canRefund('refunded')).toBe(false)
  })
})

describe('planRefund — זיכוי מלא', () => {
  it('ברירת המחדל מזכה את כל היתרה ומסמנת refunded', () => {
    const p = planRefund(ORDER)
    expect(p.ok).toBe(true)
    expect(p.amountAgorot).toBe(12_500)
    expect(p.totalRefundedAgorot).toBe(12_500)
    expect(p.nextStatus).toBe('refunded')
    expect(p.isFull).toBe(true)
  })

  it('סכום מפורש השווה לסכום ההזמנה הוא זיכוי מלא', () => {
    const p = planRefund(ORDER, 12_500)
    expect(p.nextStatus).toBe('refunded')
    expect(p.isFull).toBe(true)
  })
})

describe('planRefund — זיכוי חלקי', () => {
  it('מסמן partially_refunded וצובר את הסכום', () => {
    const p = planRefund(ORDER, 3_000)
    expect(p.ok).toBe(true)
    expect(p.amountAgorot).toBe(3_000)
    expect(p.totalRefundedAgorot).toBe(3_000)
    expect(p.nextStatus).toBe('partially_refunded')
    expect(p.isFull).toBe(false)
  })

  it('🔴 הזיכוי מצטבר — זיכוי שני מחושב מול היתרה ולא מול הסכום המקורי', () => {
    const afterFirst: RefundableOrder = {
      ...ORDER, status: 'partially_refunded', refunded_agorot: 3_000,
    }
    // ברירת המחדל מזכה את היתרה (9,500) ולא את כל הסכום (12,500)
    const p = planRefund(afterFirst)
    expect(p.amountAgorot).toBe(9_500)
    expect(p.totalRefundedAgorot).toBe(12_500)
    expect(p.nextStatus).toBe('refunded')
  })

  it('זיכוי שמשלים בדיוק לסכום המלא הופך ל-refunded', () => {
    const afterFirst: RefundableOrder = {
      ...ORDER, status: 'partially_refunded', refunded_agorot: 10_000,
    }
    const p = planRefund(afterFirst, 2_500)
    expect(p.totalRefundedAgorot).toBe(12_500)
    expect(p.nextStatus).toBe('refunded')
    expect(p.isFull).toBe(true)
  })
})

describe('planRefund — חסימות', () => {
  it('🔴 חוסם זיכוי מעבר ליתרה', () => {
    const p = planRefund(ORDER, 20_000)
    expect(p.ok).toBe(false)
    expect(p.error).toContain('גבוה מהיתרה')
  })

  it('🔴 חוסם זיכוי כפול של הזמנה שכבר זוכתה במלואה', () => {
    const done: RefundableOrder = {
      ...ORDER, status: 'partially_refunded', refunded_agorot: 12_500,
    }
    const p = planRefund(done)
    expect(p.ok).toBe(false)
    expect(p.error).toContain('במלואה')
  })

  it('🔴 חוסם שבר — שקלים שהוזנו במקום אגורות הם זיכוי פי 100', () => {
    const p = planRefund(ORDER, 35.5)
    expect(p.ok).toBe(false)
    expect(p.error).toContain('שלם')
  })

  it('חוסם אפס ושלילי', () => {
    expect(planRefund(ORDER, 0).ok).toBe(false)
    expect(planRefund(ORDER, -100).ok).toBe(false)
  })

  it('חוסם הזמנה שלא שולמה', () => {
    const p = planRefund({ ...ORDER, status: 'pending_payment' })
    expect(p.ok).toBe(false)
    expect(p.error).toContain('ששולמה')
  })

  it('כשל אינו משנה את הסכום הצבור', () => {
    const p = planRefund({ ...ORDER, refunded_agorot: 3_000 }, 99_999)
    expect(p.ok).toBe(false)
    expect(p.totalRefundedAgorot).toBe(3_000)
  })
})

describe('refundAmountForLines', () => {
  it('מסכם לפי מחיר היחידה שנצרב', () => {
    const r = refundAmountForLines(ITEMS, [{ itemId: 'a', quantity: 2 }])
    expect(r.ok).toBe(true)
    expect(r.amountAgorot).toBe(6_000)
  })

  it('מסכם כמה שורות', () => {
    const r = refundAmountForLines(ITEMS, [
      { itemId: 'a', quantity: 1 },
      { itemId: 'b', quantity: 1 },
    ])
    expect(r.amountAgorot).toBe(6_000)
  })

  it('מוסיף משלוח רק כשמבקשים', () => {
    const lines = [{ itemId: 'a', quantity: 2 }, { itemId: 'b', quantity: 1 }]
    expect(refundAmountForLines(ITEMS, lines).amountAgorot).toBe(9_000)
    expect(
      refundAmountForLines(ITEMS, lines, { includeShipping: true, shippingAgorot: 3_500 }).amountAgorot,
    ).toBe(12_500)
  })

  it('🔴 חוסם החזרה של יותר ממה שנקנה', () => {
    const r = refundAmountForLines(ITEMS, [{ itemId: 'a', quantity: 5 }])
    expect(r.ok).toBe(false)
    expect(r.error).toContain('ספר א')
  })

  it('חוסם שורה שאינה בהזמנה', () => {
    expect(refundAmountForLines(ITEMS, [{ itemId: 'zzz', quantity: 1 }]).ok).toBe(false)
  })

  it('חוסם כמות לא שלמה או אפס', () => {
    expect(refundAmountForLines(ITEMS, [{ itemId: 'a', quantity: 1.5 }]).ok).toBe(false)
    expect(refundAmountForLines(ITEMS, [{ itemId: 'a', quantity: 0 }]).ok).toBe(false)
  })

  it('חוסם בחירה ריקה', () => {
    expect(refundAmountForLines(ITEMS, []).ok).toBe(false)
  })

  it('🔴 הסכום המלא של כל השורות + משלוח שווה בדיוק לסכום ההזמנה', () => {
    // אם זה נשבר, זיכוי "מלא לפי שורות" יחזיר סכום שונה מ-total_agorot
    const r = refundAmountForLines(
      ITEMS,
      ITEMS.map(i => ({ itemId: i.id, quantity: i.quantity })),
      { includeShipping: true, shippingAgorot: ORDER.shipping_agorot },
    )
    expect(r.amountAgorot).toBe(ORDER.total_agorot)
  })
})
