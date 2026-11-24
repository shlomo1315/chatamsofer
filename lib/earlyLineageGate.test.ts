import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { earlyLineageGate } from './earlyLineageGate'

// קובץ מאושר: חתם סופר ← שמעון ← יוסף ← משה ← אברהם (דורות 1–5)
const REF = [
  { key: 'r1', name: 'חתם סופר', generation: 1, parent_key: null },
  { key: 'r2', name: 'שמעון', generation: 2, parent_key: 'r1' },
  { key: 'r3', name: 'יוסף', generation: 3, parent_key: 'r2' },
  { key: 'r4', name: 'משה', generation: 4, parent_key: 'r3' },
  { key: 'r5', name: 'אברהם', generation: 5, parent_key: 'r4' },
]

const NODES = [
  { id: 'n1', name: 'מרן החתם סופר זי"ע', parent_id: null, generation: 1, relation: null, status: 'verified' },
  { id: 'n2', name: 'שמעון', parent_id: 'n1', generation: 2, relation: null, status: 'verified' },
  { id: 'n3', name: 'יוסף', parent_id: 'n2', generation: 3, relation: null, status: 'verified' },
  { id: 'n4', name: 'משה', parent_id: 'n3', generation: 4, relation: null, status: 'verified' },
  { id: 'n5', name: 'אברהם', parent_id: 'n4', generation: 5, relation: null, status: 'verified' },
  { id: 'n6', name: 'דוד', parent_id: 'n5', generation: 6, relation: null, status: 'pending' },
  // ענף שגוי שקיים בעץ (נבחר מהרשימה, לא הוקלד): "בנימין" בדור 4 אינו בקובץ
  { id: 'x4', name: 'בנימין', parent_id: 'n3', generation: 4, relation: null, status: 'verified' },
  { id: 'x6', name: 'דוד', parent_id: 'x4', generation: 5, relation: null, status: 'pending' },
  // שם נכון ("אברהם", דור 5) תחת הורה שגוי — ומאומת בעץ
  { id: 'y5', name: 'אברהם', parent_id: 'x4', generation: 5, relation: null, status: 'verified' },
  { id: 'y6', name: 'דוד', parent_id: 'y5', generation: 6, relation: null, status: 'pending' },
]

type Row = Record<string, unknown>
interface FakeOpts { ref?: Row[] | 'error'; nodes?: Row[]; bens?: Row[] }

/** מסד מדומה: select/eq/range/maybeSingle, update/eq, insert. */
function fakeDb(opts: FakeOpts = {}) {
  const tables: Record<string, Row[]> = {
    lineage_approved_ref: opts.ref === 'error' ? [] : (opts.ref ?? REF),
    lineage_nodes: opts.nodes ?? NODES,
    beneficiaries: opts.bens ?? [],
    lineage_assign_log: [],
  }
  const updates: { table: string; row: Row; id: unknown }[] = []
  const db = {
    from(table: string) {
      const filters: [string, unknown][] = []
      const rows = () => (tables[table] ?? []).filter(r => filters.every(([c, v]) => r[c] === v))
      const failed = table === 'lineage_approved_ref' && opts.ref === 'error'
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q },
        order: () => q,
        range: async (f: number, t: number) => failed
          ? { data: null, error: { message: 'down' } }
          : { data: rows().slice(f, t + 1), error: null },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        insert: async (row: Row) => { tables[table].push(row); return { error: null } },
        update: (row: Row) => ({
          eq: async (_c: string, id: unknown) => { updates.push({ table, row, id }); return { error: null } },
        }),
      }
      return q
    },
  }
  return { db: db as unknown as SupabaseClient, updates }
}

describe('earlyLineageGate — הכלל: דורות 2–5 מול הקובץ המאושר', () => {
  it('צומת שגוי שנבחר מהרשימה בלי הקלדה — בדיקה מעמיקה', async () => {
    const { db } = fakeDb()
    const r = await earlyLineageGate(db, { lineage_node_id: 'x6' })
    expect(r.deep).toBe(true)
    expect(r.finding).toMatchObject({ kind: 'not_in_ref', generation: 4, detail: 'בנימין' })
    expect(r.reason).toContain('בנימין')
  })

  it('שם נכון בדור הנכון תחת הורה שגוי — בדיקה מעמיקה', async () => {
    const { db } = fakeDb()
    const r = await earlyLineageGate(db, { lineage_node_id: 'y6' })
    expect(r.deep).toBe(true)
    expect(r.finding?.kind).toBe('not_in_ref')
  })

  it('משפחה בלי שיוך לעץ ובלי שרשרת — בדיקה מעמיקה', async () => {
    const { db } = fakeDb()
    expect((await earlyLineageGate(db, { lineage_node_id: null })).finding?.kind).toBe('no_lineage')
    expect((await earlyLineageGate(db, { lineage_node_id: null, lineage_manual: ['שמעון'] })).deep).toBe(true)
  })

  it('בלי שיוך, עם שרשרת תקינה מול הקובץ — רגילה', async () => {
    const { db } = fakeDb()
    const chain = [{ generation: 2, name: 'שמעון' }, { generation: 3, name: 'יוסף' }, { generation: 4, name: 'משה' }, { generation: 5, name: 'אברהם' }]
    expect((await earlyLineageGate(db, { lineage_node_id: null, lineage_chain: chain })).deep).toBe(false)
  })

  it('משפחה תקינה נשארת רגילה', async () => {
    const { db } = fakeDb()
    const r = await earlyLineageGate(db, { lineage_node_id: 'n6' })
    expect(r).toEqual({ deep: false, finding: null, unknown: false, reason: null })
    // עוגן בדור 5 — המשפחה בדור 6, תקין
    expect((await earlyLineageGate(db, { lineage_node_id: 'n5' })).deep).toBe(false)
  })

  it('עוגן בתוך 5 הדורות (הקלדה מתחת לדור 3) — בדיקה מעמיקה', async () => {
    const { db } = fakeDb()
    expect((await earlyLineageGate(db, { lineage_node_id: 'n3' })).finding?.kind).toBe('too_shallow')
  })

  it('צומת שאינו קיים בעץ — בדיקה מעמיקה', async () => {
    const { db } = fakeDb()
    expect((await earlyLineageGate(db, { lineage_node_id: 'ghost' })).finding?.kind).toBe('broken_node')
  })

  it('הקובץ המאושר לא נטען או ריק — בדיקה מעמיקה, לא אישור שקט', async () => {
    for (const ref of ['error', []] as const) {
      const { db } = fakeDb({ ref: ref as FakeOpts['ref'] })
      const r = await earlyLineageGate(db, { lineage_node_id: 'n6' })
      expect(r).toMatchObject({ deep: true, unknown: true })
      expect(r.reason).toContain('לא נבדק')
    }
  })
})

// ── השיוך הידני: שחרור מבדיקה מעמיקה רק כשהבדיקה המלאה עוברת ──
const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/apiAuth', () => ({
  requirePermission: async () => ({ userId: 'u1' }),
  forbidden: () => new Response('forbidden', { status: 403 }),
  getServiceClient: () => mocks.db,
}))
vi.mock('@/lib/lineageSync', () => ({ invalidateLineageCache: () => {} }))

async function assign(nodeId: string, status = 'deep_review', ref?: FakeOpts['ref']) {
  const fake = fakeDb({ ref, bens: [{ id: 'b1', eligibility_status: status, lineage_chain: null, lineage_node_id: null }] })
  mocks.db = fake.db
  const { POST } = await import('@/app/api/admin/lineage/assign/route')
  const req = new Request('http://x/api/admin/lineage/assign', { method: 'POST', body: JSON.stringify({ beneficiaryId: 'b1', nodeId }) })
  const res = await POST(req as never)
  const body = await res.json()
  const upd = fake.updates.find(u => u.table === 'beneficiaries')
  return { body, upd }
}

describe('שיוך ידני (assign) — שחרור מבדיקה מעמיקה', () => {
  beforeEach(() => { mocks.db = null })

  it('המסלול כולו בקובץ המאושר — משתחרר ל"ממתין"', async () => {
    const { body, upd } = await assign('n6')
    expect(body.statusReverted).toBe(true)
    expect(upd?.row.eligibility_status).toBe('pending')
  })

  it('שם ודור נכונים ומאומתים, אבל הורה שגוי — נשאר בבדיקה מעמיקה', async () => {
    const { body, upd } = await assign('y6')
    expect(body.statusReverted).toBe(false)
    expect(upd?.row).not.toHaveProperty('eligibility_status')
  })

  it('ענף שאינו בקובץ — נשאר בבדיקה מעמיקה', async () => {
    expect((await assign('x6')).upd?.row).not.toHaveProperty('eligibility_status')
  })

  it('הקובץ המאושר לא נטען — לא משחרר', async () => {
    expect((await assign('n6', 'deep_review', 'error')).upd?.row).not.toHaveProperty('eligibility_status')
  })

  it('סטטוס אחר (מאושר) — לא נוגעים בו', async () => {
    expect((await assign('n6', 'approved')).upd?.row).not.toHaveProperty('eligibility_status')
  })
})
