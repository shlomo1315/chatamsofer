import { describe, it, expect } from 'vitest'
import { claimCardLoad } from './cardLoadClaim'

// מקליט את השרשור שנבנה ל-PATCH, ומחזיר תוצאה קבועה
function recorder(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = []
  const q: Record<string, unknown> = {}
  for (const m of ['update', 'eq', 'is', 'lt', 'in', 'or', 'select'])
    q[m] = (...a: unknown[]) => { calls.push([m, a]); return q }
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return { db: { from: () => q } as never, calls }
}

describe('claimCardLoad — נעילה בלי or()', () => {
  it('אף פעם לא שולח or() (נדחה ב-PostgREST 13)', async () => {
    for (const st of [null, 'idle', 'failed', 'unloaded', 'pending']) {
      const { db, calls } = recorder({ data: [{ id: 'a1' }], error: null })
      expect(await claimCardLoad(db, 'a1', st, {})).toEqual({ claimed: true })
      expect(calls.some(([m]) => m === 'or')).toBe(false)
    }
  })

  it('התנאי לפי המצב שנקרא', async () => {
    const nul = recorder({ data: [{ id: 'a1' }], error: null })
    await claimCardLoad(nul.db, 'a1', undefined, {})
    expect(nul.calls).toContainEqual(['is', ['card_load_status', null]])

    const failed = recorder({ data: [{ id: 'a1' }], error: null })
    await claimCardLoad(failed.db, 'a1', 'failed', {})
    expect(failed.calls).toContainEqual(['eq', ['card_load_status', 'failed']])

    const pending = recorder({ data: [{ id: 'a1' }], error: null })
    await claimCardLoad(pending.db, 'a1', 'pending', {})
    expect(pending.calls).toContainEqual(['eq', ['card_load_status', 'pending']])
    expect(pending.calls.some(([m, a]) => m === 'lt' && a[0] === 'updated_at')).toBe(true)
  })

  it('תיק שכבר נטען — לא שולח בקשה בכלל', async () => {
    const { db, calls } = recorder({ data: [], error: null })
    expect(await claimCardLoad(db, 'a1', 'loaded', {})).toEqual({ claimed: false })
    expect(calls).toHaveLength(0)
  })

  it('שגיאת מסד מוחזרת, לא נבלעת כ"תפוס"', async () => {
    const { db } = recorder({ data: null, error: { message: 'column does not exist' } })
    expect(await claimCardLoad(db, 'a1', 'idle', {})).toEqual({ claimed: false, error: 'column does not exist' })
  })

  it('קריאה אחרת כבר נעלה → לא נתפס', async () => {
    const { db } = recorder({ data: [], error: null })
    expect(await claimCardLoad(db, 'a1', null, {})).toEqual({ claimed: false })
  })
})
