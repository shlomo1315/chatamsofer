import { describe, it, expect } from 'vitest'
import { sanitizeProviderResponse } from './types'
import { MockPaymentProvider, mockShouldFail } from './mockProvider'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 סינון תשובת הספק לפני שמירה — הבדיקה שמונעת דליפת פרטי אשראי.
//
// תשובת סליקה גולמית שנשמרת במסד דולפת לכל גיבוי, לכל ייצוא, ולכל מי
// שיקרא את הטבלה. זו חשיפה שקטה: שום דבר לא נשבר, והנזק מתגלה מאוחר.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 sanitizeProviderResponse', () => {
  it('🔴 מסיר מספר כרטיס, קוד אימות ותוקף', () => {
    const out = sanitizeProviderResponse({
      cardNumber: '4580111122223333',
      cvv: '123',
      expiry: '12/28',
      tokef: '1228',
      status: 'OK',
    })
    expect(out.cardNumber).toBe('[הוסר]')
    expect(out.cvv).toBe('[הוסר]')
    expect(out.expiry).toBe('[הוסר]')
    expect(out.tokef).toBe('[הוסר]')
    expect(out.status).toBe('OK')
  })

  // ⚠️ ארבע ספרות אחרונות מותרות ושימושיות לזיהוי מול הלקוח
  it('⚠️ משאיר את ארבע הספרות האחרונות', () => {
    const out = sanitizeProviderResponse({ cardLast4: '3333', last4: '3333' })
    expect(out.cardLast4).toBe('3333')
    expect(out.last4).toBe('3333')
  })

  // ⚠️ ספקים עוטפים את התשובה בשכבות — מפתח רגיש בעומק היה נשמר במלואו
  it('⚠️ מסנן גם באובייקט מקונן', () => {
    const out = sanitizeProviderResponse({
      data: { payment: { pan: '4580111122223333', approval: 'A123' } },
    })
    const data = out.data as Record<string, Record<string, unknown>>
    expect(data.payment.pan).toBe('[הוסר]')
    expect(data.payment.approval).toBe('A123')
  })

  it('שומר שדות תקינים', () => {
    const out = sanitizeProviderResponse({
      transactionId: 'T123', amount: '45.90', approvalCode: '0012345', status: 'success',
    })
    expect(out).toEqual({ transactionId: 'T123', amount: '45.90', approvalCode: '0012345', status: 'success' })
  })

  it('עמיד לקלט שאינו אובייקט', () => {
    expect(sanitizeProviderResponse(null)).toEqual({})
    expect(sanitizeProviderResponse('טקסט')).toEqual({})
    expect(sanitizeProviderResponse(undefined)).toEqual({})
  })
})

describe('ספק מדומה', () => {
  it('יוצר חיוב ומחזיר כתובת הפניה', async () => {
    const p = new MockPaymentProvider()
    const r = await p.createCharge({ orderId: 'o1', orderNumber: 'BF-26-ABC123', amountAgorot: 12000 })
    expect(r.ok).toBe(true)
    expect(r.transactionId).toMatch(/^MOCK-/)
    expect(r.redirectUrl).toContain('/yerid/mock-payment')
  })

  it('דוחה סכום אפס', async () => {
    const p = new MockPaymentProvider()
    expect((await p.createCharge({ orderId: 'o1', orderNumber: 'X', amountAgorot: 0 })).ok).toBe(false)
  })

  it('מאמת דיווח ומחזיר הצלחה', async () => {
    const p = new MockPaymentProvider()
    const c = await p.createCharge({ orderId: 'o1', orderNumber: 'X', amountAgorot: 12000 })
    const v = await p.verifyCallback({ txn: c.transactionId!, order: 'o1' })
    expect(v).not.toBeNull()
    expect(v!.status).toBe('success')
    expect(v!.amountAgorot).toBe(12000)
    expect(v!.approvalCode).toBeTruthy()
  })

  // 🔴 בלי דרך לייצר כישלון, מסלול הכישלון לעולם אינו נבדק — ומתגלה
  // שבור רק כשכרטיס אמיתי נדחה אצל לקוח אמיתי
  it('🔴 סכום שמסתיים ב-13 אגורות נכשל — כדי שמסלול הכישלון ייבדק', async () => {
    expect(mockShouldFail(4513)).toBe(true)
    expect(mockShouldFail(4590)).toBe(false)

    const p = new MockPaymentProvider()
    const c = await p.createCharge({ orderId: 'o2', orderNumber: 'X', amountAgorot: 4513 })
    const v = await p.verifyCallback({ txn: c.transactionId!, order: 'o2' })
    expect(v!.status).toBe('failed')
    expect(v!.approvalCode).toBeNull()
  })

  it('כישלון מפורש בדיווח', async () => {
    const p = new MockPaymentProvider()
    const c = await p.createCharge({ orderId: 'o3', orderNumber: 'X', amountAgorot: 12000 })
    const v = await p.verifyCallback({ txn: c.transactionId!, order: 'o3', result: 'fail' })
    expect(v!.status).toBe('failed')
  })

  // ⚠️ גם הספק המדומה מתנהג כמו אמיתי: דיווח על עסקה שלא נוצרה נדחה
  it('⚠️ דוחה דיווח בלי מזהי עסקה', async () => {
    const p = new MockPaymentProvider()
    expect(await p.verifyCallback({})).toBeNull()
    expect(await p.verifyCallback({ txn: 'X' })).toBeNull()
  })

  it('🔴 הסכום נלקח מהעסקה השמורה ולא מהדיווח', async () => {
    const p = new MockPaymentProvider()
    const c = await p.createCharge({ orderId: 'o4', orderNumber: 'X', amountAgorot: 50000 })
    // דיווח שמנסה להצהיר על סכום נמוך יותר
    const v = await p.verifyCallback({ txn: c.transactionId!, order: 'o4', amount: '100' })
    expect(v!.amountAgorot).toBe(50000)
  })

  it('מזדהה כמדומה בתשובה', async () => {
    const p = new MockPaymentProvider()
    const c = await p.createCharge({ orderId: 'o5', orderNumber: 'X', amountAgorot: 12000 })
    const v = await p.verifyCallback({ txn: c.transactionId!, order: 'o5' })
    expect(JSON.stringify(v!.raw)).toContain('מדומה')
  })

  it('בדיקת חיבור מצהירה שאינה סליקה אמיתית', async () => {
    const r = await new MockPaymentProvider().testConnection()
    expect(r.ok).toBe(true)
    expect(r.message).toContain('לא מתבצעת סליקה אמיתית')
  })

  it('זיכוי', async () => {
    const p = new MockPaymentProvider()
    expect((await p.refund({ orderId: 'o1', transactionId: 'T', amountAgorot: 5000 })).ok).toBe(true)
    expect((await p.refund({ orderId: 'o1', transactionId: 'T', amountAgorot: 0 })).ok).toBe(false)
  })
})
