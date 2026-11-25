import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// המקרה מ-24.11:דור 5 הוקלד ידנית תחת עוגן בדור 4, ההקלדה נחסמה
// והכרטסת בבדיקה מעמיקה. המנהל בוחר את הצומת הנכון בדף העריכה ושומר.

const REF = [
  { key: 'r1', name: 'חתם סופר', generation: 1, parent_key: null },
  { key: 'r2', name: 'שמעון', generation: 2, parent_key: 'r1' },
  { key: 'r3', name: 'יוסף', generation: 3, parent_key: 'r2' },
  { key: 'r4', name: 'משה', generation: 4, parent_key: 'r3' },
  { key: 'r5', name: 'אביגדור', generation: 5, parent_key: 'r4' },
]

const NODES = [
  { id: 'n1', name: 'מרן החתם סופר זי"ע', parent_id: null, generation: 1, relation: null, status: 'verified' },
  { id: 'n2', name: 'שמעון', parent_id: 'n1', generation: 2, relation: null, status: 'verified' },
  { id: 'n3', name: 'יוסף', parent_id: 'n2', generation: 3, relation: null, status: 'verified' },
  { id: 'n4', name: 'משה', parent_id: 'n3', generation: 4, relation: null, status: 'verified' },
  { id: 'n5', name: 'אביגדור', parent_id: 'n4', generation: 5, relation: 'son', status: 'verified' },
  // "אביגדור" בדור 5 תחת הורה שגוי
  { id: 'x4', name: 'בנימין', parent_id: 'n3', generation: 4, relation: null, status: 'verified' },
  { id: 'y5', name: 'אביגדור', parent_id: 'x4', generation: 5, relation: null, status: 'verified' },
]

const TYPED_CHAIN = [
  { generation: 1, name: 'מרן החתם סופר זי"ע', relation: null },
  { generation: 2, name: 'שמעון', relation: null },
  { generation: 3, name: 'יוסף', relation: null },
  { generation: 4, name: 'משה', relation: null },
  { generation: 5, name: 'אביגדור כהן', relation: null },  // הוקלד ידנית
  { generation: 6, name: 'דוד', relation: null },
]

type Row = Record<string, unknown>

function fakeDb(ben: Row) {
  const tables: Record<string, Row[]> = {
    lineage_approved_ref: REF, lineage_nodes: NODES, beneficiaries: [ben],
  }
  const updates: { table: string; row: Row; id: unknown }[] = []
  const db = {
    from(table: string) {
      const filters: [string, unknown][] = []
      const rows = () => (tables[table] ?? []).filter(r => filters.every(([c, v]) => r[c] === v))
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q },
        order: () => q,
        range: async (f: number, t: number) => ({ data: rows().slice(f, t + 1), error: null }),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        update: (row: Row) => ({
          eq: async (_c: string, id: unknown) => { updates.push({ table, row, id }); return { error: null } },
        }),
      }
      return q
    },
  }
  return { db: db as unknown as SupabaseClient, updates }
}

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/apiAuth', () => ({
  requirePermission: async () => ({ userId: 'admin', role: 'admin', permissions: {} }),
  forbidden: () => new Response(null, { status: 403 }),
  getServiceClient: () => mocks.db,
}))

async function save(ben: Row, payload: Row) {
  const { db, updates } = fakeDb(ben)
  mocks.db = db
  const { POST } = await import('@/app/api/admin/beneficiaries/update/route')
  const req = new Request('http://x/api/admin/beneficiaries/update', {
    method: 'POST', body: JSON.stringify({ id: 'h1', payload }),
  })
  const res = await POST(req as never)
  expect(res.status).toBe(200)
  return updates.find(u => u.table === 'beneficiaries')!.row
}

const HIRSCH = {
  id: 'h1', lineage_node_id: 'n4', lineage_chain: TYPED_CHAIN, lineage_manual: ['אביגדור כהן'],
  eligibility_status: 'deep_review', deep_review_reason: 'המשפחה או דור שהוקלד יושבים בתוך 5 הדורות (דור 5: העוגן בדור 4)',
}

describe('דף העריכה: תיקון דור 5 שהוקלד ידנית', () => {
  beforeEach(() => { vi.resetModules() })

  it('בחירת הצומת הנכון — השרשרת מתעדכנת, הכרטסת משתחררת לממתין והסיבה נמחקת', async () => {
    const row = await save(HIRSCH, { lineage_node_id: 'n5', lineage_manual: [] })
    expect(row.eligibility_status).toBe('pending')
    expect(row.deep_review_reason).toBeNull()
    const chain = row.lineage_chain as { generation: number; name: string }[]
    expect(chain.map(e => e.generation)).toEqual([1, 2, 3, 4, 5, 6])
    expect(chain[4].name).toBe('אביגדור')
    expect(chain[5].name).toBe('דוד')  // הדורות שמתחת נשמרים
  })

  it('אותו שם תחת הורה שגוי — נשאר בבדיקה מעמיקה, והסיבה מתעדכנת', async () => {
    const row = await save(HIRSCH, { lineage_node_id: 'y5', lineage_manual: [] })
    expect(row.eligibility_status).toBeUndefined()
    expect(row.deep_review_reason).toBeTruthy()
    expect(row.deep_review_reason).not.toContain('העוגן בדור 4')
  })

  it('סטטוס שהמנהל בחר באותה שמירה גובר', async () => {
    const row = await save(HIRSCH, { lineage_node_id: 'n5', eligibility_status: 'rejected' })
    expect(row.eligibility_status).toBe('rejected')
    expect(row.deep_review_reason).toBeUndefined()
  })

  it('כרטסת מאושרת — השרשרת מתעדכנת, הסטטוס לא משתנה', async () => {
    const row = await save({ ...HIRSCH, eligibility_status: 'approved' }, { lineage_node_id: 'n5' })
    expect(row.eligibility_status).toBeUndefined()
    expect((row.lineage_chain as { name: string }[])[4].name).toBe('אביגדור')
  })

  it('שמירה בלי שינוי בשושלת — לא נוגעת בשרשרת ובסטטוס', async () => {
    const row = await save(HIRSCH, { phone: '050', lineage_node_id: 'n4', lineage_manual: ['אביגדור כהן'] })
    expect(row).not.toHaveProperty('lineage_chain')
    expect(row).not.toHaveProperty('eligibility_status')
  })
})
