import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// הנתיב: הרשאה, אימות קלט, ו-409 בלי שום כתיבה כשהעץ השתנה מאז התצוגה המקדימה.

const nodes = [
  { id: 'root', name: 'מרן', parent_id: null, generation: 0, status: 'verified' },
  { id: 'a1', name: 'אברהם', parent_id: 'root', generation: 1, status: 'verified' },
  { id: 'a2', name: 'אברהם', parent_id: 'root', generation: 1, status: 'pending' },
]
let bens: { lineage_node_id: string }[] = []
let allowed = true

const mergeWithCascade = vi.fn(async (_db: unknown, o: { batchId: string }) =>
  ({ batchId: o.batchId, mergedCount: 1, cascadedCount: 0, reassignedChildren: 0, reassignedBeneficiaries: 0 }))
const undoMergeBatch = vi.fn(async () => 0)
const recalcGenerations = vi.fn(async () => {})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/apiAuth', () => ({
  requirePermission: async () => (allowed ? { userId: 'u1' } : null),
  forbidden: () => new Response('forbidden', { status: 403 }),
}))
vi.mock('@/lib/fetchAllRows', () => ({
  fetchAllRows: async (q: (f: number, t: number) => unknown) => {
    // מבחינים בין שתי הטבלאות לפי מה שהשאילתה מבקשת
    const src = q.toString()
    return { error: null, rows: src.includes('beneficiaries') ? bens : nodes }
  },
}))
vi.mock('@/lib/lineageMerge', async (orig) => ({
  ...(await orig<typeof import('@/lib/lineageMerge')>()),
  mergeWithCascade: (...a: Parameters<typeof mergeWithCascade>) => mergeWithCascade(...a),
  undoMergeBatch: () => undoMergeBatch(),
  recalcGenerations: () => recalcGenerations(),
}))
vi.mock('@/lib/lineageSync', () => ({ invalidateLineageCache: vi.fn() }))
vi.mock('@/lib/activityLog', () => ({ logActivity: vi.fn(async () => {}) }))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'

const route = await import('@/app/api/admin/lineage/generation-merge/route')
const post = (body: unknown) => route.POST(new NextRequest('http://x/api/admin/lineage/generation-merge', {
  method: 'POST', body: JSON.stringify(body),
}))

beforeEach(() => { vi.clearAllMocks(); bens = []; allowed = true })

describe('generation-merge route', () => {
  it('בלי הרשאה — 403', async () => {
    allowed = false
    expect((await route.GET()).status).toBe(403)
    expect((await post({ generation: 1, fingerprint: '0'.repeat(16) })).status).toBe(403)
  })

  it('קלט לא תקין — 400 בלי מיזוג', async () => {
    const res = await post({ generation: 'x' })
    expect(res.status).toBe(400)
    expect(mergeWithCascade).not.toHaveBeenCalled()
  })

  it('טביעה שלא תואמת — 409, ושום דבר לא נכתב', async () => {
    const preview = await (await route.GET()).json()
    bens = [{ lineage_node_id: 'a2' }]   // העץ השתנה אחרי התצוגה המקדימה
    const res = await post({ generation: preview.generation, fingerprint: preview.fingerprint })
    expect(res.status).toBe(409)
    expect(mergeWithCascade).not.toHaveBeenCalled()
    expect(recalcGenerations).not.toHaveBeenCalled()
  })

  it('טביעה תואמת — ממזג בדיוק את מה שהוצג', async () => {
    const preview = await (await route.GET()).json()
    expect(preview.generation).toBe(1)
    const res = await post({ generation: 1, fingerprint: preview.fingerprint })
    expect(res.status).toBe(200)
    expect(mergeWithCascade).toHaveBeenCalledTimes(1)
    expect(mergeWithCascade.mock.calls[0][1]).toMatchObject({ keepId: 'a1', mergeIds: ['a2'], cascadeUp: false, cascadeDown: false })
    expect(recalcGenerations).toHaveBeenCalledTimes(1)
  })

  it('כישלון במיזוג — ביטול אוטומטי ו-500', async () => {
    const preview = await (await route.GET()).json()
    mergeWithCascade.mockRejectedValueOnce(new Error('נפל'))
    const res = await post({ generation: 1, fingerprint: preview.fingerprint })
    expect(res.status).toBe(500)
    expect(undoMergeBatch).toHaveBeenCalledTimes(1)
    expect(recalcGenerations).not.toHaveBeenCalled()
  })
})
