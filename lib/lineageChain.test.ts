import { describe, it, expect } from 'vitest'
import { ancestorChain, ancestorIds, isAncestor } from './lineageChain'

// 🔴 מה שנבדק כאן הוא ההתנהגות מול נתונים *פגומים*. מעגל בעץ אינו
// תיאורטי — הוא קרה בפרודקשן ב-25.08, והתצוגה הציגה "דור 50" משני שמות.

const mk = (rows: [string, string | null][]) =>
  new Map(rows.map(([id, parent_id]) => [id, { id, parent_id }]))

describe('שרשרת תקינה', () => {
  const m = mk([['a', null], ['b', 'a'], ['c', 'b'], ['d', 'c']])

  it('מוחזרת מהשורש אל הצומת', () => {
    const r = ancestorChain('d', m)
    expect(r.chain.map(n => n.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(r.cycle).toBe(false)
  })

  it('שורש מחזיר את עצמו בלבד', () => {
    expect(ancestorIds('a', m)).toEqual(['a'])
  })

  it('מזהה לא קיים מחזיר ריק ולא זורק', () => {
    expect(ancestorChain('nope', m).chain).toEqual([])
    expect(ancestorChain(null, m).chain).toEqual([])
    expect(ancestorChain(undefined, m).chain).toEqual([])
  })
})

describe('🔴 מעגל בנתונים', () => {
  it('נעצר ומדווח — במקום להמציא דורות', () => {
    // בדיוק המקרה מהפרודקשן: שניים שכל אחד הורה של השני.
    const m = mk([['x', 'y'], ['y', 'x']])
    const r = ancestorChain('x', m)
    expect(r.cycle).toBe(true)
    // ⚠️ כל צומת מופיע *פעם אחת*. כפילות נראית כמו דור אמיתי.
    expect(new Set(r.chain.map(n => n.id)).size).toBe(r.chain.length)
    expect(r.chain.length).toBeLessThanOrEqual(2)
  })

  it('מעגל בתוך שרשרת ארוכה נעצר בנקודת המעגל', () => {
    const m = mk([['a', null], ['b', 'a'], ['c', 'b'], ['d', 'c'], ['b2', 'd']])
    // הופכים את a לילד של b2 — סוגר מעגל
    m.set('a', { id: 'a', parent_id: 'b2' })
    const r = ancestorChain('d', m)
    expect(r.cycle).toBe(true)
    expect(new Set(r.chain.map(n => n.id)).size).toBe(r.chain.length)
  })

  it('צומת שהוא הורה של עצמו', () => {
    const m = mk([['s', 's']])
    const r = ancestorChain('s', m)
    expect(r.cycle).toBe(true)
    expect(r.chain.map(n => n.id)).toEqual(['s'])
  })

  it('⚠️ אינו נתקע — הבדיקה עצמה מסתיימת', () => {
    // 🔴 בלי seen הלולאה הייתה אינסופית והדפדפן היה קופא.
    const m = mk([['p', 'q'], ['q', 'p']])
    const t0 = Date.now()
    ancestorChain('p', m)
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})

describe('בדיקת אב-קדמון', () => {
  const m = mk([['g1', null], ['g2', 'g1'], ['g3', 'g2']])

  it('מזהה אב-קדמון רחוק', () => {
    expect(isAncestor('g1', 'g3', m)).toBe(true)
    expect(isAncestor('g2', 'g3', m)).toBe(true)
  })

  it('אינו מזהה בכיוון ההפוך', () => {
    expect(isAncestor('g3', 'g1', m)).toBe(false)
  })

  it('⚠️ צומת אינו אב-קדמון של עצמו', () => {
    expect(isAncestor('g2', 'g2', m)).toBe(false)
  })

  it('⚠️ אינו נתקע על נתונים מעגליים', () => {
    const broken = mk([['x', 'y'], ['y', 'x']])
    expect(typeof isAncestor('x', 'y', broken)).toBe('boolean')
  })
})
