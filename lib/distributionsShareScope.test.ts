import { describe, it, expect } from 'vitest'
import { parseHolidaysOnly, parseClosesAt } from './distributionsShareScope'

describe('parseClosesAt', () => {
  it('מועד תקין נשמר כ-ISO, ריק או פגום הוא null', () => {
    expect(parseClosesAt('2026-12-01T20:00:00Z')).toBe('2026-12-01T20:00:00.000Z')
    expect(parseClosesAt('')).toBeNull()
    expect(parseClosesAt(null)).toBeNull()
    expect(parseClosesAt('לא תאריך')).toBeNull()
  })
})

describe('parseHolidaysOnly', () => {
  it('ברירת המחדל בלי שורה במסד היא חגים בלבד', () => {
    expect(parseHolidaysOnly(undefined)).toBe(true)
    expect(parseHolidaysOnly(null)).toBe(true)
    expect(parseHolidaysOnly('')).toBe(true)
  })
  it('רק false מפורש מחזיר את כל המחלקות', () => {
    expect(parseHolidaysOnly('false')).toBe(false)
    expect(parseHolidaysOnly(' FALSE ')).toBe(false)
    expect(parseHolidaysOnly('true')).toBe(true)
  })
})
