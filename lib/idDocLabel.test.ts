import { describe, it, expect } from 'vitest'
import { idDocLabel, idDocLabelLong } from './idDocLabel'

describe('תווית מסמך הזיהוי', () => {
  it('🔴 דרכון מוצג כדרכון', () => {
    expect(idDocLabel('passport')).toBe('דרכון')
    expect(idDocLabelLong('passport')).toBe('דרכון')
  })
  it('ת.ז. מוצגת כת.ז.', () => {
    expect(idDocLabel('id')).toBe('ת.ז.')
    expect(idDocLabelLong('id')).toBe('תעודת זהות')
  })
  // ⚠️ ערך חסר → ת.ז., ולא "דרכון" על מי שאינו.
  it('ערך חסר → ת.ז.', () => {
    expect(idDocLabel(null)).toBe('ת.ז.')
    expect(idDocLabel(undefined)).toBe('ת.ז.')
    expect(idDocLabel('')).toBe('ת.ז.')
  })
  it('ערך לא מוכר → ת.ז.', () => {
    expect(idDocLabel('something')).toBe('ת.ז.')
  })
})
