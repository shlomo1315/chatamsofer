import { describe, expect, it } from 'vitest'
import { buildDistributorDashboard, matchesIssue, type DashboardRow } from './gilyonotDistributors'

const row = (p: Partial<DashboardRow>): DashboardRow => ({
  city: 'בני ברק', quantity: 10, status: 'active', route: 1, phone: '0521111111', phone2: null, created_at: '2026-09-10T10:00:00Z', removed_at: null, ...p,
})
const rows: DashboardRow[] = [
  row({}),
  row({ route: null, phone: '052-222-2222' }),
  row({ city: 'אלעד', route: null, quantity: 0, phone: null, created_at: '2026-10-02T10:00:00Z' }),
  row({ city: 'אלעד', route: null, phone: '0522222222', created_at: '2026-10-03T10:00:00Z' }),
  row({ city: null, phone: '0533333333', phone2: '0521111111' }),
  row({ status: 'removed', removed_at: '2026-10-05T10:00:00Z', phone: '0522222222' }),
]
const now = new Date('2026-10-15T12:00:00Z')

describe('buildDistributorDashboard', () => {
  const d = buildDistributorDashboard(rows, now)

  it('סיכומים, כיסוי ומצב המערך', () => {
    expect(d.totals).toEqual({ active: 5, removed: 1, quantity: 40, routed: 2, coverage: 40 })
    expect(d.status.map(s => s.value)).toEqual([2, 3, 1])
    const bb = d.cities.find(c => c.city === 'בני ברק')!
    expect(bb).toMatchObject({ distributors: 2, routed: 1, unrouted: 1, coverage: 50, quantity: 20 })
    expect(d.cities.find(c => c.city === 'אלעד')).toMatchObject({ coverage: 0, unrouted: 2 })
  })

  it('בעיות: הוסרו לא נספרים, טלפון כפול כולל טלפון נוסף ומקפים', () => {
    expect(d.issues).toEqual({ cityNoRoutes: 1, noRoute: 3, noPhone: 1, dupPhone: 4, noQuantity: 1, noCity: 1 })
    expect([...d.citiesNoRoutes]).toEqual(['אלעד'])
  })

  it('מגמה חודשית מהחודש הראשון: הצטרפו, הוסרו, פעילים בסוף החודש', () => {
    expect(d.trend).toEqual([
      { month: '2026-09', joined: 4, removed: 0, active: 4 },
      { month: '2026-10', joined: 2, removed: 1, active: 5 },
    ])
  })

  it('מגמה מוגבלת ל-12 חודשים, ורשימה ריקה לא נשברת', () => {
    expect(buildDistributorDashboard([row({ created_at: '2020-01-01T00:00:00Z' })], now).trend).toHaveLength(12)
    const empty = buildDistributorDashboard([], now)
    expect(empty.totals.coverage).toBe(0)
    expect(empty.trend).toEqual([{ month: '2026-10', joined: 0, removed: 0, active: 0 }])
  })
})

describe('matchesIssue', () => {
  const ctx = buildDistributorDashboard(rows, now)
  it('מסנן לפי בעיה', () => {
    const active = rows.filter(r => r.status === 'active')
    expect(active.filter(r => matchesIssue(r, 'cityNoRoutes', ctx)).length).toBe(2)
    expect(matchesIssue(row({ phone: null, phone2: '' }), 'noPhone', ctx)).toBe(true)
    expect(matchesIssue(row({ phone: '0599999999' }), 'dupPhone', ctx)).toBe(false)
  })
})
