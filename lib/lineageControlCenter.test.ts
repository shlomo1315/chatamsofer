import { describe, it, expect } from 'vitest'
import { buildControlCenter, computeTreeHealth, type ControlBen, type ControlSummary } from './lineageControlCenter'
import type { DupNode, DupGroup } from './lineageDupGroups'

const node = (id: string, parent: string | null, gen: number, name = id): DupNode =>
  ({ id, name, parent_id: parent, generation: gen, status: 'pending', relation: null })
const ben = (id: string, nodeId: string | null, status: string, over: Partial<ControlBen> = {}): ControlBen => ({
  id, full_name: id, family_name: 'כ', spouse_name: null, lineage_node_id: nodeId,
  lineage_chain: nodeId ? [{ generation: 2 }] : [], eligibility_status: status, ...over,
})
const group = (ids: string[], level: DupGroup['level'], adminOnly: boolean): DupGroup => ({
  key: ids.join(','), parentId: 'r', generation: 2, level, relationConflict: false,
  adminOnly, nodeIds: ids, keepId: ids[0], suggestedName: 'x',
})

describe('buildControlCenter', () => {
  const nodes = [node('r', null, 1), node('a', 'r', 2), node('a2', 'r', 2), node('c', 'a', 3)]
  it('סופר כפילויות, לא מקושרות וחיתוך מול סטטוס', () => {
    const { families, summary } = buildControlCenter({
      nodes,
      bens: [
        ben('f1', 'a', 'pending'),
        ben('f2', 'c', 'deep_review', { lineage_chain: [{ generation: 3 }] }),
        ben('f3', null, 'pending'),
        ben('f4', 'r', 'approved', { lineage_chain: [{ generation: 1 }] }),
      ],
      groups: [group(['a', 'a2'], 'C', true)],
      selfRows: [], ghostRows: [],
    })
    expect(summary.dup.groups).toBe(1)
    expect(summary.dup.adminOnlyGroups).toBe(1)
    expect(summary.dup.byLevel.C).toBe(1)
    expect(summary.dup.familiesAffected).toBe(2)
    expect(summary.unlinked).toBe(1)
    expect(summary.byStatus.pending).toEqual({ total: 2, withIssue: 2, withDup: 1 })
    expect(summary.byStatus.deep_review.withDup).toBe(1)
    expect(summary.byStatus.approved.withIssue).toBe(0)
    expect(families.find(f => f.id === 'f2')!.issues.map(i => i.kind)).toContain('dup_branch')
    expect(families.find(f => f.id === 'f4')!.ok).toBe(true)
    expect(families.find(f => f.id === 'f2')!.chain).toEqual(['r', 'a', 'c'])
  })
  it('פער עומק ובלי שרשרת', () => {
    const { families } = buildControlCenter({
      nodes, bens: [ben('x', 'a', 'pending', { lineage_chain: [{ generation: 1 }] }), ben('y', 'a', 'pending', { lineage_chain: null })],
      groups: [], selfRows: [], ghostRows: [],
    })
    expect(families[0].issues.map(i => i.kind)).toEqual(['depth_gap'])
    expect(families[1].issues.map(i => i.kind)).toEqual(['no_chain'])
  })
})

describe('רישום מקביל', () => {
  // שני עותקים של "ז" בדור 3 תחת הורים שונים; משפחה אחת תחת כל עותק, ועוד צאצא
  const nodes = [
    node('r', null, 1), node('a', 'r', 2, 'א'), node('b', 'r', 2, 'ב'),
    node('z1', 'a', 3, 'ז'), node('z2', 'b', 3, 'ז'), node('c', 'z2', 4, 'ח'),
  ]
  it('מזהה אשכול, מסמן משפחות שהאב שלהן מועתק, וסופר כמה יתאחד', () => {
    const { families, summary, parallelGroups } = buildControlCenter({
      nodes,
      bens: [ben('f1', 'z1', 'pending'), ben('f2', 'c', 'pending'), ben('f3', 'a', 'pending')],
      groups: [], selfRows: [], ghostRows: [],
    })
    expect(summary.parallel.groups).toBe(1)
    expect(summary.parallel.removable).toBe(1)
    expect(summary.parallel.safeGroups).toBe(0)
    expect(summary.parallel.needsDecision).toBe(1)
    expect(summary.parallel.familiesAffected).toBe(2)
    expect(summary.parallel.afterAll).toBe(summary.parallel.treeNodes - 1)
    expect(parallelGroups[0].nodes.find(n => n.id === 'z2')!.levelsBelow).toBe(1)
    expect(families.find(f => f.id === 'f2')!.issues.some(i => i.kind === 'parallel_dup' && i.clusterKey)).toBe(true)
    expect(families.find(f => f.id === 'f3')!.issues.some(i => i.kind === 'parallel_dup')).toBe(false)
  })
})

describe('computeTreeHealth', () => {
  const mk = (families: number, withIssue: number, reviewedOk = 0) => ({
    families, reviewedOk, byStatus: { pending: { total: families, withIssue, withDup: 0 } },
  }) as unknown as ControlSummary
  it('מחשב ציון וגוון', () => {
    expect(computeTreeHealth(mk(100, 5))).toMatchObject({ score: 95, tone: 'ok', familiesWithIssue: 5 })
    expect(computeTreeHealth(mk(100, 20)).tone).toBe('warn')
    expect(computeTreeHealth(mk(100, 50, 25))).toMatchObject({ score: 50, tone: 'bad', reviewedPct: 25 })
  })
  it('עץ ריק לא מחלק באפס', () => {
    expect(computeTreeHealth(mk(0, 0)).score).toBe(100)
  })
})
