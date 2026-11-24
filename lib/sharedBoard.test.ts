import { describe, it, expect } from 'vitest'
import {
  registrationSeries, areaPaths, dayAxis, channelShares, conicOf, topCounts, kidsBuckets,
  maternityFunnel, inPeriod, byRecoveryHome, paidByMonth, generationCounts, fanRings,
} from './sharedBoard'

describe('registrationSeries', () => {
  it('ממלא ימים ריקים באפס ומצטבר', () => {
    const s = registrationSeries([
      { registered_at: '2026-11-20T09:00:00' },
      { registered_at: '2026-11-20T18:00:00' },
      { registered_at: '2026-11-22T10:00:00' },
      { registered_at: null },
    ])
    expect(s.daily).toEqual([2, 0, 1])
    expect(s.cumulative).toEqual([2, 2, 3])
  })
  it('בלי רישומים מחזיר מערכים ריקים', () => {
    expect(registrationSeries([]).daily).toEqual([])
  })
})

describe('areaPaths', () => {
  it('הקו מתחיל בתחתית ומסתיים בראש', () => {
    const p = areaPaths([0, 5, 10], 600, 170, 8)
    expect(p.line).toBe('M0,162 L300,85 L600,8')
    expect(p.area.endsWith('L600,170 L0,170 Z')).toBe(true)
  })
  it('נקודה אחת נמתחת לקו ישר', () => {
    expect(areaPaths([4]).line).toBe('M0,8 L600,8')
  })
})

it('dayAxis — ארבע תוויות', () => {
  expect(dayAxis(12)).toEqual(['יום 1', 'יום 4', 'יום 8', 'יום 12'])
  expect(dayAxis(1)).toEqual(['יום 1'])
})

describe('channelShares', () => {
  it('נדרים נספר כדיגיטלי, ערוץ חסר בשורה נפרדת', () => {
    const c = channelShares([{ source: 'phone' }, { source: 'nedarim' }, { source: 'portal' }, { source: null }])
    expect(c.map(x => [x.key, x.count])).toEqual([['phone', 1], ['digital', 2], ['email', 0], ['manual', 0], ['none', 1]])
    expect(c[1].pct).toBe(50)
  })
  it('conicOf מצטבר לפי הסדר', () => {
    expect(conicOf([{ pct: 25, color: 'a' }, { pct: 75, color: 'b' }])).toBe('conic-gradient(a 0 25%,b 0 100%)')
    expect(conicOf([])).toContain('var(--track)')
  })
})

it('topCounts ו-kidsBuckets', () => {
  expect(topCounts([{ c: 'ב״ב' }, { c: 'ב״ב' }, { c: 'ירושלים' }, { c: ' ' }], r => r.c)).toEqual([
    { label: 'ב״ב', value: 2 }, { label: 'ירושלים', value: 1 },
  ])
  expect(kidsBuckets([{ children_count: 2 }, { children_count: 5 }, { children_count: 9 }, { children_count: null }]).map(b => b.value))
    .toEqual([1, 1, 0, 1])
})

describe('עזר יולדות', () => {
  const rows = [
    { birth_date: '2026-11-02', recovery_home: 'א', recovery_arrived: true, recovery_arrived_at: '2026-11-05', recovery_nights: 3, recovery_amount: 1200, receiptCount: 1 },
    { birth_date: '2026-10-10', recovery_home: 'א', recovery_arrived: true, recovery_arrived_at: '2026-10-12', recovery_nights: 2, recovery_amount: 800, receiptCount: 0 },
    { birth_date: '2026-06-01', recovery_home: 'ב', recovery_arrived: false },
    { birth_date: '2026-03-01', recovery_home: '' },
  ]
  it('משפך: חויבה רק מי שהגיעה ויש לה קבלה', () => {
    expect(maternityFunnel(rows)).toEqual({ born: 4, arrived: 2, billed: 1, paid: 1200, waiting: 1 })
  })
  it('סינון תקופה לפי תאריך לידה', () => {
    const now = new Date('2026-11-24T12:00:00')
    expect(inPeriod(rows, 1, now)).toHaveLength(1)
    expect(inPeriod(rows, 3, now)).toHaveLength(2)
    expect(inPeriod(rows, null, now)).toHaveLength(4)
  })
  it('סיכום לפי בית החלמה', () => {
    expect(byRecoveryHome(rows)).toEqual([
      { home: 'א', arrived: 2, nights: 5, paid: 1200, unbilled: 1 },
      { home: 'ב', arrived: 0, nights: 0, paid: 0, unbilled: 0 },
    ])
  })
  it('תשלומים לפי חודש ההגעה, שישה חודשים', () => {
    const m = paidByMonth(rows, new Date('2026-11-24T12:00:00'))
    expect(m.map(x => x.label)).toEqual(['יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר'])
    expect(m.map(x => x.value)).toEqual([0, 0, 0, 0, 0, 1200])
  })
})

describe('צאצאים', () => {
  const counts = generationCounts([{ generation: 1 }, { generation: 2 }, { generation: 2 }, { generation: 3 }, { generation: 0 }])
  it('ספירה לפי דור', () => {
    expect(counts).toEqual([{ generation: 1, count: 1 }, { generation: 2, count: 2 }, { generation: 3, count: 1 }])
  })
  it('טבעות: הדור הראשון במרכז, השאר מ-62 עד 166', () => {
    const r = fanRings(counts)
    expect(r.map(x => x.r)).toEqual([62, 166])
    expect(r[0].opacity).toBe(0.85)
    expect(r[0].dash).toBeCloseTo(Math.PI * 62 / 2 - 2, 0)
  })
})
