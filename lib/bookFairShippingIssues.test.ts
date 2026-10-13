import { describe, it, expect } from 'vitest'
import {
  parseWith, newIssueSchema, editIssueSchema, statusChangeSchema, noteSchema,
  resolveAffectedItems, buildStatusChange, statusEventText, statusToast,
  matchesChip, chipCounts, parseFilters, filtersToQuery,
  sanitizeSearch, parseDay, nextDay, daysSince, agoLabel, lateDays,
} from './bookFairShippingIssues'

const ORDER = '3f2b8c1a-1111-4222-8333-444455556666'
const ITEM_A = 'aaaaaaaa-1111-4222-8333-444455556666'
const ITEM_B = 'bbbbbbbb-1111-4222-8333-444455556666'

describe('newIssueSchema', () => {
  it('מקבל תקלה תקינה ומנקה רווחים', () => {
    expect(parseWith(newIssueSchema, { orderId: ORDER, type: 'damaged', description: '  כריכה קרועה ', via: 'phone' }))
      .toEqual({ data: { orderId: ORDER, type: 'damaged', description: 'כריכה קרועה', via: 'phone' } })
  })
  it('שגיאות בעברית לפי האפיון', () => {
    expect(parseWith(newIssueSchema, { orderId: 'x', type: 'damaged', description: 'a' })).toEqual({ error: 'בחר הזמנה' })
    expect(parseWith(newIssueSchema, { orderId: ORDER, type: '', description: 'a' })).toEqual({ error: 'בחר סוג תקלה' })
    expect(parseWith(newIssueSchema, { orderId: ORDER, type: 'other', description: '   ' })).toEqual({ error: 'כתוב מה קרה' })
  })
  it('דוחה שדה לא מוכר (strict) ותיאור ארוך', () => {
    expect(parseWith(newIssueSchema, { orderId: ORDER, type: 'other', description: 'a', status: 'resolved' })).toHaveProperty('error')
    expect(parseWith(newIssueSchema, { orderId: ORDER, type: 'other', description: 'א'.repeat(2001) })).toHaveProperty('error')
  })
  it('דוחה כמות לא חוקית בספרים', () => {
    expect(parseWith(newIssueSchema, { orderId: ORDER, type: 'damaged', description: 'a', items: [{ itemId: ITEM_A, quantity: 0 }] }))
      .toHaveProperty('error')
  })
})

describe('editIssueSchema / noteSchema', () => {
  it('עריכה לא מאפשרת לשנות הזמנה', () => {
    expect(parseWith(editIssueSchema, { type: 'other', description: 'a', orderId: ORDER })).toHaveProperty('error')
  })
  it('הערה ריקה נדחית', () => {
    expect(parseWith(noteSchema, { body: '  ' })).toEqual({ error: 'כתוב את ההערה' })
  })
})

describe('statusChangeSchema', () => {
  it('טופל בלי אופן טיפול נדחה', () => {
    expect(parseWith(statusChangeSchema, { status: 'resolved' })).toEqual({ error: 'בחר איך טופלה התקלה' })
    expect(parseWith(statusChangeSchema, { status: 'resolved', resolution: 'resent' })).toHaveProperty('data')
  })
  it('סטטוס לא מוכר נדחה', () => {
    expect(parseWith(statusChangeSchema, { status: 'deleted' })).toHaveProperty('error')
  })
})

describe('resolveAffectedItems', () => {
  const items = [
    { id: ITEM_A, title_snapshot: 'שו"ת חתם סופר ח"ב', quantity: 2 },
    { id: ITEM_B, title_snapshot: 'חידושי חתם סופר ח"ג', quantity: 1 },
  ]
  it('שומר שם ספר מההזמנה ומגביל כמות', () => {
    expect(resolveAffectedItems('damaged', [{ itemId: ITEM_A, quantity: 5 }], items))
      .toEqual({ items: [{ item_id: ITEM_A, title: 'שו"ת חתם סופר ח"ב', quantity: 2 }] })
  })
  it('דוחה ספר שאינו בהזמנה', () => {
    expect(resolveAffectedItems('missing_item', [{ itemId: ORDER, quantity: 1 }], items)).toEqual({ error: 'ספר שנבחר אינו בהזמנה' })
  })
  it('בסוג שאין בו ספרים — ריק', () => {
    expect(resolveAffectedItems('not_arrived', [{ itemId: ITEM_A, quantity: 1 }], items)).toEqual({ items: [] })
  })
})

describe('buildStatusChange', () => {
  const now = new Date('2026-10-13T10:00:00Z')
  it('טופל חותם זמן, מטפל ואופן טיפול, ונרשם ביומן', () => {
    const r = buildStatusChange({ status: 'in_progress', resolution: null }, { status: 'resolved', resolution: 'resent' }, 'u1', now)
    expect(r).toEqual({
      patch: { status: 'resolved', resolution: 'resent', resolved_at: now.toISOString(), resolved_by: 'u1', updated_at: now.toISOString() },
      event: { kind: 'status', from_status: 'in_progress', to_status: 'resolved', resolution: 'resent' },
    })
  })
  it('פתיחה מחדש מאפסת את הסגירה', () => {
    const r = buildStatusChange({ status: 'resolved', resolution: 'resent' }, { status: 'open' }, 'u1', now)
    expect('patch' in r && r.patch).toMatchObject({ status: 'open', resolution: null, resolved_at: null, resolved_by: null })
  })
  it('בלי שינוי — שגיאה', () => {
    expect(buildStatusChange({ status: 'open', resolution: null }, { status: 'open' }, 'u1')).toHaveProperty('error')
  })
  it('שינוי אופן טיפול בלבד מותר', () => {
    expect(buildStatusChange({ status: 'resolved', resolution: 'resent' }, { status: 'resolved', resolution: 'replaced' }, 'u1'))
      .toHaveProperty('patch')
  })
})

describe('טקסטים ליומן ולהודעות', () => {
  it('statusEventText', () => {
    expect(statusEventText({ from_status: null, to_status: 'open', resolution: null })).toBe('נפתח · פתוח')
    expect(statusEventText({ from_status: 'open', to_status: 'in_progress', resolution: null })).toBe('שונה ל"בטיפול"')
    expect(statusEventText({ from_status: 'in_progress', to_status: 'resolved', resolution: 'resent' })).toBe('טופל · נשלח משלוח חוזר')
    expect(statusEventText({ from_status: 'resolved', to_status: 'open', resolution: null })).toBe('נפתח מחדש · פתוח')
    expect(statusEventText({ from_status: 'open', to_status: 'cancelled', resolution: null })).toBe('בוטל')
  })
  it('statusToast', () => {
    expect(statusToast('in_progress')).toBe("הסטטוס עודכן ל'בטיפול'")
    expect(statusToast('resolved')).toBe('התקלה סומנה כטופלה')
  })
})

describe('סינון', () => {
  it('"פתוחות" = פתוח + בטיפול; "בוטל" רק תחת "הכל"', () => {
    expect(matchesChip('in_progress', 'active')).toBe(true)
    expect(matchesChip('resolved', 'active')).toBe(false)
    expect(matchesChip('cancelled', 'resolved')).toBe(false)
    expect(matchesChip('cancelled', 'all')).toBe(true)
  })
  it('chipCounts', () => {
    expect(chipCounts(['open', 'in_progress', 'open', 'resolved', 'cancelled']))
      .toEqual({ active: 3, open: 2, in_progress: 1, resolved: 1, all: 5 })
  })
  it('parseFilters ⇄ filtersToQuery', () => {
    const p = new URLSearchParams('status=resolved&type=damaged&from=2026-10-01&to=bad&q=כהן')
    const f = parseFilters(k => p.get(k))
    expect(f).toEqual({ chip: 'resolved', type: 'damaged', from: '2026-10-01', to: '', q: 'כהן' })
    expect(filtersToQuery(f)).toBe(new URLSearchParams('status=resolved&type=damaged&from=2026-10-01&q=כהן').toString())
    expect(parseFilters(() => null).chip).toBe('active')
    expect(parseFilters(k => (k === 'status' ? 'cancelled' : null)).chip).toBe('active')
  })
  it('sanitizeSearch מסיר תחביר של מסנן PostgREST', () => {
    expect(sanitizeSearch('BF-26,id.eq.1)')).toBe('BF-26 id eq 1')
    expect(sanitizeSearch('  כהן  ')).toBe('כהן')
  })
  it('parseDay / nextDay', () => {
    expect(parseDay('2026-10-13')).toBe('2026-10-13')
    expect(parseDay('13/10/2026')).toBeNull()
    expect(nextDay('2026-10-31')).toBe('2026-11-01')
  })
})

describe('זמנים', () => {
  const now = new Date('2026-10-13T12:00:00')
  it('daysSince + agoLabel', () => {
    expect(daysSince('2026-10-13T08:00:00', now)).toBe(0)
    expect(agoLabel(daysSince('2026-10-08T08:00:00', now))).toBe('לפני 5 ימים')
    expect(agoLabel(1)).toBe('אתמול')
  })
  it('lateDays — רק פתוחות ותיקות מ-3 ימים', () => {
    expect(lateDays('open', '2026-10-08T08:00:00', now)).toBe(5)
    expect(lateDays('open', '2026-10-11T08:00:00', now)).toBeNull()
    expect(lateDays('resolved', '2026-10-01T08:00:00', now)).toBeNull()
  })
})
