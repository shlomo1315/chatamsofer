import { describe, it, expect } from 'vitest'
import { parseOfficeOrder } from './bookFairOfficeOrder'

const base = { name: 'כהן', city_id: 'c1', address: 'הרב קוק 5' }

describe('parseOfficeOrder', () => {
  it('מקבל מייל בלי טלפון', () => {
    const r = parseOfficeOrder({ ...base, email: 'a@b.co' })
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ phone: null, email: 'a@b.co' }) })
  })
  it('מקבל טלפון בלי מייל', () => {
    const r = parseOfficeOrder({ ...base, phone: '052-1234567' })
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ phone: '0521234567', email: null }) })
  })
  it('דוחה כשאין טלפון ואין מייל', () => {
    expect(parseOfficeOrder({ ...base, phone: ' ' })).toEqual({ ok: false, error: 'חסר טלפון או מייל' })
  })
  it('דוחה מייל לא תקין', () => {
    expect(parseOfficeOrder({ ...base, email: 'abc' })).toEqual({ ok: false, error: 'כתובת המייל אינה תקינה' })
  })
})
