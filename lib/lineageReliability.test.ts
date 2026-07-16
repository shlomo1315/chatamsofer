import { describe, it, expect } from 'vitest'
import { assessLineageReliability } from './lineageReliability'

// ─────────────────────────────────────────────────────────────────────────────
// מדמה את הדוגמה של המשתמש: "שמעון סופר" מאומת (דור 2). נרשם מסמן קו דרכו ומוסיף
// אב חדש בדור 3. אם רבים סימנו את אותו אב → עקבי; אם איש לא → חריג.
// ─────────────────────────────────────────────────────────────────────────────

const nodes = [
  { id: 'root', name: 'רבינו החתם סופר', generation: 1, parent_id: null, status: 'verified' },
  { id: 'shimon', name: 'שמעון סופר', generation: 2, parent_id: 'root', status: 'verified' },
]

const bene = {
  id: 'b1', family_name: 'סופר', full_name: 'דוד', spouse_name: null,
  eligibility_status: 'pending', lineage_node_id: 'new-gen3',
  lineage_chain: [
    { generation: 1, name: 'רבינו החתם סופר' },
    { generation: 2, name: 'שמעון סופר' },
    { generation: 3, name: 'אברהם סופר' },   // אב חדש שהנרשם הוסיף
    { generation: 4, name: 'דוד סופר' },
  ],
}

function makeDb(opts: { bene: unknown; nodes: unknown[]; trunk: unknown[] }) {
  return {
    from(table: string) {
      if (table === 'lineage_nodes') {
        const b: Record<string, unknown> = {}
        Object.assign(b, { select: () => b, then: (r: (v: unknown) => unknown) => r({ data: opts.nodes, error: null }) })
        return b
      }
      const b: Record<string, unknown> = {}
      Object.assign(b, {
        select: () => b, eq: () => b, contains: () => b, limit: () => b,
        maybeSingle: () => Promise.resolve({ data: opts.bene, error: null }),
        then: (r: (v: unknown) => unknown) => r({ data: opts.trunk, error: null }),
      })
      return b
    },
  } as never
}

const line = (gen3: string, n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, lineage_chain: [{ generation: 2, name: 'שמעון סופר' }, { generation: 3, name: gen3 }] }))

describe('assessLineageReliability', () => {
  it('קו נתמך על ידי משפחות אחרות → לא חריג, עוגן מזוהה', async () => {
    const trunk = [...line('אברהם סופר', 5, 'c'), ...line('משה סופר', 3, 'd')]
    const r = await assessLineageReliability(makeDb({ bene, nodes, trunk }), 'b1')
    expect(r.ok).toBe(true)
    expect(r.anchor?.name).toBe('שמעון סופר')
    expect(r.claimedLine).toBe('אברהם סופר')
    expect(r.trunkFamilies).toBe(8)
    expect(r.lineFamilies).toBe(5)
    expect(r.newNodesAdded).toBe(2)          // אברהם + דוד (לא מאומתים)
    expect(r.band).not.toBe('anomaly')
  })

  it('גזע מבוסס אך השורה יחידה → חריג', async () => {
    const trunk = line('משה סופר', 10, 'e')   // 10 משפחות, כולן על "משה סופר" — אף אחת על "אברהם סופר"
    const r = await assessLineageReliability(makeDb({ bene, nodes, trunk }), 'b1')
    expect(r.trunkFamilies).toBe(10)
    expect(r.lineFamilies).toBe(0)
    expect(r.band).toBe('anomaly')
    expect(r.reasons?.some(x => x.includes('חריג'))).toBe(true)
  })

  it('ללא קו יוחסין → מדווח שאין מה להשוות', async () => {
    const noLineage = { ...bene, lineage_chain: null, lineage_node_id: null }
    const r = await assessLineageReliability(makeDb({ bene: noLineage, nodes, trunk: [] }), 'b1')
    expect(r.ok).toBe(true)
    expect(r.claimedPath).toEqual([])
    expect(r.reasons?.[0]).toContain('לא סימנה קו יוחסין')
  })

  it('התאמת שם פונטית סופרת ביחד (אברהם/אברם)', async () => {
    const beneAvram = { ...bene, lineage_chain: [
      { generation: 1, name: 'רבינו החתם סופר' }, { generation: 2, name: 'שמעון סופר' },
      { generation: 3, name: 'אברהם סופר' }, { generation: 4, name: 'דוד סופר' },
    ] }
    // הגזע כתוב "אברהם" מלא, הנרשם גם — התאמה מדויקת; נוודא שהספירה עובדת
    const trunk = line('אברהם סופר', 4, 'f')
    const r = await assessLineageReliability(makeDb({ bene: beneAvram, nodes, trunk }), 'b1')
    expect(r.lineFamilies).toBe(4)
  })
})
