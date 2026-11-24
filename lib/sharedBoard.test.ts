import { describe, it, expect } from 'vitest'
import {
  registrationSeries, areaPaths, dayAxis, channelShares, conicOf, topCounts, kidsBuckets,
  maternityFunnel, inPeriod, byRecoveryHome, paidByMonth, generationCounts, fanRings,
  familyAmount, filterMoneyRows, moneySummary, moneyByCommunity, countdownParts, EMPTY_FILTER, NO_COMMUNITY,
  hourCounts, weekdayHourMatrix, hourlySeries, kidsBucketOf, isFiltered, toggleIn,
} from './sharedBoard'

describe('סינון מורחב ושעות', () => {
  // 2026-11-22 הוא יום ראשון. התאריכים בשעון מקומי, כמו בדפדפן.
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString()
  const rows = [
    { registered_at: at(22, 9), beneficiary: { city: 'ירושלים', children_count: 2 } },
    { registered_at: at(22, 9, 40), beneficiary: { city: 'בני ברק', children_count: 7 } },
    { registered_at: at(23, 21), beneficiary: { city: 'ירושלים', children_count: 10 } },
    { registered_at: null, beneficiary: { city: ' ירושלים ', children_count: null } },
  ]
  it('ספירה לפי שעה ביממה', () => {
    const h = hourCounts(rows)
    expect(h).toHaveLength(24)
    expect(h[9]).toBe(2)
    expect(h[21]).toBe(1)
    expect(h.reduce((a, b) => a + b, 0)).toBe(3)
  })
  it('מפת חום של יום בשבוע מול שעה', () => {
    const m = weekdayHourMatrix(rows)
    expect(m).toHaveLength(7)
    expect(m[0][9]).toBe(2)
    expect(m[1][21]).toBe(1)
  })
  it('סדרה לפי שעה ממלאת שעות ריקות ומצטברת', () => {
    const s = hourlySeries(rows)
    expect(s.daily).toHaveLength(37) // 09:00 ביום ראשון עד 21:00 ביום שני
    expect(s.daily[0]).toBe(2)
    expect(s.cumulative[s.cumulative.length - 1]).toBe(3)
    const cut = hourlySeries(rows, 5)
    expect(cut.daily).toHaveLength(5)
    expect(cut.cumulative).toEqual([2, 2, 2, 2, 3]) // מה שלפני החלון נספר במצטבר
  })
  it('דלי ילדים', () => {
    expect([kidsBucketOf(0), kidsBucketOf(4), kidsBucketOf(8), kidsBucketOf(12), kidsBucketOf(null)]).toEqual(['0–2', '3–5', '6–8', '9+', null])
  })
  it('סינון לפי עיר, ילדים, שעות וימים', () => {
    expect(filterMoneyRows(rows, { ...EMPTY_FILTER, cities: ['ירושלים'] })).toEqual([rows[0], rows[2], rows[3]])
    expect(filterMoneyRows(rows, { ...EMPTY_FILTER, kids: ['6–8', '9+'] })).toEqual([rows[1], rows[2]])
    expect(filterMoneyRows(rows, { ...EMPTY_FILTER, hours: [9] })).toEqual([rows[0], rows[1]])
    expect(filterMoneyRows(rows, { ...EMPTY_FILTER, weekdays: [1] })).toEqual([rows[2]])
    expect(filterMoneyRows(rows, { ...EMPTY_FILTER, weekdays: [0], kids: ['0–2'] })).toEqual([rows[0]])
  })
  it('סינון פעיל והחלפת ערך ברשימה', () => {
    expect(isFiltered(EMPTY_FILTER)).toBe(false)
    expect(isFiltered({ ...EMPTY_FILTER, hours: [3] })).toBe(true)
    expect(toggleIn([1, 2], 2)).toEqual([1])
    expect(toggleIn([1], 2)).toEqual([1, 2])
  })
})

describe('מחוני כסף וקהילות', () => {
  const rows = [
    { amount: 500, approval_status: 'approved', source: 'phone', registered_at: '2026-11-20T10:00:00', beneficiary: { community_affiliation: 'סאטמר' } },
    { amount: null, approval_status: 'pending', source: 'portal', registered_at: '2026-11-22T10:00:00', beneficiary: { community_affiliation: 'בעלזא' } },
    { amount: null, approval_status: 'rejected', source: 'phone', registered_at: '2026-11-22T11:00:00', beneficiary: { community_affiliation: 'סאטמר' } },
    { amount: 300, approval_status: 'approved', source: 'admin', registered_at: '2026-11-23T10:00:00', beneficiary: null },
  ]
  it('סכום לנרשם גובר על הסכום הקבוע, ונדחה מקבל 0', () => {
    expect(familyAmount(rows[0], 400)).toBe(500)
    expect(familyAmount(rows[1], 400)).toBe(400)
    expect(familyAmount(rows[2], 400)).toBe(0)
  })
  it('סיכום: סך הכול, מאושר, ממתין וממוצע למשפחה שמקבלת', () => {
    expect(moneySummary(rows, 400)).toEqual({ total: 1200, approved: 800, pending: 400, families: 4, avg: 400 })
  })
  it('פילוח לפי קהילה, כולל "לא צוין", מהגבוה לנמוך', () => {
    expect(moneyByCommunity(rows, 400)).toEqual([
      { label: 'סאטמר', value: 500, count: 2 },
      { label: 'בעלזא', value: 400, count: 1 },
      { label: NO_COMMUNITY, value: 300, count: 1 },
    ])
  })
  it('סינון לפי קהילות, סטטוס, ערוץ, תאריכים וסכום', () => {
    expect(filterMoneyRows(rows, { ...EMPTY_FILTER, communities: ['סאטמר'] }, 400)).toHaveLength(2)
    expect(filterMoneyRows(rows, { ...EMPTY_FILTER, status: 'pending' }, 400)).toEqual([rows[1]])
    expect(filterMoneyRows(rows, { ...EMPTY_FILTER, channel: 'phone' }, 400)).toHaveLength(2)
    expect(filterMoneyRows(rows, { ...EMPTY_FILTER, from: '2026-11-22', to: '2026-11-22' }, 400)).toHaveLength(2)
    expect(filterMoneyRows(rows, { ...EMPTY_FILTER, minAmount: 350, maxAmount: 450 }, 400)).toEqual([rows[1]])
  })
  it('שעון עצר: ימים, שעות, דקות ושניות; אחרי המועד נגמר', () => {
    const now = Date.parse('2026-11-24T10:00:00Z')
    expect(countdownParts('2026-11-25T11:02:03Z', now)).toEqual({ done: false, days: 1, hours: 1, minutes: 2, seconds: 3 })
    expect(countdownParts('2026-11-24T09:00:00Z', now)?.done).toBe(true)
    expect(countdownParts('', now)).toBeNull()
  })
})

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
