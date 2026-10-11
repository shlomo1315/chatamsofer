import { describe, it, expect } from 'vitest'
import { undoMergeBatch } from './lineageMerge'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ביטול מיזוג חייב להחזיר *הכול* (12.10):
//   • את הצומת המלא — בלי שדות העזר _refs/_keep_before (אינם עמודות; upsert
//     איתם היה נכשל, והצומת לא היה חוזר כלל).
//   • את בקשות המשפחות וקישורי השיתוף שהועברו לשורד.
//   • את השם והסטטוס של השורד כפי שהיו לפני המיזוג.
// ─────────────────────────────────────────────────────────────────────────────

type Call = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] }

function mockDb(logRows: unknown[]) {
  const calls: Call[] = []
  const db = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] }
      const b: Record<string, unknown> = {}
      const chain = () => b
      Object.assign(b, {
        select: chain, order: chain, limit: chain,
        eq: (c: string, v: unknown) => { call.filters.push(['eq', c, v]); return b },
        in: (c: string, v: unknown) => { call.filters.push(['in', c, v]); return b },
        is: (c: string, v: unknown) => { call.filters.push(['is', c, v]); return b },
        upsert: (p: unknown) => { call.op = 'upsert'; call.payload = p; calls.push(call); return Promise.resolve({ error: null }) },
        update: (p: unknown) => { call.op = 'update'; call.payload = p; calls.push(call); return b },
        then: (res: (v: unknown) => void) => Promise.resolve(
          table === 'lineage_merge_log' && call.op === 'select' ? { data: logRows, error: null } : { data: null, error: null },
        ).then(res),
      })
      return b
    },
  }
  return { db, calls }
}

describe('undoMergeBatch', () => {
  const row = {
    id: 'log1', keep_id: 'K', merged_id: 'M',
    merged_node: {
      id: 'M', name: 'רבי משה פריי', parent_id: 'P', generation: 4, status: 'pending', id_number: '123',
      _refs: { sugg_node: ['s1'], sugg_parent: [], sugg_root: ['s2'], invites: ['tok'] },
      _keep_before: { name: 'רבי משה ומלכה פריי', status: 'pending' },
    },
    moved_children: ['c1'], moved_beneficiaries: ['b1'],
  }

  it('משחזר את הצומת המלא בלי שדות העזר', async () => {
    const { db, calls } = mockDb([row])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await undoMergeBatch(db as any, 'batch')).toBe(1)
    const up = calls.find(c => c.op === 'upsert')!
    expect(up.payload).toEqual({ id: 'M', name: 'רבי משה פריי', parent_id: 'P', generation: 4, status: 'pending', id_number: '123' })
  })

  it('מחזיר בקשות משפחות וקישורי שיתוף לצומת המשוחזר', async () => {
    const { db, calls } = mockDb([row])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await undoMergeBatch(db as any, 'batch')
    const sugg = calls.filter(c => c.table === 'lineage_review_suggestions')
    expect(sugg.map(c => c.payload)).toEqual([{ node_id: 'M' }, { root_node_id: 'M' }])
    const inv = calls.find(c => c.table === 'lineage_share_invites')!
    expect(inv.payload).toEqual({ root_node_id: 'M' })
    expect(inv.filters).toContainEqual(['in', 'token', ['tok']])
  })

  it('מחזיר את שם וסטטוס השורד שלפני המיזוג', async () => {
    const { db, calls } = mockDb([row])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await undoMergeBatch(db as any, 'batch')
    const keep = calls.find(c => c.table === 'lineage_nodes' && c.op === 'update' && c.filters.some(f => f[1] === 'id' && f[2] === 'K'))!
    expect(keep.payload).toEqual({ name: 'רבי משה ומלכה פריי', status: 'pending' })
  })

  it('רשומת יומן ישנה (בלי שדות העזר) — עדיין משוחזרת', async () => {
    const { _refs, _keep_before, ...old } = row.merged_node
    void _refs; void _keep_before
    const { db, calls } = mockDb([{ ...row, merged_node: old }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await undoMergeBatch(db as any, 'batch')).toBe(1)
    expect(calls.some(c => c.table === 'lineage_review_suggestions')).toBe(false)
  })
})
