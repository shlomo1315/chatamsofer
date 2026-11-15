import { describe, it, expect } from 'vitest'
import { normalizeCommunity, unifyIdentical, suggestGroups, buildResolver, mergeInto } from './communityMerge'

describe('normalizeCommunity', () => {
  it('מנקה רווחים וגרשיים', () => {
    expect(normalizeCommunity('  סאטמר  ')).toBe('סאטמר')
    expect(normalizeCommunity('בעלזא"י')).toBe('בעלזאי')
    expect(normalizeCommunity("חב'ד  ירושלים")).toBe('חבד ירושלים')
  })
})

describe('unifyIdentical', () => {
  it('מאחד זהים ומסכם ספירה', () => {
    const r = unifyIdentical([{ name: 'ליטאי', count: 3 }, { name: ' ליטאי ', count: 2 }, { name: 'חסידי', count: 1 }])
    expect(r.find(x => x.name === 'ליטאי')?.count).toBe(5)
    expect(r).toHaveLength(2)
  })
})

describe('suggestGroups', () => {
  it('מציע ריבוי ושוני קטן', () => {
    const g = suggestGroups([
      { name: 'ליטאי', count: 10 }, { name: 'ליטאים', count: 4 }, { name: 'חסידי', count: 7 },
      { name: 'ספרדי', count: 5 }, { name: 'ספרדים', count: 1 }, { name: 'ברסלב', count: 2 },
    ])
    expect(g).toHaveLength(2)
    expect(g[0].names.map(n => n.name)).toEqual(['ליטאי', 'ליטאים'])
    expect(g[0].total).toBe(14)
  })
  it('לא מציע שמות שונים וגם לא "לא צוין"', () => {
    expect(suggestGroups([{ name: 'חסידי', count: 1 }, { name: 'ליטאי', count: 1 }, { name: 'לא צוין', count: 3 }])).toEqual([])
  })
})

describe('buildResolver + mergeInto', () => {
  const names = ['ליטאי', 'ליטאי ', 'ליטאי', 'ליטאים', 'חסידי']
  it('מאחד זהים אוטומטית', () => {
    const f = buildResolver(names, {})
    expect(f('ליטאי ')).toBe('ליטאי')
    expect(f('ליטאים')).toBe('ליטאים')
  })
  it('מחיל מיזוג ידני', () => {
    const map = mergeInto({}, ['ליטאי', 'ליטאים'], 'ליטאי')
    const f = buildResolver(names, map)
    expect(f('ליטאים')).toBe('ליטאי')
    expect(f('חסידי')).toBe('חסידי')
  })
  it('מיזוג נוסף מעדכן יעד קודם', () => {
    const m1 = mergeInto({}, ['ליטאי', 'ליטאים'], 'ליטאי')
    const m2 = mergeInto(m1, ['ליטאי', 'ליטוואק'], 'ליטוואק')
    expect(m2['ליטאים']).toBe('ליטוואק')
    expect(m2['ליטאי']).toBe('ליטוואק')
  })
})
