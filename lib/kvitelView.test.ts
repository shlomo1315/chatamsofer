import { describe, it, expect } from 'vitest'
import { byKvitelTab, countByStatus, hebrewDay, KVITEL_DEFAULT_TAB, kvitelRowActions, parseRawFields, pendingForPrint, reviewReason, scopeKvitelRows, cleanTranscript, MAX_TRANSCRIPT } from './kvitelView'
import { kvitelExportLines, type KvitelRequestRow } from './kvitelQuery'

describe('kvitelRowActions — כפתורי השורה', () => {
  it('תיקון ומחיקה בכל שורה למי שיש לו עריכה; מחיקה לא בבקשה שכבר בוטלה', () => {
    expect(kvitelRowActions({ status: 'pending' }, true)).toEqual({ approve: false, edit: true, remove: true })
    expect(kvitelRowActions({ status: 'pending', needsReview: true }, true)).toEqual({ approve: true, edit: true, remove: true })
    expect(kvitelRowActions({ status: 'done' }, true)).toEqual({ approve: false, edit: true, remove: true })
    expect(kvitelRowActions({ status: 'cancelled' }, true)).toEqual({ approve: false, edit: true, remove: false })
    expect(kvitelRowActions({ status: 'pending', needsReview: true }, false)).toEqual({ approve: false, edit: false, remove: false })
  })
})

const line = (o: Partial<{ name: string; parent_name: string; flagged: boolean; flag_reason: string | null }> = {}) =>
  ({ id: '1', position: 0, name: 'משה', relation: 'ben', parent_name: 'שרה', request_type: 'refua', request_note: null, flagged: false, flag_reason: null, ...o })
const req = (o: Record<string, unknown> = {}) =>
  ({ contact_name: 'דוד', contact_phone: '0501234567', contact_email: null, kvitel_request_lines: [line()], ...o }) as Parameters<typeof reviewReason>[0]

describe('reviewReason', () => {
  it('בקשה תקינה', () => expect(reviewReason(req())).toBeNull())
  it('בלי שמות', () => expect(reviewReason(req({ kvitel_request_lines: [] }))).toBe('לא נקלטו שמות'))
  it('שם חסר', () => expect(reviewReason(req({ kvitel_request_lines: [line({ parent_name: '' })] }))).toBe('שם חסר'))
  it('שורה מסומנת', () => expect(reviewReason(req({ kvitel_request_lines: [line({ flagged: true, flag_reason: 'כתיב' })] }))).toBe('כתיב'))
  it('מגיש לא ידוע', () => expect(reviewReason(req({ contact_name: null, contact_phone: null }))).toBe('מגיש לא ידוע'))
})

describe('hebrewDay', () => {
  it('תאריך עברי', () => expect(hebrewDay('2026-11-05T10:00:00Z')).toBe('כ״ה חשוון'))
  it('תאריך לא תקין', () => { expect(hebrewDay('x')).toBe(''); expect(hebrewDay(null)).toBe('') })
})

it('countByStatus', () => {
  expect(countByStatus([{ status: 'review' }, { status: 'done' }, { status: 'review' }])).toEqual({ all: 3, review: 2, pending: 0, done: 1, cancelled: 0 })
})

describe('parseRawFields', () => {
  it('שדות', () => expect(parseRawFields('Field1: דוד\nField2: 050\n\nFieldX:')).toEqual([{ key: 'Field1', value: 'דוד' }, { key: 'Field2', value: '050' }]))
  it('טקסט חופשי', () => expect(parseRawFields('שלום רב')).toEqual([]))
  it('ריק', () => expect(parseRawFields(null)).toEqual([]))
})

describe('pendingForPrint', () => {
  const row = (id: string, status: string, lines = [line()]) =>
    ({ id, status, submitted_at: '2026-11-05T08:00:00Z', kvitel_request_lines: lines }) as unknown as KvitelRequestRow
  const rows = [row('a', 'pending'), row('b', 'done'), row('c', 'review'), row('d', 'pending', []), row('e', 'pending')]

  it('רק ממתינות עם שמות', () => expect(pendingForPrint(rows).map(r => r.id)).toEqual(['a', 'e']))
  it('המזהים לסימון תואמים בדיוק לשורות שהודפסו', () => {
    const list = pendingForPrint(rows)
    expect(kvitelExportLines(list)).toHaveLength(list.length)
  })
  it('אין חדשות: רשימה ריקה', () => expect(pendingForPrint([row('b', 'done')])).toEqual([]))
})

describe('cleanTranscript', () => {
  it('מנקה רווחים ומחזיר null לריק', () => {
    expect(cleanTranscript('  שלום \r\nעולם ')).toBe('שלום \nעולם')
    expect(cleanTranscript('   ')).toBeNull()
  })
  it('דוחה טקסט ארוך מדי ולא-מחרוזת', () => {
    expect(cleanTranscript('א'.repeat(MAX_TRANSCRIPT + 1))).toBeUndefined()
    expect(cleanTranscript(5)).toBeUndefined()
  })
})

describe('טבלת הבקשות במסך השבוע', () => {
  const r = (id: string, channel: string, status: string, o: Record<string, unknown> = {}) =>
    ({ id, channel, status, contact_name: 'דוד', contact_phone: '0501234567', kvitel_request_lines: [line()], ...o }) as unknown as KvitelRequestRow
  const rows = [r('a', 'email', 'pending'), r('b', 'phone', 'pending'), r('c', 'email', 'done'), r('d', 'nedarim', 'cancelled'),
    r('e', 'nedarim', 'pending', { kvitel_request_lines: [line({ name: 'יוסף', parent_name: 'מרים' })] })]
  const ids = (xs: KvitelRequestRow[]) => xs.map(x => x.id)

  it('סינון לפי מקור', () => {
    expect(ids(scopeKvitelRows(rows, { channel: 'email' }))).toEqual(['a', 'c'])
    expect(ids(scopeKvitelRows(rows, { channel: '' }))).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
  it('מקור וחיפוש יחד', () => expect(ids(scopeKvitelRows(rows, { channel: 'nedarim', q: 'מרים' }))).toEqual(['e']))
  it('ברירת המחדל: רק מה שלא נשלח לציון', () => {
    expect(KVITEL_DEFAULT_TAB).toBe('pending')
    expect(ids(byKvitelTab(rows, KVITEL_DEFAULT_TAB))).toEqual(['a', 'b', 'e'])
  })
  it('אחרי שליחה לציון הבקשה עוברת ל"נשלח" ויוצאת מברירת המחדל', () => {
    const after = rows.map(x => (x.id === 'a' ? { ...x, status: 'done' as const } : x))
    expect(ids(byKvitelTab(after, KVITEL_DEFAULT_TAB))).toEqual(['b', 'e'])
    expect(ids(byKvitelTab(after, 'done'))).toEqual(['a', 'c'])
    expect(byKvitelTab(after, 'all')).toHaveLength(5)
  })
})
