import { describe, it, expect } from 'vitest'
import { idNumberVariants, isDeleteConfirmed } from './portalDeletion'

describe('idNumberVariants', () => {
  it('מחזיר ת"ז עם ובלי אפס מוביל', () => {
    expect(idNumberVariants('012345678')).toEqual(['012345678', '12345678'])
  })
  it('דרכון נשאר כמו שהוא', () => {
    expect(idNumberVariants('AB123')).toEqual(['AB123'])
  })
  it('ריק מחזיר רשימה ריקה', () => {
    expect(idNumberVariants(null)).toEqual([])
  })
})

describe('isDeleteConfirmed', () => {
  it('דורש סימון והקלדת "מחיקה"', () => {
    expect(isDeleteConfirmed({ confirm: 'מחיקה', understood: true })).toBe(true)
    expect(isDeleteConfirmed({ confirm: 'מחיקה', understood: false })).toBe(false)
    expect(isDeleteConfirmed({ confirm: 'מחק', understood: true })).toBe(false)
    expect(isDeleteConfirmed({})).toBe(false)
  })
})
