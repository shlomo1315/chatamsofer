import { describe, it, expect } from 'vitest'
import { parseHolidaysOnly } from './distributionsShareScope'

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
