import { describe, it, expect } from 'vitest'
import { israelMonth, parseAmount, normalizeCallerPhone } from './centerMonthlyLoad'

describe('centerMonthlyLoad', () => {
  it('חודש לפי שעון ישראל, לא UTC', () => {
    // 31.10 בלילה UTC = 1.11 בישראל
    expect(israelMonth(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11')
    expect(israelMonth(new Date('2026-10-15T10:00:00Z'))).toBe('2026-10')
  })
  it('סכום: ברירת מחדל 600 וקבלת ערך תקין', () => {
    expect(parseAmount(null)).toBe(600)
    expect(parseAmount('abc')).toBe(600)
    expect(parseAmount(-5)).toBe(600)
    expect(parseAmount(750)).toBe(750)
    expect(parseAmount({ amount: 800 })).toBe(800)
  })
  it('נרמול טלפון', () => {
    expect(normalizeCallerPhone('972501234567')).toBe('0501234567')
    expect(normalizeCallerPhone('+972-50-123-4567')).toBe('0501234567')
    expect(normalizeCallerPhone('0501234567')).toBe('0501234567')
  })
})

describe('runMonthlyLoad: חריגה אחרי הפנייה לנדרים', () => {
  it('לא משחרר את החודש (עמום, אולי נטען) ולכן אין טעינה כפולה', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    vi.doMock('./nedarim', () => ({
      getNedarimCreds: async () => ({}), getMaternityLimitedId: async () => null,
      findClientByZeout: async () => null, saveClientCard: async () => null, setMagneticCard: async () => ({ ok: true }),
      addTlush: async () => { throw new Error('timeout') },
    }))
    const { runMonthlyLoad } = await import('./centerMonthlyLoad')
    const rpc = vi.fn(async (name: string) => (name === 'reserve_center_monthly_load' ? { data: 'ok', error: null } : { data: null, error: null }))
    const admin = { rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }
    const r = await runMonthlyLoad(admin as never, { center_id: 'c', center_name: 'מ', nedarim_client_id: '1' } as never)
    expect(r.result).toBe('error')
    expect(rpc.mock.calls.map(c => c[0])).not.toContain('release_center_monthly_load')
    vi.doUnmock('./nedarim')
  })
})
