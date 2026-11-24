import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'

beforeAll(() => { process.env.OTP_NONCE_SECRET ||= 'test-secret-for-public-token' })
afterEach(() => { vi.useRealTimers(); delete process.env.NAME_FIX_LINK_DAYS })

describe('קישור השלמת שם (A7)', () => {
  it('ברירת מחדל 30 יום, ניתן לשינוי ב-env, ערך שגוי חוזר ל-30', async () => {
    const { nameFixLinkDays } = await import('./publicToken')
    expect(nameFixLinkDays()).toBe(30)
    process.env.NAME_FIX_LINK_DAYS = '45'
    expect(nameFixLinkDays()).toBe(45)
    process.env.NAME_FIX_LINK_DAYS = 'abc'
    expect(nameFixLinkDays()).toBe(30)
  })

  it('תקף אחרי 20 יום, פג אחרי 31 — ועדיין מפוענח לחידוש', async () => {
    const { signPublicToken, verifyPublicToken, aidIdFromSignedToken } = await import('./publicToken')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01'))
    const t = signPublicToken('n', 'aid-1')
    expect(t).not.toBe('')
    // A7.4: base64url — אין תווים שנשברים בהעתקה או בקידוד כתובת
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    vi.setSystemTime(new Date('2026-11-21'))
    expect(verifyPublicToken(t, 'n')).toBe('aid-1')
    vi.setSystemTime(new Date('2026-12-02'))
    expect(verifyPublicToken(t, 'n')).toBeNull()
    expect(aidIdFromSignedToken(t, 'n')).toBe('aid-1')
  })

  it('חידוש דורש חתימה אמיתית וסוג נכון', async () => {
    const { signPublicToken, aidIdFromSignedToken } = await import('./publicToken')
    const forged = Buffer.from(`n:aid-x:${Date.now()}:deadbeef`).toString('base64url')
    expect(aidIdFromSignedToken(forged, 'n')).toBeNull()
    expect(aidIdFromSignedToken(signPublicToken('g', 'aid-1'), 'n')).toBeNull()
    expect(aidIdFromSignedToken('', 'n')).toBeNull()
  })
})
