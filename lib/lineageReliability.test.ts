import { describe, it, expect } from 'vitest'
import { assessLineageReliability } from './lineageReliability'

// ─────────────────────────────────────────────────────────────────────────────
// ספירה לפי צמתים (מזהי lineage_node_id), לא לפי מחרוזת שם.
// עץ: החתם סופר → שמעון סופר → {אברהם(5), משה(3), יעקב(חדש)}.
// ─────────────────────────────────────────────────────────────────────────────

const baseNodes = [
  { id: 'root', name: 'רבינו החתם סופר', generation: 1, parent_id: null, status: 'verified' },
  { id: 'shimon', name: 'שמעון סופר', generation: 2, parent_id: 'root', status: 'verified' },
  { id: 'avraham', name: 'אברהם סופר', generation: 3, parent_id: 'shimon', status: 'verified' },
  { id: 'moshe', name: 'משה סופר', generation: 3, parent_id: 'shimon', status: 'verified' },
]

function makeDb(opts: { bene: unknown; nodes: unknown[]; familyRows: unknown[] }) {
  return {
    from(table: string) {
      if (table === 'lineage_nodes') {
        const b: Record<string, unknown> = {}
        Object.assign(b, { select: () => b, then: (r: (v: unknown) => unknown) => r({ data: opts.nodes, error: null }) })
        return b
      }
      const b: Record<string, unknown> = {}
      Object.assign(b, {
        select: () => b, eq: () => b,
        maybeSingle: () => Promise.resolve({ data: opts.bene, error: null }),
        then: (r: (v: unknown) => unknown) => r({ data: opts.familyRows, error: null }),
      })
      return b
    },
  } as never
}

const fam = (nodeId: string, n: number) => Array.from({ length: n }, () => ({ lineage_node_id: nodeId }))

describe('assessLineageReliability — ספירה לפי צמתים', () => {
  it('שורה חדשה וייחודית תחת ענף מבוסס → התאמה נמוכה', async () => {
    const nodes = [
      ...baseNodes,
      { id: 'yaakov', name: 'יעקב סופר', generation: 3, parent_id: 'shimon', status: 'pending' }, // אב חדש
      { id: 'self', name: 'דוד סופר', generation: 4, parent_id: 'yaakov', status: 'pending' },
    ]
    const bene = { id: 'b1', family_name: 'סופר', full_name: 'דוד', spouse_name: null, eligibility_status: 'pending', lineage_node_id: 'self', lineage_chain: null }
    const familyRows = [...fam('avraham', 5), ...fam('moshe', 3), ...fam('self', 1)]
    const r = await assessLineageReliability(makeDb({ bene, nodes, familyRows }), 'b1')
    expect(r.anchor?.name).toBe('שמעון סופר')
    expect(r.claimedLine).toBe('יעקב סופר')
    expect(r.trunkFamilies).toBe(9)          // 5 + 3 + 1
    expect(r.lineFamilies).toBe(1)           // רק הנרשם
    expect(r.newNodesAdded).toBe(1)          // יעקב (העלה עצמו לא נספר)
    expect(r.band).toBe('low')
    expect(r.reasons?.some(x => x.includes('ייחודית'))).toBe(true)
  })

  it('חיבור ישיר לצומת מאומת מבוסס → התאמה גבוהה', async () => {
    const nodes = [
      ...baseNodes,
      { id: 'self2', name: 'דוד סופר', generation: 4, parent_id: 'avraham', status: 'pending' },
    ]
    const bene = { id: 'b2', family_name: 'סופר', full_name: 'דוד', spouse_name: null, eligibility_status: 'pending', lineage_node_id: 'self2', lineage_chain: null }
    const familyRows = [...fam('avraham', 6), ...fam('moshe', 3), ...fam('self2', 1)]
    const r = await assessLineageReliability(makeDb({ bene, nodes, familyRows }), 'b2')
    expect(r.anchor?.name).toBe('אברהם סופר')
    expect(r.trunkFamilies).toBe(7)          // 6 על אברהם + הנרשם
    expect(r.newNodesAdded).toBe(0)          // חובר ישירות למאומת
    expect(r.band).toBe('high')
  })

  it('שני נרשמים שונים → נתונים שונים (לא קבועים)', async () => {
    const nodesA = [...baseNodes, { id: 'sa', name: 'א', generation: 4, parent_id: 'avraham', status: 'pending' }]
    const nodesB = [...baseNodes, { id: 'sb', name: 'ב', generation: 4, parent_id: 'moshe', status: 'pending' }]
    const rA = await assessLineageReliability(makeDb({ bene: { id: 'a', lineage_node_id: 'sa', lineage_chain: null }, nodes: nodesA, familyRows: [...fam('avraham', 6), ...fam('sa', 1)] }), 'a')
    const rB = await assessLineageReliability(makeDb({ bene: { id: 'b', lineage_node_id: 'sb', lineage_chain: null }, nodes: nodesB, familyRows: [...fam('moshe', 2), ...fam('sb', 1)] }), 'b')
    expect(rA.trunkFamilies).not.toBe(rB.trunkFamilies)   // 7 מול 3
    expect(rA.anchor?.name).toBe('אברהם סופר')
    expect(rB.anchor?.name).toBe('משה סופר')
  })

  it('ללא שיוך לצומת → מדווח שאין נתוני עץ', async () => {
    const bene = { id: 'b3', family_name: 'כהן', full_name: 'לוי', spouse_name: null, eligibility_status: 'pending', lineage_node_id: null, lineage_chain: null }
    const r = await assessLineageReliability(makeDb({ bene, nodes: baseNodes, familyRows: [] }), 'b3')
    expect(r.ok).toBe(true)
    expect(r.claimedPath).toEqual([])
    expect(r.reasons?.[0]).toContain('לא סומנה לצומת')
  })
})
