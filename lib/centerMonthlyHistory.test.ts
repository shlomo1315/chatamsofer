import { describe, it, expect } from 'vitest'
import { monthRange } from './centerMonthlyHistory'

describe('monthRange', () => {
  it('ריק כשאין טעינות', () => expect(monthRange([], '2026-11')).toEqual([]))
  it('כולל חודש שדולג ועובר גבול שנה', () => {
    expect(monthRange(['2026-11', '2027-01'], '2027-02')).toEqual(['2027-02', '2027-01', '2026-12', '2026-11'])
  })
  it('לא כולל חודשים לפני הטעינה הראשונה', () => expect(monthRange(['2026-11'], '2026-11')).toEqual(['2026-11']))
})
