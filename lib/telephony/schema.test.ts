import { describe, it, expect } from 'vitest'
import { validateResult } from './schema'

describe('בדיקת תשובות (zod)', () => {
  it('תשובות תקינות עוברות', () => {
    expect(validateResult({ type: 'hangup' }).ok).toBe(true)
    expect(validateResult({ type: 'creditCard', name: 'pay', sum: 120, sumChangeable: 'no', cvv: 'yes', payments: 1, terminal: '7004562', post: true }).ok).toBe(true)
    expect(validateResult({ type: 'record', name: 'rec', max: 120, hangupSave: 'yes', sttSoft: true }).ok).toBe(true)
    expect(validateResult([{ type: 'simpleMessage', files: [{ text: 'שלום' }] }, { type: 'goTo', goTo: '/1' }]).ok).toBe(true)
  })
  it.each([
    [[], 'מערך ריק'],
    [{ type: 'nope' }, 'סוג לא מוכר'],
    [{ type: 'hangup', extra: 1 }, 'שדה עודף'],
    [{ type: 'getDTMF', name: '1bad', max: 4, files: [{ text: 'x' }] }, 'שם משתנה לא חוקי'],
    [{ type: 'getDTMF', name: 'ok', min: 5, max: 4, files: [{ text: 'x' }] }, 'min גדול מ-max'],
    [{ type: 'simpleMenu', name: 'm', enabledKeys: '1,,2', files: [{ text: 'x' }] }, 'מקשים לא חוקיים'],
    [{ type: 'creditCard', name: 'pay', terminal: 'abc' }, 'מסוף לא מספרי'],
    [{ type: 'creditCard', name: 'pay', sumChangeable: 'maybe' }, 'ערך כן/לא שגוי'],
    [{ type: 'record', name: 'rec', hangupSave: 'sure' }, 'hangupSave שגוי'],
  ] as [unknown, string][])('%j נדחה (%s)', (body) => {
    expect(validateResult(body).ok).toBe(false)
  })
})
