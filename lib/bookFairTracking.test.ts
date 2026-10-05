import { describe, it, expect } from 'vitest'
import {
  trackingStage, trackingSteps, showShippingEta,
  parseOfficeContact, cleanOfficePhone, formatIsraeliPhone, DEFAULT_OFFICE_EMAIL,
} from './bookFairTracking'

describe('trackingStage', () => {
  it('שולמה / בליקוט ⇒ נקלטה', () => {
    expect(trackingStage('paid', 'shipping')).toBe(1)
    expect(trackingStage('picking', 'shipping')).toBe(1)
  })
  it('🔴 ארוזה במשלוח — עדיין "נקלטה" (לא יצאה)', () => {
    expect(trackingStage('packed', 'shipping')).toBe(1)
  })
  it('🔴 ארוזה באיסוף — "מוכנה לאיסוף"', () => {
    expect(trackingStage('packed', 'pickup')).toBe(2)
  })
  it('נשלחה / נמסרה', () => {
    expect(trackingStage('shipped', 'shipping')).toBe(2)
    expect(trackingStage('delivered', 'shipping')).toBe(3)
    expect(trackingStage('delivered', 'pickup')).toBe(3)
  })
  it('🔴 לא שולמה / בוטלה ⇒ אין ציר', () => {
    for (const s of ['pending_payment', 'payment_mismatch', 'failed', 'cancelled', 'refunded']) {
      expect(trackingStage(s, 'shipping')).toBeNull()
    }
  })
})

describe('trackingSteps', () => {
  it('משלוח: נקלטה → נשלחה → התקבלה', () => {
    const s = trackingSteps('shipped', 'shipping')!
    expect(s.map(x => x.label)).toEqual(['נקלטה', 'נשלחה', 'התקבלה'])
    expect(s.map(x => x.done)).toEqual([true, true, false])
    expect(s.map(x => x.current)).toEqual([false, true, false])
  })
  it('🔴 איסוף: השלב האמצעי "מוכנה לאיסוף" ולא "נשלחה"', () => {
    expect(trackingSteps('paid', 'pickup')!.map(x => x.label)).toEqual(['נקלטה', 'מוכנה לאיסוף', 'נאספה'])
  })
})

describe('showShippingEta', () => {
  it('משלוח שטרם נמסר ⇒ מוצגת', () => {
    expect(showShippingEta('paid', 'shipping')).toBe(true)
    expect(showShippingEta('shipped', 'shipping')).toBe(true)
  })
  it('🔴 אחרי מסירה ⇒ לא מוצגת', () => {
    expect(showShippingEta('delivered', 'shipping')).toBe(false)
  })
  it('🔴 איסוף עצמי ⇒ לא מוצגת', () => {
    expect(showShippingEta('paid', 'pickup')).toBe(false)
  })
  it('לא שולמה ⇒ לא מוצגת', () => {
    expect(showShippingEta('pending_payment', 'shipping')).toBe(false)
  })
})

describe('פרטי קשר למשרד', () => {
  it('ערך תקין (JSON מחרוזתי כפי שב-app_settings)', () => {
    expect(parseOfficeContact('{"phone":"03-123-4567","email":"a@b.co"}'))
      .toEqual({ phone: '031234567', email: 'a@b.co' })
  })
  it('🔴 ערך פגום ⇒ מייל ברירת מחדל ובלי טלפון (לא ממציאים)', () => {
    expect(parseOfficeContact('[object Object]')).toEqual({ phone: null, email: DEFAULT_OFFICE_EMAIL })
    expect(parseOfficeContact(null)).toEqual({ phone: null, email: DEFAULT_OFFICE_EMAIL })
  })
  it('טלפון לא תקין נזרק', () => {
    expect(cleanOfficePhone('12345')).toBeNull()
    expect(cleanOfficePhone('0527101315')).toBe('0527101315')
  })
  it('עיצוב לתצוגה', () => {
    expect(formatIsraeliPhone('0527101315')).toBe('052-710-1315')
    expect(formatIsraeliPhone('025371234')).toBe('02-537-1234')
  })
})
