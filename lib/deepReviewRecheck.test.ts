import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildApprovedRefTree } from './lineageApprovedRef'
import { planDeepReviewRecheck, type RecheckBen } from './deepReviewRecheck'
import type { GapNode } from './deepReviewGaps'

// חישוב מחדש מרוכז (24.11): מי שהסדירה היום את סדר הדורות עוברת ל"ממתין",
// מי שלא, נשארת עם סיבה מעודכנת, וסיבה שהמזכירות הקלידה לא נוגעים בה.

const REF = [
  { key: 'r1', name: 'חתם סופר', generation: 1, parent_key: null },
  { key: 'r2', name: 'שמעון', generation: 2, parent_key: 'r1' },
  { key: 'r3', name: 'יוסף', generation: 3, parent_key: 'r2' },
  { key: 'r4', name: 'משה', generation: 4, parent_key: 'r3' },
  { key: 'r5', name: 'אביגדור', generation: 5, parent_key: 'r4' },
]

const NODES: GapNode[] = [
  { id: 'n1', name: 'מרן החתם סופר זי"ע', parent_id: null, generation: 1 },
  { id: 'n2', name: 'שמעון', parent_id: 'n1', generation: 2 },
  { id: 'n3', name: 'יוסף', parent_id: 'n2', generation: 3 },
  { id: 'n4', name: 'משה', parent_id: 'n3', generation: 4 },
  { id: 'n5', name: 'אביגדור', parent_id: 'n4', generation: 5 },
  // ענף שאינו בקובץ המאושר
  { id: 'x4', name: 'בנימין', parent_id: 'n3', generation: 4 },
  { id: 'y5', name: 'אביגדור', parent_id: 'x4', generation: 5 },
]

const WRONG_REASON = 'דור 2–5 אינו בקובץ המאושר (דור 4: בנימין)'

const ben = (id: string, node: string | null, reason: string | null, status = 'deep_review'): RecheckBen => ({
  id, id_number: null, full_name: 'פרטי', family_name: `משפחה-${id}`, eligibility_status: status,
  lineage_node_id: node, lineage_chain: null, lineage_manual: null, deep_review_reason: reason,
})

const approved = buildApprovedRefTree(REF)
const byId = new Map(NODES.map(n => [n.id, n]))

describe('planDeepReviewRecheck', () => {
  it('משפחה שתיקנה את סדר הדורות משתחררת לממתין', () => {
    const p = planDeepReviewRecheck([ben('fixed', 'n5', WRONG_REASON)], byId, approved)
    expect(p.release.map(b => b.id)).toEqual(['fixed'])
    expect(p.reasonUpdate).toEqual([])
  })

  it('משפחה שלא תיקנה נשארת, והסיבה מתעדכנת למצב הנוכחי', () => {
    const p = planDeepReviewRecheck([ben('stale', 'y5', 'דילוג דורות'), ben('same', 'y5', WRONG_REASON)], byId, approved)
    expect(p.release).toEqual([])
    expect(p.reasonUpdate).toEqual([{ ben: expect.objectContaining({ id: 'stale' }), reason: WRONG_REASON }])
    expect(p.unchanged.map(b => b.id)).toEqual(['same'])
  })

  it('סיבה שהמזכירות הקלידה: לא משתחררת ולא משתנה, גם כשהדורות תקינים', () => {
    const p = planDeepReviewRecheck([ben('m', 'n5', 'חסר אישור רב קהילה')], byId, approved)
    expect(p.manual.map(b => b.id)).toEqual(['m'])
    expect(p.release).toEqual([])
  })

  it('סיבה ריקה נחשבת של השער', () => {
    const p = planDeepReviewRecheck([ben('e', 'n5', null)], byId, approved)
    expect(p.release.map(b => b.id)).toEqual(['e'])
  })

  it('כרטסת שאינה בבדיקה מעמיקה לא נכללת', () => {
    const p = planDeepReviewRecheck([ben('p', 'n5', null, 'pending')], byId, approved)
    expect([...p.release, ...p.unchanged, ...p.manual, ...p.reasonUpdate]).toEqual([])
  })
})

// ─── הנתיב ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  bens: [] as Record<string, unknown>[],
  ref: [] as Record<string, unknown>[],
  updates: [] as { row: Record<string, unknown>; filters: [string, unknown][] }[],
  logged: [] as string[],
}))

function from(table: string) {
  const filters: [string, unknown][] = []
  const source = (): Row[] => table === 'beneficiaries' ? db.bens : table === 'lineage_nodes' ? NODES as unknown as Row[] : table === 'lineage_approved_ref' ? db.ref : []
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push([c, v]); return q },
    order: () => q,
    range: async (f: number, t: number) => ({ data: source().filter(r => filters.every(([c, v]) => r[c] === v)).slice(f, t + 1), error: null }),
    update: (row: Row) => {
      const u = { row, filters: [] as [string, unknown][] }
      const chain: Record<string, unknown> = {
        eq: (c: string, v: unknown) => { u.filters.push([c, v]); return chain },
        then: (ok: (v: unknown) => unknown) => { db.updates.push(u); return Promise.resolve({ error: null }).then(ok) },
      }
      return chain
    },
  }
  return q
}

vi.mock('@/lib/apiAuth', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requireAdmin: async () => ({ userId: 'u1' }),
    forbidden: () => NextResponse.json({ error: 'אין הרשאה' }, { status: 403 }),
    getServiceClient: () => ({ from }),
  }
})
vi.mock('@/lib/activityLog', () => ({
  logActivity: async (_d: unknown, e: { entityId: string }) => { db.logged.push(e.entityId) },
}))

import { POST } from '@/app/api/admin/lineage/deep-review-recheck/route'

const call = async (body: unknown) => {
  const res = await POST({ json: async () => body } as never)
  return { status: res.status, data: await res.json() }
}

describe('/api/admin/lineage/deep-review-recheck', () => {
  beforeEach(() => {
    db.bens = [ben('fixed', 'n5', WRONG_REASON), ben('stale', 'y5', 'דילוג דורות'), ben('m', 'n5', 'הערת מזכירות')] as unknown as Row[]
    db.ref = REF
    db.updates = []
    db.logged = []
  })

  it('בלי apply: תצוגה מקדימה בלבד, בלי שום שינוי', async () => {
    const { data } = await call({})
    expect(data.dryRun).toBe(true)
    expect(data.total).toBe(3)
    expect(data.release.map((p: { id: string }) => p.id)).toEqual(['fixed'])
    expect(data.release[0].name).toBe('משפחה-fixed פרטי')
    expect(data.stillDeep).toBe(1)
    expect(data.manual.map((p: { id: string }) => p.id)).toEqual(['m'])
    expect(db.updates).toEqual([])
    expect(db.logged).toEqual([])
  })

  it('עם apply: משחרר לממתין רק מי שעדיין בבדיקה מעמיקה, ומעדכן סיבה למי שנשאר', async () => {
    const { data } = await call({ apply: true })
    expect(data).toMatchObject({ dryRun: false, released: 1, reasonsUpdated: 1, failed: [] })
    expect(db.updates).toHaveLength(2)
    expect(db.updates[0].row).toMatchObject({ eligibility_status: 'pending', deep_review_reason: null })
    expect(db.updates[0].filters).toEqual([['id', 'fixed'], ['eligibility_status', 'deep_review']])
    expect(db.updates[1].row).toMatchObject({ deep_review_reason: WRONG_REASON })
    expect(db.updates[1].row).not.toHaveProperty('eligibility_status')
    expect(db.updates[1].filters).toEqual([['id', 'stale'], ['eligibility_status', 'deep_review']])
    expect(db.logged).toEqual(['fixed'])
  })

  it('הקובץ המאושר לא נטען: שגיאה ושום שינוי', async () => {
    db.ref = []
    const { status, data } = await call({ apply: true })
    expect(status).toBe(500)
    expect(data.error).toContain('לא בוצע שום שינוי')
    expect(db.updates).toEqual([])
  })
})
