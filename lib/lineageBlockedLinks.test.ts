import { describe, it, expect } from 'vitest'
import { findBlockedLinks, type BlockedNode } from './lineageBlockedLinks'

// 🔴 חוליה חסומה = צומת לא-מאומת שילדיו מאומתים. הבורר מדלג עליו, ולכן כל
// תת-העץ שמתחתיו בלתי נגיש — המשפחה לא מוצאת את עצמה. בפועל 4 חוליות כאלה
// חסמו 38 צאצאים מאומתים, אחת מהן בדור 3.

const n = (id: string, parent: string | null, gen: number, status = 'verified'): BlockedNode =>
  ({ id, name: id, parent_id: parent, generation: gen, status })

describe('findBlockedLinks', () => {
  it('מוצא צומת ממתין שילדיו מאומתים', () => {
    const found = findBlockedLinks([
      n('root', null, 1), n('a', 'root', 2, 'pending'), n('b', 'a', 3),
    ])
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe('a')
    expect(found[0].verifiedChildren).toBe(1)
  })

  it('אינו מסמן צומת ממתין שכל ילדיו ממתינים', () => {
    expect(findBlockedLinks([
      n('root', null, 1), n('a', 'root', 2, 'pending'), n('b', 'a', 3, 'pending'),
    ])).toEqual([])
  })

  it('אינו מסמן עלה ממתין ללא ילדים כלל', () => {
    expect(findBlockedLinks([n('root', null, 1), n('a', 'root', 2, 'pending')])).toEqual([])
  })

  it('אינו מסמן צומת מאומת', () => {
    expect(findBlockedLinks([n('root', null, 1), n('a', 'root', 2), n('b', 'a', 3)])).toEqual([])
  })

  it('סופר את כל תת-העץ, לא רק ילדים ישירים', () => {
    const found = findBlockedLinks([
      n('root', null, 1), n('a', 'root', 2, 'pending'),
      n('b', 'a', 3), n('c', 'b', 4), n('d', 'b', 4, 'pending'),
    ])
    expect(found[0].subtreeSize).toBe(3)
  })

  it('ממיין לפי דור — הקרוב לשורש ראשון', () => {
    const found = findBlockedLinks([
      n('root', null, 1),
      n('deep', 'root', 7, 'pending'), n('deep-kid', 'deep', 8),
      n('near', 'root', 3, 'pending'), n('near-kid', 'near', 4),
    ])
    expect(found.map(f => f.id)).toEqual(['near', 'deep'])
  })

  it('מסמן ancestorsVerified=false כשיש חסימה גבוהה יותר', () => {
    const found = findBlockedLinks([
      n('root', null, 1),
      n('upper', 'root', 2, 'pending'),
      n('lower', 'upper', 3, 'pending'),
      n('kid', 'lower', 4),
      n('upper-kid', 'upper', 3),
    ])
    const lower = found.find(f => f.id === 'lower')!
    const upper = found.find(f => f.id === 'upper')!
    // upper הוא הצוואר האמיתי; lower חסום רק בגללו.
    expect(upper.ancestorsVerified).toBe(true)
    expect(lower.ancestorsVerified).toBe(false)
  })

  it('עמיד למעגל בעץ ואינו נתקע', () => {
    const cyclic: BlockedNode[] = [
      { id: 'x', name: 'x', parent_id: 'y', generation: 3, status: 'pending' },
      { id: 'y', name: 'y', parent_id: 'x', generation: 2, status: 'pending' },
      { id: 'k', name: 'k', parent_id: 'x', generation: 4, status: 'verified' },
    ]
    const found = findBlockedLinks(cyclic)
    expect(found.find(f => f.id === 'x')?.ancestorsVerified).toBe(false)
  })
})
