import { describe, it, expect } from 'vitest'
import { ancestorsToVerify, expandRejectionTargets } from './lineageRejectCascade'

type N = { id: string; parent_id: string | null; status?: string | null }
const tree = (list: N[]) => {
  const m = new Map(list.map(n => [n.id, n]))
  return (id: string) => m.get(id)
}

describe('ancestorsToVerify', () => {
  it('מאשר אבות ממתינים עד האב המאושר הראשון', () => {
    const get = tree([
      { id: 'a', parent_id: null, status: 'verified' },
      { id: 'b', parent_id: 'a', status: 'pending' },
      { id: 'c', parent_id: 'b', status: null },
    ])
    const r = ancestorsToVerify('c', get, 'd')
    expect(r.pending.map(n => n.id)).toEqual(['c', 'b'])
    expect(r.blockedBy).toBeNull()
  })

  it('נעצר באב פסול ולא מאשר אותו או את מה שמעליו', () => {
    const get = tree([
      { id: 'a', parent_id: null, status: 'pending' },
      { id: 'b', parent_id: 'a', status: 'rejected' },
      { id: 'c', parent_id: 'b', status: 'pending' },
    ])
    const r = ancestorsToVerify('c', get, 'd')
    expect(r.pending.map(n => n.id)).toEqual(['c'])
    expect(r.blockedBy?.id).toBe('b')
  })

  it('אב ישיר פסול — אין מה לאשר', () => {
    const r = ancestorsToVerify('b', tree([{ id: 'b', parent_id: null, status: 'rejected' }]), 'c')
    expect(r.pending).toEqual([])
    expect(r.blockedBy?.id).toBe('b')
  })

  it('מעגל בעץ ואב חסר — לא נתקע', () => {
    const get = tree([
      { id: 'a', parent_id: 'b', status: 'pending' },
      { id: 'b', parent_id: 'a', status: 'pending' },
    ])
    expect(ancestorsToVerify('a', get).pending.map(n => n.id)).toEqual(['a', 'b'])
    expect(ancestorsToVerify('a', get, 'a').pending).toEqual([])
    expect(ancestorsToVerify('missing', get).pending).toEqual([])
  })
})

describe('expandRejectionTargets', () => {
  const nodes = [
    { id: 'r', parent_id: null },
    { id: 'a', parent_id: 'r' },
    { id: 'a1', parent_id: 'a' },
    { id: 'a11', parent_id: 'a1' },
    { id: 'b', parent_id: 'r' },
    { id: 'b1', parent_id: 'b' },
  ]

  it('פסילה של צומת פוסלת את כל תת-העץ שלו בלבד', () => {
    expect(expandRejectionTargets(nodes, ['a']).sort()).toEqual(['a', 'a1', 'a11'])
  })

  it('צמתים חופפים ושני ענפים — כל צומת פעם אחת', () => {
    expect(expandRejectionTargets(nodes, ['a', 'a1', 'b']).sort()).toEqual(['a', 'a1', 'a11', 'b', 'b1'])
  })

  it('עלה — רק הוא', () => {
    expect(expandRejectionTargets(nodes, ['b1'])).toEqual(['b1'])
  })
})
