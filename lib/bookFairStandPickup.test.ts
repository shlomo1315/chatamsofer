import { describe, it, expect } from 'vitest'
import { classifyPickupQuery, normalizePhone, maskPhone, pickupState } from './bookFairStandPickup'

describe('classifyPickupQuery', () => {
  it('טלפון נייד — עם מקפים ורווחים', () => {
    expect(classifyPickupQuery('052-710 1315')).toEqual({ kind: 'phone', phone: '0527101315' })
  })
  it('טלפון בקידומת בינלאומית', () => {
    expect(classifyPickupQuery('+972527101315')).toEqual({ kind: 'phone', phone: '0527101315' })
  })
  it('נייח 9 ספרות', () => {
    expect(classifyPickupQuery('025371234')).toEqual({ kind: 'phone', phone: '025371234' })
  })
  it('מספר הזמנה מספרי', () => {
    expect(classifyPickupQuery('121213')).toEqual({ kind: 'order', orderNumber: '121213' })
  })
  it('קוד הזמנה עם אותיות — מנורמל לאותיות גדולות', () => {
    expect(classifyPickupQuery(' bf-26-3cvt2e ')).toEqual({ kind: 'order', orderNumber: 'BF-26-3CVT2E' })
  })
  it('תווי כיווניות מהעתקה מנוקים', () => {
    expect(classifyPickupQuery('‏121213‎')).toEqual({ kind: 'order', orderNumber: '121213' })
  })
  it('🔴 תווי wildcard/הזרקה נדחים', () => {
    expect(classifyPickupQuery('%')).toBeNull()
    expect(classifyPickupQuery('a,b.eq.1')).toBeNull()
    expect(classifyPickupQuery('*')).toBeNull()
  })
  it('ריק / קצר מדי', () => {
    expect(classifyPickupQuery('')).toBeNull()
    expect(classifyPickupQuery('12')).toBeNull()
  })
})

describe('normalizePhone', () => {
  it('מסיר כל תו שאינו ספרה', () => {
    expect(normalizePhone('(052) 710-1315')).toBe('0527101315')
  })
})

describe('maskPhone', () => {
  it('מציג 4 ספרות אחרונות בלבד', () => {
    expect(maskPhone('0527101315')).toBe('•••-1315')
  })
  it('ריק ⇒ null', () => {
    expect(maskPhone(null)).toBeNull()
    expect(maskPhone('12')).toBeNull()
  })
})

describe('pickupState', () => {
  const base = { delivery_method: 'pickup', picked_up_at: null }
  it('שולמה לאיסוף ⇒ ready', () => {
    expect(pickupState({ ...base, status: 'paid' })).toBe('ready')
    expect(pickupState({ ...base, status: 'packed' })).toBe('ready')
  })
  it('🔴 כבר נמסרה — גוברת על כל השאר', () => {
    expect(pickupState({ ...base, status: 'paid', picked_up_at: '2026-10-05T10:00:00Z' })).toBe('delivered')
    expect(pickupState({ ...base, status: 'delivered' })).toBe('delivered')
  })
  it('🔴 לא שולמה ⇒ unpaid ולא ready', () => {
    expect(pickupState({ ...base, status: 'pending_payment' })).toBe('unpaid')
    expect(pickupState({ ...base, status: 'payment_mismatch' })).toBe('unpaid')
  })
  it('משלוח ⇒ shipping', () => {
    expect(pickupState({ status: 'paid', delivery_method: 'shipping', picked_up_at: null })).toBe('shipping')
  })
  it('בוטלה/זוכתה ⇒ cancelled', () => {
    expect(pickupState({ ...base, status: 'cancelled' })).toBe('cancelled')
    expect(pickupState({ ...base, status: 'refunded' })).toBe('cancelled')
  })
})
