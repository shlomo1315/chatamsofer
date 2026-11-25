import { describe, expect, it } from 'vitest'
import {
  buildLadderIndex, decisionOf, dupInfo, dupKey, familiesInBranch, genRows, groupParents,
  nextPending, pathNames, snapshotGroup, workGen, type LadderNode, type LadderStatus,
} from './lineageLadder'

const n = (id: string, parent: string | null, status: LadderStatus, name = id, generation: number | null = null): LadderNode =>
  ({ id, name, parent_id: parent, status, generation })

// שורש ← א (מאושר, 3 ילדים) ← א1 (ממתין, עם 2 צאצאים), א2 (ממתין), א3 (מאושר)
//      ← ב (מאושר) ← ב1 (ממתין)
//      ← ג (ממתין) ← ג1 (ממתין)   — ג1 לא בתור: ההורה שלו לא מאושר
const tree = () => [
  n('root', null, 'verified', 'השורש'),
  n('a', 'root', 'verified', 'אברהם'),
  n('a1', 'a', 'pending', 'משה'),
  n('a1x', 'a1', 'pending', 'יוסף'),
  n('a1y', 'a1x', 'pending', 'דוד'),
  n('a2', 'a', 'pending', 'משה ליב'),
  n('a3', 'a', 'verified', 'יעקב'),
  n('b', 'root', 'verified', 'בנימין'),
  n('b1', 'b', 'pending', 'שמעון'),
  n('c', 'root', 'pending', 'כלב'),
  n('c1', 'c', 'pending', 'חור'),
]

describe('buildLadderIndex', () => {
  it('מחשב דור לפי עומק וגודל ענף', () => {
    const ix = buildLadderIndex(tree())
    expect(ix.gen.get('root')).toBe(1)
    expect(ix.gen.get('a1y')).toBe(5)
    expect(ix.maxGen).toBe(5)
    expect(ix.desc.get('a')).toBe(5)
    expect(ix.desc.get('a1')).toBe(2)
    expect(ix.desc.get('a2')).toBe(0)
  })
  it('מעדיף generation מהמסד כשקיים', () => {
    const ix = buildLadderIndex([n('r', null, 'verified', 'r', 3), n('k', 'r', 'pending')])
    expect(ix.gen.get('r')).toBe(3)
    expect(ix.gen.get('k')).toBe(4)
  })
})

describe('genRows', () => {
  it('סופר מאושרים וממתינים לכל דור ולא סופר פסולים', () => {
    const nodes = tree()
    nodes.push(n('x', 'a', 'rejected'))
    const rows = genRows(buildLadderIndex(nodes))
    expect(rows[0]).toEqual({ g: 1, verified: 1, pending: 0 })
    expect(rows[1]).toEqual({ g: 2, verified: 2, pending: 1 })
    expect(rows[2]).toEqual({ g: 3, verified: 1, pending: 4 })
  })
})

describe('קבוצות ותור', () => {
  it('הדור שבעבודה הוא הנמוך ביותר עם ממתין שההורה שלו מאושר', () => {
    expect(workGen(buildLadderIndex(tree()))).toBe(2)
    const nodes = tree().map(x => (x.id === 'c' ? { ...x, status: 'rejected' as const } : x))
    expect(workGen(buildLadderIndex(nodes))).toBe(3)
  })
  it('אין מה להכריע: null', () => {
    expect(workGen(buildLadderIndex([n('r', null, 'verified'), n('k', 'r', 'verified')]))).toBeNull()
  })
  it('הורים בדור 2 מסודרים מהענף הגדול לקטן', () => {
    const ix = buildLadderIndex(tree())
    expect(groupParents(ix, 3).map(p => p.id)).toEqual(['a', 'b'])
    expect(groupParents(ix, 2).map(p => p.id)).toEqual(['root'])
  })
  it('צילום קבוצה: מאושרים קודם, ממתינים מהגדול לקטן', () => {
    const ix = buildLadderIndex(tree())
    const s = snapshotGroup(ix, 'a')
    expect(s.gen).toBe(3)
    expect(s.pre).toEqual(['a3'])
    expect(s.pend).toEqual(['a1', 'a2'])
  })
  it('הממתין הבא מעגלי ומדלג על מה שהוכרע', () => {
    const open = new Set(['p1', 'p3'])
    expect(nextPending(['p1', 'p2', 'p3'], 'p1', id => open.has(id))).toBe('p3')
    expect(nextPending(['p1', 'p2', 'p3'], 'p3', id => open.has(id))).toBe('p1')
    expect(nextPending(['p1'], 'p1', () => false)).toBeNull()
  })
  it('החלטה נגזרת מהסטטוס', () => {
    expect(decisionOf(n('x', null, 'verified'))).toBe('v')
    expect(decisionOf(n('x', null, 'rejected'))).toBe('r')
    expect(decisionOf(n('x', null, 'pending'))).toBeNull()
  })
})

describe('כפילות', () => {
  it('מפתח לפי המילה הראשונה בלי פיסוק', () => {
    expect(dupKey('משה ליב')).toBe('משה')
    expect(dupKey('"משה"')).toBe('משה')
  })
  it('מסמן ממתין שיש לו אח עם אותו שם פרטי, ולא מסמן מאושר', () => {
    const nodes = [...tree(), n('a4', 'a', 'verified', 'משה הכהן')]
    const ix = buildLadderIndex(nodes)
    const d = dupInfo(ix, 'a1')
    expect(d?.key).toBe('משה')
    expect(d?.others).toBe(1)
    expect(d?.verified.map(v => v.id)).toEqual(['a4'])
    expect(dupInfo(ix, 'a4')).toBeNull()
    expect(dupInfo(ix, 'b1')).toBeNull()
  })
})

describe('עזרים', () => {
  it('נתיב מהשורש', () => {
    expect(pathNames(buildLadderIndex(tree()), 'a1x')).toEqual(['השורש', 'אברהם', 'משה', 'יוסף'])
  })
  it('משפחות בכל הענף', () => {
    const ix = buildLadderIndex(tree())
    expect(familiesInBranch(ix, 'a1', { a1: [1], a1y: [1, 2], b1: [1] })).toBe(3)
  })
})
