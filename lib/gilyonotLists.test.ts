import { describe, it, expect } from 'vitest'
import { mergeRecipients } from './gilyonotLists'

const g = (id: string, rows: [string, string | null][]) => ({ id, name: id, rows: rows.map(([email, subscriberId]) => ({ email, subscriberId })) })

describe('mergeRecipients', () => {
  it('מי שבכמה רשימות מקבל פעם אחת', () => {
    const r = mergeRecipients([g('a', [['x@a.com', 's1'], ['y@a.com', 's2']]), g('b', [['X@a.com ', null], ['z@a.com', null]])], new Set())
    expect(r.recipients.map(x => x.email).sort()).toEqual(['x@a.com', 'y@a.com', 'z@a.com'])
    expect(r.duplicates).toBe(1)
  })
  it('שומר subscriberId גם אם הרשימה בלעדיו הופיעה קודם', () => {
    const r = mergeRecipients([g('b', [['x@a.com', null]]), g('a', [['x@a.com', 's1']])], new Set())
    expect(r.recipients).toEqual([{ email: 'x@a.com', subscriberId: 's1' }])
  })
  it('מסנן מוסרים וכתובות לא תקינות', () => {
    const r = mergeRecipients([g('a', [['x@a.com', null], ['bad', null], ['gone@a.com', null]]), g('b', [['gone@a.com', null]])], new Set(['gone@a.com']))
    expect(r.recipients.map(x => x.email)).toEqual(['x@a.com'])
    expect(r.suppressed).toBe(1)
    expect(r.perList[1].count).toBe(0)
  })
})
