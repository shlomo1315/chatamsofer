import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createVerifyToken, verifyVerifyToken } from './verifyToken'

describe('אסימון אימות מייל וטלפון', () => {
  beforeEach(() => { process.env.OTP_NONCE_SECRET = 'test-secret' })
  afterEach(() => { vi.useRealTimers() })

  it('אסימון תקין מאשר את הערך שאומת בלבד', () => {
    const t = createVerifyToken('email', 'A@b.com')
    expect(verifyVerifyToken(t, 'email', 'a@b.com')).toBe(true)
    expect(verifyVerifyToken(t, 'email', 'other@b.com')).toBe(false)
    expect(verifyVerifyToken(t, 'phone', 'a@b.com')).toBe(false)
  })
  it('אסימון שפג תוקפו נדחה', () => {
    vi.useFakeTimers()
    const t = createVerifyToken('phone', '0527101315')
    expect(verifyVerifyToken(t, 'phone', '0527101315')).toBe(true)
    vi.advanceTimersByTime(31 * 60 * 1000)
    expect(verifyVerifyToken(t, 'phone', '0527101315')).toBe(false)
  })
  it('אסימון מזויף או חסר נדחה', () => {
    const t = createVerifyToken('email', 'a@b.com')
    expect(verifyVerifyToken(t.slice(0, -2) + 'xx', 'email', 'a@b.com')).toBe(false)
    expect(verifyVerifyToken('', 'email', 'a@b.com')).toBe(false)
    expect(verifyVerifyToken(undefined, 'email', 'a@b.com')).toBe(false)
  })
})
