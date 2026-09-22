// בדיקות תבנית מייל אישור ההזמנה ביריד הספרים.
//
// ⚠️ שתי הבדיקות החשובות כאן הן הניטרול: שם לקוח ושם ספר נכנסים
// ישירות ל-HTML, ומייל נשלח לכתובת חיצונית — הזרקה כאן יוצאת מהמערכת.

import { describe, it, expect } from 'vitest'
import { bookFairOrderConfirmedEmail } from '@/lib/emailTemplates'

describe('bookFairOrderConfirmedEmail — רינדור', () => {
  const build = (over = {}) => bookFairOrderConfirmedEmail({
    orderNumber: 'YR-1042', customerName: 'ישראל כהן',
    items: [
      { title: 'משנה ברורה', quantity: 1, lineTotalAgorot: 18_000 },
      { title: 'חומש עם רש״י', quantity: 2, lineTotalAgorot: 9_000 },
    ],
    itemsTotalAgorot: 27_000, shippingAgorot: 3_500, totalAgorot: 30_500,
    deliveryMethod: 'shipping', address: 'הרב קוק 10', cityName: 'בני ברק',
    trackingToken: 'TOKEN123', ...over,
  })

  it('מייצר נושא וגוף', () => {
    const m = build()
    expect(m.subject).toContain('YR-1042')
    expect(m.html).toContain('<!DOCTYPE html')
    expect(m.html.length).toBeGreaterThan(1000)
  })

  it('הסכומים מוצגים בשקלים', () => {
    const m = build()
    expect(m.html).toContain('₪180')
    expect(m.html).toContain('₪305')
    expect(m.html).toContain('₪35')
  })

  it('הספרים והכמות מופיעים', () => {
    const m = build()
    expect(m.html).toContain('משנה ברורה')
    expect(m.html).toContain('× 2')
  })

  it('כפתור המעקב מכיל את הטוקן', () => {
    expect(build().html).toContain('/yerid/order/TOKEN123')
  })

  it('בלי טוקן — אין כפתור מעקב ואין קריסה', () => {
    const m = build({ trackingToken: null })
    expect(m.html).not.toContain('/yerid/order/')
    expect(m.html).toContain('YR-1042')
  })

  it('איסוף עצמי — בלי כתובת', () => {
    const m = build({ deliveryMethod: 'pickup', address: null, cityName: null })
    expect(m.html).not.toContain('הרב קוק')
  })

  it('משלוח חינם נאמר במפורש', () => {
    expect(build({ shippingAgorot: 0 }).html).toContain('חינם')
  })

  it('🔴 שם עם HTML מנוטרל', () => {
    const m = build({ customerName: '<script>alert(1)</script>' })
    expect(m.html).not.toContain('<script>alert')
    expect(m.html).toContain('&lt;script&gt;')
  })

  it('🔴 שם ספר עם HTML מנוטרל', () => {
    const m = build({ items: [{ title: '<img src=x onerror=alert(1)>', quantity: 1, lineTotalAgorot: 100 }] })
    expect(m.html).not.toContain('<img src=x')
  })

  it('בלי שם לקוח — נופל לפנייה כללית', () => {
    const m = build({ customerName: null })
    expect(m.html).toContain('שלום רב')
  })

  it('אגורות שאינן עגולות מוצגות בשתי ספרות', () => {
    const m = build({ totalAgorot: 30_550 })
    expect(m.html).toContain('₪305.50')
  })
})
