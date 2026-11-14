import { describe, expect, it } from 'vitest'
import type { DonorRow } from '@/lib/donorReport'
import {
  EMPTY_FILTER, checkSums, dimValues, filterView, groupBy, matches, monthKey, totals, ascending, STATE_LABELS, type ViewFilter,
} from '@/lib/donorReportCalc'

const CITIES = ['בני ברק', 'ירושלים', 'בית שמש', 'לא צוין']
const HOMES = ['אם וילד', 'ביכורים', 'גלי צאנז']
const COMMS = ['ליטאית', 'חסידית', 'לא צוין']

// נתוני דמה דטרמיניסטיים: 120 יולדות, חלקן בלי סכום, תאומים ושלישיות.
const rows: DonorRow[] = Array.from({ length: 120 }, (_, i) => ({
  id: `a${i}`,
  name: `משפחה${i % 17} פלוני${i}`,
  home: HOMES[i % 3],
  date: `2026-${String(1 + (i % 11)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
  amount: i % 9 === 0 ? 0 : 400 + (i * 37) % 900,
  note: i % 9 === 0 ? 'הסבר' : null,
  city: CITIES[i % 4],
  community: COMMS[i % 3],
  kind: (i % 25 === 0 ? 3 : i % 13 === 0 ? 2 : 1) as 1 | 2 | 3,
  nights: i % 9 === 0 ? null : 2 + (i % 2),
  eligibleNights: 2,
  arrived: false,
  idLast4: String(1000 + i),
}))

const none = new Set<string>()
const f = (p: Partial<ViewFilter>): ViewFilter => ({ ...EMPTY_FILTER, ...p })

describe('סכומים מסתכמים בכל סינון', () => {
  const combos: Partial<ViewFilter>[] = [
    {}, { city: 'בני ברק' }, { city: 'לא צוין' }, { comm: 'חסידית' }, { home: 'ביכורים' }, { birth: 'תאומים' },
    { birth: 'שלישייה' }, { state: 'ממתינה' }, { state: 'מומש' }, { month: '03/26' },
    { city: 'ירושלים', comm: 'ליטאית', home: 'אם וילד' }, { q: 'משפחה3' }, { q: 'לא קיים' },
    { city: 'בית שמש', state: 'מומש', birth: 'רגילה', month: '07/26' },
  ]
  it.each(combos)('%j', c => {
    const shown = filterView(rows, f(c), none)
    expect(checkSums(rows, shown)).toBe(true)
    const t = totals(shown)
    for (const k of ['city', 'comm', 'home', 'month', 'birth', 'state'] as const) {
      const gs = groupBy(shown, k, dimValues(rows, k))
      expect(gs.reduce((a, g) => a + g.amount, 0)).toBe(t.amount)
      expect(gs.reduce((a, g) => a + g.count, 0)).toBe(t.count)
    }
    expect(t.paid + t.pending).toBe(t.count)
  })
})

describe('מסננים וחיפוש', () => {
  it('חיפוש לפי שם', () => {
    const s = filterView(rows, f({ q: 'פלוני7' }), none)
    expect(s.length).toBeGreaterThan(0)
    expect(s.every(r => r.name.includes('פלוני7'))).toBe(true)
  })
  it('חיפוש לפי ת.ז. רק לפי התאמה מהשרת', () => {
    expect(filterView(rows, f({ q: '123456789' }), none)).toHaveLength(0)
    expect(filterView(rows, f({ q: '123456789' }), new Set(['a5'])).map(r => r.id)).toEqual(['a5'])
  })
  it('ספירת צ׳יפ מתעלמת מהמסנן של אותו ממד', () => {
    const flt = f({ city: 'בני ברק', home: 'ביכורים' })
    const n = rows.filter(r => matches(r, flt, none, 'city') && r.city === 'ירושלים').length
    expect(n).toBe(rows.filter(r => r.home === 'ביכורים' && r.city === 'ירושלים').length)
  })
  it('בלי ״ללא צורך״ ובלי ₪0: מצב רק מומש או ממתינה', () => {
    expect([...STATE_LABELS]).toEqual(['מומש', 'ממתינה'])
    expect(dimValues(rows, 'state')).not.toContain('ללא צורך')
  })
  it('עיר וקהילה חסרות מופיעות כ״לא צוין״', () => {
    expect(dimValues(rows, 'city')).toContain('לא צוין')
    expect(dimValues(rows, 'comm')).toContain('לא צוין')
  })
})

describe('עזרים', () => {
  it('monthKey', () => {
    expect(monthKey('2026-10-05')).toBe('10/26')
    expect(monthKey('')).toBe('לא צוין')
  })
  it('totals: לילות בפועל, תאומים ושלישיות', () => {
    const t = totals(rows)
    expect(t.nights).toBe(rows.reduce((a, r) => a + (r.nights ?? 0), 0))
    expect(t.twins).toBe(rows.filter(r => r.kind === 2).length)
    expect(t.triplets).toBe(rows.filter(r => r.kind === 3).length)
  })
  it('ascending ממיין מהישנה לחדשה', () => {
    const a = ascending(rows).map(r => r.date)
    expect(a).toEqual([...a].sort())
  })
  it('חודשים כרונולוגית', () => {
    const m = dimValues(rows, 'month')
    expect(m[0]).toBe('01/26')
    expect(m[m.length - 1]).toBe('11/26')
  })
})

describe('סינון לפי תאריך', () => {
  const rows = [
    { id: 'a', date: '2026-09-01' }, { id: 'b', date: '2026-09-15' }, { id: 'c', date: '2026-10-01' }, { id: 'd', date: '' },
  ] as never[]
  const ids = (p: Partial<ViewFilter>) => filterView(rows, f(p), new Set()).map((r: { id: string }) => r.id).join('')
  it('טווח כולל קצוות, ושורה בלי תאריך נופלת', () => {
    expect(ids({ from: '2026-09-01', to: '2026-09-15' })).toBe('ab')
    expect(ids({ from: '2026-09-16' })).toBe('c')
    expect(ids({ to: '2026-09-01' })).toBe('a')
    expect(ids({})).toBe('abcd')
  })
})
