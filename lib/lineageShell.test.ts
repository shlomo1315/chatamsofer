import { describe, it, expect } from 'vitest'
import { buildShellData, initials, pathTo, type ShellNode } from './lineageShell'

const n = (id: string, generation: number, parent_id: string | null, status?: ShellNode['status']): ShellNode =>
  ({ id, name: id, generation, parent_id, status })

describe('buildShellData', () => {
  const nodes = [
    n('r', 5, null, 'verified'),
    n('a', 6, 'r', 'verified'), n('b', 6, 'r', 'pending'),
    n('a1', 7, 'a', 'pending'), n('a2', 7, 'a', 'rejected'), n('a11', 8, 'a1', 'pending'),
    n('b1', 7, 'b', 'verified'),
  ]
  const d = buildShellData(nodes)

  it('מזהה שורש וגזעים לפי גודל', () => {
    expect(d.root?.id).toBe('r')
    expect(d.trunks.map(t => t.node.id)).toEqual(['a', 'b'])
  })
  it('סופר צאצאים בלי הצומת עצמו', () => {
    expect(d.trunks[0].stat.desc).toBe(3)
    expect(d.trunks[1].stat.desc).toBe(1)
    expect(d.stats.get('r')?.desc).toBe(6)
  })
  it('סופר סטטוסים ודורות מנורמלים לשורש=דור 1', () => {
    expect(d.verified).toBe(3)
    expect(d.pending).toBe(3)
    expect(d.rejected).toBe(1)
    expect(d.maxGen).toBe(4)
    expect(d.genTotals).toEqual([1, 2, 3, 1])
    expect(d.trunks[0].byGen).toEqual([0, 1, 2, 1])
  })
  it('נתיב וראשי תיבות', () => {
    expect(pathTo('a11', d.byId).map(x => x.id)).toEqual(['r', 'a', 'a1', 'a11'])
    expect(initials('רבי אברהם שמואל בנימין')).toBe('אש')
  })
  it('עץ ריק', () => {
    const e = buildShellData([])
    expect(e.root).toBeNull()
    expect(e.trunks).toEqual([])
  })
})
