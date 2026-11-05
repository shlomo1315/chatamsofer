import { describe, it, expect } from 'vitest'
import { countByStatus, hebrewDay, parseRawFields, reviewReason } from './kvitelView'

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
