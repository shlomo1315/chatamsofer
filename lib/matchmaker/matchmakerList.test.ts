import { describe, it, expect } from 'vitest'
import type { AdminClaim, AdminMatchmaker } from './adminData'
import {
  summarizeMatchmakers, filterMatchmakers, sortMatchmakers, matchmakerCounters, matchmakerFilterFromParams, matchmakerSortFromParams,
} from './matchmakerList'

const mm = (id: string, name: string, o: Partial<AdminMatchmaker> = {}): AdminMatchmaker => ({
  id, name, phone: '050' + id, email: `${id}@x.il`, circle: null, created_at: '2026-11-01T10:00:00Z',
  claims_limit: null, claims_count: 0, bank_name: null, bank_branch: null, bank_account_masked: null, ...o,
})
const claim = (id: string, m: string, o: Partial<AdminClaim> = {}) => ({
  id, matchmaker: { id: m }, status: 'pending', amount: null, is_grandchild: false, verification: null,
  groom_name: 'ג' + id, bride_name: 'כ' + id, created_at: '2026-11-05T10:00:00Z', ...o,
}) as unknown as AdminClaim

const list = [
  mm('1', 'אברהם כהן', { circle: 'ירושלים', created_at: '2026-10-01T10:00:00Z', claims_limit: 3, bank_name: 'לאומי' }),
  mm('2', 'ברוך לוי', { circle: 'בני ברק', created_at: '2026-11-10T10:00:00Z' }),
  mm('3', 'דוד שמש', { circle: 'ירושלים', created_at: '2026-11-15T10:00:00Z' }),
]
const claims = [
  claim('a', '1', { status: 'paid', amount: 1000 }),
  claim('b', '1', { status: 'approved', amount: 500 }),
  claim('c', '1', { status: 'pending', is_grandchild: true, verification: { result: 'not_found', checked_at: '', matches: [] } }),
  claim('d', '2', { status: 'rejected' }),
]
const rows = summarizeMatchmakers(list, claims)
const ids = (r: typeof rows) => r.map(x => x.id)

describe('summarizeMatchmakers', () => {
  it('סופר בקשות, אושרו, ממתינות ושולם לכל שדכן', () => {
    const r = rows[0]
    expect([r.reqs, r.ok, r.wait, r.paid]).toEqual([3, 2, 1, 1000])
    expect(rows[1].ok).toBe(0)
    expect(rows[2].reqs).toBe(0)
  })
  it('ממתין לאימות אנושי: בקשה ממתינה של נכד שלא נמצא', () => {
    expect(rows[0].verified).toBe(false)
    expect(rows[1].verified).toBe(true)
  })
  it('בקשות אחרונות: עד חמש', () => {
    expect(rows[0].recent).toHaveLength(3)
  })
})

describe('filterMatchmakers', () => {
  it('חיפוש חופשי בשם, טלפון וחוג', () => {
    expect(ids(filterMatchmakers(rows, { q: 'כהן' }))).toEqual(['1'])
    expect(ids(filterMatchmakers(rows, { q: '0502' }))).toEqual(['2'])
    expect(ids(filterMatchmakers(rows, { q: 'בני ברק' }))).toEqual(['2'])
  })
  it('חוג', () => expect(ids(filterMatchmakers(rows, { circle: 'ירושלים' }))).toEqual(['1', '3']))
  it('בקשות: ממתינות / יש / אין', () => {
    expect(ids(filterMatchmakers(rows, { hasReq: 'pending' }))).toEqual(['1'])
    expect(ids(filterMatchmakers(rows, { hasReq: 'any' }))).toEqual(['1', '2'])
    expect(ids(filterMatchmakers(rows, { hasReq: 'none' }))).toEqual(['3'])
  })
  it('אימות', () => {
    expect(ids(filterMatchmakers(rows, { verif: 'wait' }))).toEqual(['1'])
    expect(ids(filterMatchmakers(rows, { verif: 'ok' }))).toEqual(['2', '3'])
  })
  it('הגבלה פרטנית', () => {
    expect(ids(filterMatchmakers(rows, { limit: 'yes' }))).toEqual(['1'])
    expect(ids(filterMatchmakers(rows, { limit: 'no' }))).toEqual(['2', '3'])
  })
  it('טווח תאריכי הרשמה כולל קצוות', () => {
    expect(ids(filterMatchmakers(rows, { from: '2026-11-10', to: '2026-11-15' }))).toEqual(['2', '3'])
    expect(ids(filterMatchmakers(rows, { to: '2026-10-31' }))).toEqual(['1'])
  })
  it('מונה פעילים ועם ממתינה', () => {
    expect(ids(filterMatchmakers(rows, { counter: 'active' }))).toEqual(['1', '2'])
    expect(ids(filterMatchmakers(rows, { counter: 'wait' }))).toEqual(['1'])
  })
  it('שילוב מסננים', () => expect(filterMatchmakers(rows, { circle: 'ירושלים', hasReq: 'none' }).map(r => r.id)).toEqual(['3']))
})

describe('sortMatchmakers', () => {
  it('לפי שם בעברית, עולה ויורד', () => {
    expect(ids(sortMatchmakers(rows, { key: 'name', dir: 1 }))).toEqual(['1', '2', '3'])
    expect(ids(sortMatchmakers(rows, { key: 'name', dir: -1 }))).toEqual(['3', '2', '1'])
  })
  it('לפי מספר בקשות ולפי שולם', () => {
    expect(ids(sortMatchmakers(rows, { key: 'reqs', dir: -1 }))[0]).toBe('1')
    expect(ids(sortMatchmakers(rows, { key: 'paid', dir: 1 }))[2]).toBe('1')
  })
  it('לפי תאריך הרשמה', () => expect(ids(sortMatchmakers(rows, { key: 'reg', dir: 1 }))).toEqual(['1', '2', '3']))
  it('לא משנה את המערך המקורי', () => {
    const before = ids(rows); sortMatchmakers(rows, { key: 'name', dir: -1 }); expect(ids(rows)).toEqual(before)
  })
})

describe('matchmakerCounters', () => {
  it('מונים על כל הרשימה', () => expect(matchmakerCounters(rows)).toEqual({ total: 3, active: 2, waiting: 1, paid: 1000 }))
})

describe('פרמטרים מהכתובת', () => {
  it('מסנן ריק נשאר undefined', () => {
    expect(matchmakerFilterFromParams(new URLSearchParams('q=&circle=א'))).toMatchObject({ q: undefined, circle: 'א' })
  })
  it('מיון: מפתח לא מוכר חוזר לשם, dir=desc הופך', () => {
    expect(matchmakerSortFromParams(new URLSearchParams('sort=evil'))).toEqual({ key: 'name', dir: 1 })
    expect(matchmakerSortFromParams(new URLSearchParams('sort=paid&dir=desc'))).toEqual({ key: 'paid', dir: -1 })
  })
})
