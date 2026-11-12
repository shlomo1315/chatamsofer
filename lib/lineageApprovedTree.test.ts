import { describe, it, expect } from 'vitest'
import { classifyLines, canApprove, computeApproved, refKeyOf, type ApprovedTreeNode } from './lineageApprovedTree'

const N = (id: string, name: string, generation: number, parent_id: string | null, ok: boolean): ApprovedTreeNode =>
  ({ id, name, generation, parent_id, ok })

const nodes = [
  N('hs', 'מרן החתם סופר זי"ע', 1, null, true),
  N('ks', 'רבי אברהם שמואל בנימין סופר', 2, 'hs', true),
  N('kr', 'רבי יעקב ומרת חיה קרויס', 2, 'hs', false),
  N('ys', 'רבי יואל סופר', 3, 'ks', false),
  N('mo', 'רבי משה ומלכה סופר', 3, 'ks', true),
  N('x4', 'רבי חנניה בלייכברד', 4, 'ys', false),
]
const byId = new Map(nodes.map(n => [n.id, n]))

describe('אב לפני ילד', () => {
  it('ילד של אב מאושר ניתן לאישור', () => expect(canApprove(byId.get('ys')!, byId)).toBe(true))
  it('ילד של אב לא מאושר חסום', () => expect(canApprove(byId.get('x4')!, byId)).toBe(false))
  it('מאושר או שורש אינם ניתנים לאישור', () => {
    expect(canApprove(byId.get('mo')!, byId)).toBe(false)
    expect(canApprove(byId.get('hs')!, byId)).toBe(false)
  })
})

describe('סיווג שורות', () => {
  const c = (l: string, g = 3, p: string | null = 'ks') => classifyLines([l], nodes, g, p)[0]!
  it('נמצא בעץ וממתין → found', () => expect(c('רבי יואל סופר')).toMatchObject({ kind: 'found', nodeId: 'ys' }))
  it('כבר מאושר → skip', () => expect(c('רבי משה סופר ומלכה').kind).toBe('new'))
  it('כבר מאושר באותו שם → skip', () => expect(c('רבי משה ומלכה סופר').kind).toBe('skip'))
  it('שם חדש → new', () => expect(c('רבי מאיר סופר').kind).toBe('new'))
  it('אותו שם בדור אחר → red', () => expect(c('רבי יעקב קרויס', 3).kind).toBe('red'))
  it('בעל בלי האישה מזוהה כאותו אדם', () => expect(c('רבי יעקב קרויס', 2, 'hs')).toMatchObject({ kind: 'found', nodeId: 'kr' }))
  it('אותו דור תחת אב אחר, לא מאושר → red', () => expect(c('רבי יואל סופר', 3, 'kr').kind).toBe('red'))
  it('שורה ריקה → null', () => expect(classifyLines(['  '], nodes, 3, 'ks')[0]).toBeNull())
  it('כפילות בתוך ההדבקה נדלגת', () => {
    const r = classifyLines(['רבי מאיר סופר', 'רבי מאיר סופר'], nodes, 3, 'ks')
    expect(r.map(x => x!.kind)).toEqual(['new', 'skip'])
  })
})

describe('computeApproved', () => {
  const refs = [
    { key: 'a', name: 'החתם סופר', generation: 1, parent_key: null },
    { key: 'b', name: 'רבי אברהם שמואל בנימין סופר', generation: 2, parent_key: 'a' },
    { key: 'c', name: 'רבי משה ומלכה סופר', generation: 3, parent_key: 'b' },
    { key: 'd', name: 'רבי יואל סופר', generation: 3, parent_key: 'kr-other' },
  ]
  const raw = nodes.map(({ ok: _ok, ...n }) => n)
  const res = new Map(computeApproved(raw, refs).map(n => [n.id, n.ok]))
  it('שורש ושם+דור תואמים מאושרים', () => {
    expect(res.get('hs')).toBe(true); expect(res.get('ks')).toBe(true); expect(res.get('mo')).toBe(true)
  })
  it('לא בקובץ — ממתין', () => expect(res.get('kr')).toBe(false))
  it('אותו שם ודור אבל אב אחר בקובץ — לא מאושר', () => expect(res.get('ys')).toBe(false))
  it('מפתח הקובץ של צומת מאושר', () => {
    expect(refKeyOf(raw[1], 'מרן החתם סופר זי"ע', refs)).toBe('b')
  })
})

describe('דורות עמוקים (מעבר ל-5)', () => {
  const deep = [
    N('a5', 'רבי אלעזר סופר', 5, null, true),
    N('a6', 'רבי דוד סופר', 6, 'a5', false),
    N('a7', 'רבי נתן סופר', 7, 'a6', false),
  ]
  const m = new Map(deep.map(n => [n.id, n]))
  it('דור 6 ניתן לאישור כשאביו מאושר', () => expect(canApprove(m.get('a6')!, m)).toBe(true))
  it('דור 7 חסום עד שאביו (דור 6) מאושר', () => expect(canApprove(m.get('a7')!, m)).toBe(false))
  it('סיווג בדור 6: קיים וממתין → found, שם חדש → new', () => {
    expect(classifyLines(['רבי דוד סופר'], deep, 6, 'a5')[0]).toMatchObject({ kind: 'found', nodeId: 'a6' })
    expect(classifyLines(['רבי שמעון סופר'], deep, 6, 'a5')[0]!.kind).toBe('new')
  })
})
