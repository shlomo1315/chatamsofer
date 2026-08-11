import { describe, it, expect } from 'vitest'
import { buildClusters, suggestKeep, riskOf, clusterNameKey, type ClusterNode, type ClusterMember } from './mergeClusters'

const n = (o: Partial<ClusterNode> & { id: string }): ClusterNode => ({
  name: 'רבי משה שרייבר', parent_id: 'p1', generation: 6, status: 'verified', ...o,
})
const m = (o: Partial<ClusterMember> & { id: string }): ClusterMember => ({
  name: 'x', parent_id: null, generation: 6, status: 'verified',
  children: 0, beneficiaryIds: [], beneficiaryNames: [], ...o,
})
const build = (nodes: ClusterNode[], kids: [string, number][] = [], bens: [string, { id: string; name: string }[]][] = []) =>
  buildClusters(nodes, new Map(kids), new Map(bens))

describe('clusterNameKey', () => {
  it('מכווץ רווחים בלבד — בלי להסיר תארים', () => {
    expect(clusterNameKey('  רבי  משה   שרייבר ')).toBe('רבי משה שרייבר')
    expect(clusterNameKey('רבי ישראל וייס')).not.toBe('ישראל וייס')
  })
})

describe('buildClusters', () => {
  // 🔴 ההבדל המהותי מ-safeMergeGroups
  it('תופס עותקים תחת אבות *שונים* — מה שהמסלול הבטוח מפספס', () => {
    const c = build([n({ id: 'a', parent_id: 'p1' }), n({ id: 'b', parent_id: 'p2' }), n({ id: 'c', parent_id: 'p3' })])
    expect(c).toHaveLength(1)
    expect(c[0].members).toHaveLength(3)
    expect(c[0].sameParent).toBe(false)
    expect(c[0].removable).toBe(2)
  })

  it('מסמן אשכול שכולו תחת אב אחד', () => {
    expect(build([n({ id: 'a' }), n({ id: 'b' })])[0].sameParent).toBe(true)
  })

  it('שם זהה בדורות שונים אינו אותו אשכול', () => {
    expect(build([n({ id: 'a', generation: 6 }), n({ id: 'b', generation: 7 })])).toHaveLength(0)
  })

  it('צומת יחיד אינו אשכול', () => {
    expect(build([n({ id: 'a' })])).toHaveLength(0)
  })

  it('rejected אינו משתתף', () => {
    expect(build([n({ id: 'a' }), n({ id: 'b', status: 'rejected' })])).toHaveLength(0)
  })

  it('שם ריק אינו נספר', () => {
    expect(build([n({ id: 'a', name: '   ' }), n({ id: 'b', name: '' })])).toHaveLength(0)
  })

  it('הגדולים תחילה', () => {
    const c = build([
      n({ id: 'a', name: 'קטן' }), n({ id: 'b', name: 'קטן' }),
      n({ id: 'c', name: 'גדול' }), n({ id: 'd', name: 'גדול' }), n({ id: 'e', name: 'גדול' }),
    ])
    expect(c[0].name).toBe('גדול')
    expect(c[0].removable).toBe(2)
  })
})

describe('דירוג סיכון', () => {
  it('בלי כרטסת = נקי', () => expect(riskOf(0)).toBe('clean'))
  it('כרטסת אחת = בטוח', () => expect(riskOf(1)).toBe('single_card'))
  it('שתי כרטסות ומעלה = דורש הכרעה', () => expect(riskOf(2)).toBe('multi_card'))

  // 🔴 המקרה שסוכם: מזהיר, לא חוסם
  it('שתי כרטסות שונות באשכול מסומן multi_card', () => {
    const c = build(
      [n({ id: 'a' }), n({ id: 'b' })], [],
      [['a', [{ id: 'ben1', name: 'כהן משה' }]], ['b', [{ id: 'ben2', name: 'לוי משה' }]]],
    )
    expect(c[0].risk).toBe('multi_card')
    expect(c[0].cardCount).toBe(2)
  })

  it('אותה כרטסת בשני צמתים אינה שתי כרטסות', () => {
    const c = build(
      [n({ id: 'a' }), n({ id: 'b' })], [],
      [['a', [{ id: 'ben1', name: 'כהן משה' }]], ['b', [{ id: 'ben1', name: 'כהן משה' }]]],
    )
    expect(c[0].cardCount).toBe(1)
    expect(c[0].risk).toBe('single_card')
  })
})

describe('suggestKeep', () => {
  it('כרטסת מנצחת מספר ילדים', () => {
    expect(suggestKeep([
      m({ id: 'many-kids', children: 9 }),
      m({ id: 'has-card', children: 0, beneficiaryIds: ['b1'] }),
    ])).toBe('has-card')
  })

  it('בין שווים — מי שיש לו יותר ילדים', () => {
    expect(suggestKeep([m({ id: 'a', children: 2 }), m({ id: 'b', children: 7 })])).toBe('b')
  })

  it('מאושר לפני ממתין', () => {
    expect(suggestKeep([
      m({ id: 'pending', status: 'pending' }), m({ id: 'ok', status: 'verified' }),
    ])).toBe('ok')
  })

  it('יציב — אותו קלט, אותה הצעה', () => {
    const g = [m({ id: 'zz' }), m({ id: 'aa' })]
    expect(suggestKeep(g)).toBe(suggestKeep([...g].reverse()))
  })
})
