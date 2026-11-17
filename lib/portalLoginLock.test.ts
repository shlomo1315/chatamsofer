import { describe, it, expect } from 'vitest'
import { EMPTY_LOCK, afterFailure, isBlocked, failureMessage, blockedMessage, SHORT_BLOCK_MS, LONG_BLOCK_MS } from './portalLoginLock'

describe('נעילת ניסיונות סיסמה', () => {
  it('רצף: 2 נותרו ← 1 נותר ← חסימה 3 שעות ← חסימה 24 שעות', () => {
    const t0 = 1_000_000
    const s1 = afterFailure(EMPTY_LOCK, t0)
    expect(isBlocked(s1, t0)).toBe(false)
    expect(failureMessage(s1, t0)).toBe('סיסמה שגויה, נותרו לך עוד 2 ניסיונות')
    const s2 = afterFailure(s1, t0)
    expect(failureMessage(s2, t0)).toBe('סיסמה שגויה, נותר לך עוד ניסיון אחד')
    const s3 = afterFailure(s2, t0)
    expect(isBlocked(s3, t0)).toBe(true)
    expect(s3.blockedUntil).toBe(t0 + SHORT_BLOCK_MS)
    expect(blockedMessage(s3, t0 + 60 * 60 * 1000)).toContain('2 שעות')
    expect(isBlocked(s3, t0 + SHORT_BLOCK_MS + 1)).toBe(false)
    const t1 = t0 + SHORT_BLOCK_MS + 1
    const s4 = afterFailure(s3, t1)
    expect(s4.blockedUntil).toBe(t1 + LONG_BLOCK_MS)
    expect(failureMessage(s4, t1)).toContain('24 שעות')
  })

  it('אחרי 24 שעות שגיאה נוספת חוסמת שוב ל-24 שעות', () => {
    const s = { fails: 0, level: 2, blockedUntil: 100 }
    expect(afterFailure(s, 200).blockedUntil).toBe(200 + LONG_BLOCK_MS)
  })
})

describe('guardedPasswordCheck (מסד מדומה)', () => {
  it('סיסמה נכונה מאפסת, ובזמן חסימה גם נכונה נדחית', async () => {
    const { vi } = await import('vitest')
    const rows = new Map<string, any>()
    vi.resetModules()
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => {
          const q: any = {}
          q.select = () => q
          q.eq = (c: string, v: string) => { q[c] = v; return q }
          q.maybeSingle = async () => ({ data: rows.get(`${q.scope}|${q.ip}`) ?? null })
          q.upsert = async (r: any) => { rows.set(`${r.scope}|${r.ip}`, r) }
          return q
        },
      }),
    }))
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    const m = await import('./portalLoginLock')
    const bad = async () => false, good = async () => true
    expect((await m.guardedPasswordCheck('s', '1.1.1.1', bad))?.error).toContain('2 ניסיונות')
    expect((await m.guardedPasswordCheck('s', '1.1.1.1', good))).toBeNull()
    expect((await m.guardedPasswordCheck('s', '1.1.1.1', bad))?.error).toContain('2 ניסיונות')
    await m.guardedPasswordCheck('s', '1.1.1.1', bad)
    const third = await m.guardedPasswordCheck('s', '1.1.1.1', bad)
    expect(third?.status).toBe(429)
    expect((await m.guardedPasswordCheck('s', '1.1.1.1', good))?.status).toBe(429)
    expect(await m.guardedPasswordCheck('s', '2.2.2.2', good)).toBeNull()
  })
})
