import { describe, it, expect } from 'vitest'
import {
  CR_EMPTY, subRows, toggleF, stLevel, kpis, communityMoney, channelCounts, cityTop, hourCountsCr,
  rateBuckets, ratePerMinute, sparkPoints, pickup, freshIds, famLabel, latest, shekel, type CrRow,
} from './controlRoom'

const NOW = new Date(2026, 10, 24, 22, 41, 0).getTime()
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const row = (id: string, p: Partial<CrRow> & { comm?: string; city?: string; kids?: number } = {}): CrRow => ({
  id, amount: p.amount ?? 1000, approval_status: p.approval_status ?? 'approved', source: p.source ?? 'phone',
  registered_at: p.registered_at ?? at(60_000), card_linked_at: p.card_linked_at ?? null,
  beneficiary: { community_affiliation: p.comm ?? 'חסידית', city: p.city ?? 'בני ברק', children_count: p.kids ?? 2, family_name: 'כהן' },
})

describe('סינון בלחיצה', () => {
  const rows = [
    row('a', { comm: 'חסידית', city: 'בני ברק', source: 'phone' }),
    row('b', { comm: 'ליטאית', city: 'ירושלים', source: 'portal' }),
    row('c', { comm: 'חסידית', city: 'ירושלים', source: 'email' }),
  ]
  it('כל ממד מסנן, והגרף של הממד עצמו מתעלם ממנו', () => {
    const f = { ...CR_EMPTY, comm: 'חסידית', city: 'ירושלים' }
    expect(subRows(rows, f).map(r => r.id)).toEqual(['c'])
    expect(subRows(rows, f, 'city').map(r => r.id)).toEqual(['a', 'c'])
    expect(subRows(rows, { ...CR_EMPTY, ch: 'digital' }).map(r => r.id)).toEqual(['b'])
  })
  it('לחיצה שנייה על אותו ערך מבטלת', () => {
    const f = toggleF(CR_EMPTY, 'comm', 'חסידית')
    expect(f.comm).toBe('חסידית')
    expect(toggleF(f, 'comm', 'חסידית').comm).toBeNull()
    expect(toggleF(f, 'comm', 'ליטאית').comm).toBe('ליטאית')
  })
  it('מצב התצוגה של ערך', () => {
    expect(stLevel(CR_EMPTY, 'hour', 3)).toBe('')
    expect(stLevel({ ...CR_EMPTY, hour: 3 }, 'hour', 3)).toBe('sel')
    expect(stLevel({ ...CR_EMPTY, hour: 3 }, 'hour', 4)).toBe('dim')
  })
})

describe('מחוונים', () => {
  it('סך הכול, ממוצע, מאושר מול ממתין ונדחה = 0', () => {
    const k = kpis([
      row('a', { amount: 1000, kids: 2 }),
      row('b', { amount: 500, approval_status: 'pending', kids: 4 }),
      row('c', { amount: 900, approval_status: 'rejected', kids: 0 }),
    ], 600, NOW)
    expect(k).toMatchObject({ n: 3, sum: 1500, approved: 1000, pending: 500, avg: 500, kidsAvg: 2, today: 3 })
  })
  it('סכום קבוע לחלוקה כשאין סכום אישי, ו"היום" נספר מחצות', () => {
    const k = kpis([row('a', { amount: 0 }), row('b', { amount: 0, registered_at: at(23 * 3_600_000) })], 600, NOW)
    expect(k.sum).toBe(1200)
    expect(k.today).toBe(1)
  })
  it('פורמט שקלים', () => expect(shekel(1234567.4)).toBe('₪1,234,567'))
})

describe('גרפים', () => {
  it('קהילות לפי כסף, עם החלק הממתין', () => {
    const c = communityMoney([
      row('a', { comm: 'ליטאית', amount: 300 }),
      row('b', { comm: 'חסידית', amount: 1000, approval_status: 'pending' }),
      row('c', { comm: '', amount: 100 }),
    ])
    expect(c.map(x => x.label)).toEqual(['חסידית', 'ליטאית', 'לא צוין'])
    expect(c[0]).toMatchObject({ value: 1000, pending: 1000, count: 1 })
  })
  it('ערוצים בסדר קבוע, ו"לא תועד" רק כשיש', () => {
    expect(channelCounts([row('a'), row('b', { source: 'nedarim' })]).map(c => c.count)).toEqual([1, 1, 0, 0])
    const w = channelCounts([row('a', { source: 'xyz' })])
    expect(w.at(-1)).toEqual({ key: 'none', label: 'לא תועד', count: 1 })
  })
  it('ערים מובילות בלי ערים ריקות', () => {
    const c = cityTop([row('a', { city: 'אלעד' }), row('b', { city: 'בני ברק' }), row('c', { city: 'בני ברק' }), row('d', { city: '' })], 6)
    expect(c).toEqual([{ label: 'בני ברק', count: 2 }, { label: 'אלעד', count: 1 }])
  })
  it('שעות', () => {
    const h = hourCountsCr([row('a', { registered_at: new Date(2026, 10, 24, 9, 5).toISOString() })])
    expect(h[9]).toBe(1)
    expect(h.reduce((s, x) => s + x, 0)).toBe(1)
  })
})

describe('קצב רישום חי', () => {
  it('דליים של 15 שניות ונרשמים בדקה', () => {
    const b = rateBuckets([row('a', { registered_at: at(5_000) }), row('b', { registered_at: at(50_000) }),
      row('c', { registered_at: at(70_000) }), row('d', { registered_at: at(20 * 60_000) })], NOW)
    expect(b).toHaveLength(60)
    expect(b[59]).toBe(1)
    expect(ratePerMinute(b)).toBe(2)
    expect(b.reduce((s, x) => s + x, 0)).toBe(3)
  })
  it('נקודות הגרף לפי נוסחת המוקאפ', () => {
    const p = sparkPoints([0, 6])
    expect(p).toEqual([['0.0', '104.0'], ['600.0', '12.0']])
  })
  it('איסוף', () => {
    expect(pickup([row('a', { card_linked_at: at(1) }), row('b'), row('c', { approval_status: 'pending' })]))
      .toEqual({ registered: 3, arrived: 1, waiting: 1 })
  })
  it('נרשמים חדשים מהרענון, מהחדש לישן', () => {
    const rows = [row('a', { registered_at: at(9000) }), row('b', { registered_at: at(1000) }), row('c', { registered_at: at(5000) })]
    expect(freshIds(new Set(['a']), rows).map(r => r.id)).toEqual(['b', 'c'])
    expect(latest(rows, 2).map(r => r.id)).toEqual(['b', 'c'])
  })
  it('שם המשפחה בחלונית', () => {
    expect(famLabel(row('a'))).toBe('משפחת כהן')
    expect(famLabel({ id: 'x', beneficiary: { full_name: 'משה גרינפלד' } })).toBe('משפחת גרינפלד')
  })
})
