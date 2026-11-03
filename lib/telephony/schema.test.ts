import { describe, it, expect } from 'vitest'
import { validateResult } from './schema'

describe('בדיקת תשובות (zod)', () => {
  it('תשובות תקינות עוברות', () => {
    expect(validateResult({ type: 'hangup' }).ok).toBe(true)
    expect(validateResult([{ type: 'simpleMessage', files: [{ text: 'שלום' }] }, { type: 'goTo', goTo: '/1' }]).ok).toBe(true)
  })
  it.each([
    [[], 'מערך ריק'],
    [{ type: 'nope' }, 'סוג לא מוכר'],
    [{ type: 'hangup', extra: 1 }, 'שדה עודף'],
    [{ type: 'getDTMF', name: '1bad', max: 4, files: [{ text: 'x' }] }, 'שם משתנה לא חוקי'],
    [{ type: 'getDTMF', name: 'ok', min: 5, max: 4, files: [{ text: 'x' }] }, 'min גדול מ-max'],
    [{ type: 'simpleMenu', name: 'm', enabledKeys: '1,,2', files: [{ text: 'x' }] }, 'מקשים לא חוקיים'],
  ] as [unknown, string][])('%j נדחה (%s)', (body) => {
    expect(validateResult(body).ok).toBe(false)
  })
})
