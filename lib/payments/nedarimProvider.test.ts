import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { NedarimPaymentProvider, verifyNedarimSignature, isNedarimWebhookIp } from './nedarimProvider'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 שכבת האבטחה של ה-Webhook: TransactionResponse בדפדפן ניתן לזיוף
// ע"י גולש עוין (ראו NedarimPlus-AP.md "אימות תשלום ואבטחה"). המקור
// האמין היחיד הוא ה-callback לשרת, ולכן verifyNedarimSignature ו-
// verifyCallback הן הפונקציות שבפועל מונעות סימון הזמנה כשולמה על סמך
// בקשה מזויפת. אין כאן מקום לטעות עדינה.
// ─────────────────────────────────────────────────────────────────────────────

const SECRET = 'whsec_' + 'a'.repeat(64)

function sign(ts: number, body: string, secret = SECRET) {
  return createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')
}

describe('verifyNedarimSignature', () => {
  it('חתימה תקינה עם timestamp עכשווי — מאושר', () => {
    const body = '{"TransactionId":"123"}'
    const ts = Math.floor(Date.now() / 1000)
    const sig = 'v1=' + sign(ts, body)
    expect(verifyNedarimSignature(body, String(ts), sig, SECRET)).toBe(true)
  })

  it('🔴 חתימה עם מפתח שגוי — נדחית', () => {
    const body = '{"TransactionId":"123"}'
    const ts = Math.floor(Date.now() / 1000)
    const sig = 'v1=' + sign(ts, body, 'whsec_' + 'b'.repeat(64))
    expect(verifyNedarimSignature(body, String(ts), sig, SECRET)).toBe(false)
  })

  it('🔴 גוף שונה מזה שנחתם — נדחה (הגנה על שינוי בדרך)', () => {
    const ts = Math.floor(Date.now() / 1000)
    const sig = 'v1=' + sign(ts, '{"Amount":"180"}')
    expect(verifyNedarimSignature('{"Amount":"18000"}', String(ts), sig, SECRET)).toBe(false)
  })

  it('🔴 timestamp ישן מדי (replay attack) — נדחה', () => {
    const body = '{"x":1}'
    const ts = Math.floor(Date.now() / 1000) - 400 // מעל 5 דקות
    const sig = 'v1=' + sign(ts, body)
    expect(verifyNedarimSignature(body, String(ts), sig, SECRET)).toBe(false)
  })

  it('timestamp בתוך החלון (4 דקות) — מאושר', () => {
    const body = '{"x":1}'
    const ts = Math.floor(Date.now() / 1000) - 240
    const sig = 'v1=' + sign(ts, body)
    expect(verifyNedarimSignature(body, String(ts), sig, SECRET)).toBe(true)
  })

  it('חסר timestamp או חתימה — נדחה', () => {
    expect(verifyNedarimSignature('{}', null, 'v1=abc', SECRET)).toBe(false)
    expect(verifyNedarimSignature('{}', '123', null, SECRET)).toBe(false)
  })

  it('פועל גם בלי קידומת v1=', () => {
    const body = '{"x":1}'
    const ts = Math.floor(Date.now() / 1000)
    const sig = sign(ts, body) // בלי v1=
    expect(verifyNedarimSignature(body, String(ts), sig, SECRET)).toBe(true)
  })
})

describe('isNedarimWebhookIp', () => {
  it('כתובת מהרשימה הרשמית — מוכרת', () => {
    expect(isNedarimWebhookIp('18.196.146.117')).toBe(true)
    expect(isNedarimWebhookIp('18.194.219.73')).toBe(true)
  })

  it('🔴 כתובת אחרת — לא מוכרת', () => {
    expect(isNedarimWebhookIp('1.2.3.4')).toBe(false)
  })

  it('ריק/null — לא מוכר', () => {
    expect(isNedarimWebhookIp(null)).toBe(false)
    expect(isNedarimWebhookIp('')).toBe(false)
  })
})

describe('verifyCallback', () => {
  const provider = new NedarimPaymentProvider()

  it('עסקה מוצלחת עם כל השדות — מאומתת', async () => {
    const r = await provider.verifyCallback({
      Status: 'OK', TransactionId: '999', Param2: 'BF-26-0001',
      Amount: '18.50', Confirmation: 'CONF123',
    })
    expect(r).not.toBeNull()
    expect(r!.orderId).toBe('BF-26-0001')
    expect(r!.transactionId).toBe('999')
    expect(r!.amountAgorot).toBe(1850)
    expect(r!.status).toBe('success')
  })

  // 🔴 סירוב הוא דיווח *תקין* ולא שגיאה.
  //
  // ⚠️ קודם הוחזר null, הראוט ענה 400, ונדרים פירשה זאת כ"הדיווח לא
  // התקבל" ושלחה שוב בלולאה — עד שוויתרה ושלחה מייל תקלה למוסד.
  // זה קרה ב-121208 ("גנוב החרם כרטיס").
  it('🔴 Status=Error — מוחזר כ-failed ולא כ-null (אחרת נדרים חוזרת בלולאה)', async () => {
    const r = await provider.verifyCallback({
      Status: 'Error', Message: 'כרטיס סורב', TransactionId: '999', Param2: 'BF-26-0001',
    })
    expect(r?.status).toBe('failed')
    expect(r?.orderId).toBe('BF-26-0001')
  })

  // ⚠️ בלי Param2 אי אפשר לדעת על איזו הזמנה מדובר — זו שגיאה אמיתית.
  it('סירוב בלי Param2 — נדחה', async () => {
    const r = await provider.verifyCallback({ Status: 'Error', Message: 'סורב' })
    expect(r).toBeNull()
  })

  it('🔴 חסר Confirmation (עסקה זמנית) — לא ראיה לתשלום, נדחה', async () => {
    const r = await provider.verifyCallback({
      Status: 'OK', TransactionId: '999', Param2: 'BF-26-0001', Amount: '18.50',
    })
    expect(r).toBeNull()
  })

  it('חסר TransactionId — נדחה', async () => {
    const r = await provider.verifyCallback({ Status: 'OK', Param2: 'BF-26-0001', Confirmation: 'C1' })
    expect(r).toBeNull()
  })

  it('חסר Param2 (מזהה ההזמנה שלנו) — נדחה', async () => {
    const r = await provider.verifyCallback({ Status: 'OK', TransactionId: '999', Confirmation: 'C1' })
    expect(r).toBeNull()
  })

  it('⚠️ פרטי כרטיס לא דולפים לתוך raw המסונן', async () => {
    const r = await provider.verifyCallback({
      Status: 'OK', TransactionId: '999', Param2: 'BF-26-0001',
      Amount: '10', Confirmation: 'C1', LastNum: '1234', CardNumber: '4111111111111111',
    })
    expect(JSON.stringify(r!.raw)).not.toContain('4111111111111111')
  })
})
