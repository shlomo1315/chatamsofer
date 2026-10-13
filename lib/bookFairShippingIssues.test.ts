import { describe, it, expect } from 'vitest'
import { parseNewIssue, buildIssuePatch, sanitizeSearch, parseDay } from './bookFairShippingIssues'

const ORDER = '3f2b8c1a-1111-4222-8333-444455556666'

describe('parseNewIssue', () => {
  it('מקבל תקלה תקינה ומנקה רווחים', () => {
    expect(parseNewIssue({ orderId: ORDER, type: 'damaged', description: '  כריכה קרועה ' }))
      .toEqual({ row: { order_id: ORDER, issue_type: 'damaged', description: 'כריכה קרועה' } })
  })
  it('דוחה בלי הזמנה, עם סוג לא מוכר או בלי תיאור', () => {
    expect(parseNewIssue({ orderId: 'x', type: 'damaged', description: 'a' })).toHaveProperty('error')
    expect(parseNewIssue({ orderId: ORDER, type: 'lost', description: 'a' })).toHaveProperty('error')
    expect(parseNewIssue({ orderId: ORDER, type: 'other', description: '   ' })).toHaveProperty('error')
  })
  it('חותך תיאור ארוך', () => {
    const r = parseNewIssue({ orderId: ORDER, type: 'other', description: 'א'.repeat(5000) })
    expect('row' in r && r.row.description.length).toBe(2000)
  })
})

describe('buildIssuePatch', () => {
  const now = new Date('2026-10-13T10:00:00Z')
  it('מעבר לטופל חותם זמן ומטפל', () => {
    const r = buildIssuePatch({ status: 'resolved' }, 'u1', now)
    expect(r).toEqual({ patch: {
      status: 'resolved', resolved_at: now.toISOString(), resolved_by: 'u1', updated_at: now.toISOString(),
    } })
  })
  it('פתיחה מחדש מאפסת את הסגירה', () => {
    const r = buildIssuePatch({ status: 'open' }, 'u1', now)
    expect('patch' in r && r.patch.resolved_at).toBeNull()
    expect('patch' in r && r.patch.resolved_by).toBeNull()
  })
  it('הערת טיפול ריקה נשמרת כ-null', () => {
    const r = buildIssuePatch({ resolution: '  ' }, 'u1', now)
    expect('patch' in r && r.patch.resolution_note).toBeNull()
  })
  it('דוחה סטטוס/סוג לא תקין וגוף ריק', () => {
    expect(buildIssuePatch({ status: 'done' }, 'u1')).toHaveProperty('error')
    expect(buildIssuePatch({ type: 'x' }, 'u1')).toHaveProperty('error')
    expect(buildIssuePatch({}, 'u1')).toHaveProperty('error')
  })
})

describe('sanitizeSearch', () => {
  it('מסיר תחביר של מסנן PostgREST', () => {
    expect(sanitizeSearch('BF-26,id.eq.1)')).toBe('BF-26 id eq 1')
    expect(sanitizeSearch('  כהן  ')).toBe('כהן')
  })
})

describe('parseDay', () => {
  it('מקבל YYYY-MM-DD בלבד', () => {
    expect(parseDay('2026-10-13')).toBe('2026-10-13')
    expect(parseDay('13/10/2026')).toBeNull()
    expect(parseDay(undefined)).toBeNull()
  })
})
