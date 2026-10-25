import { describe, it, expect } from 'vitest'
import { addressCells, addressColumns } from './exportAddress'

describe('exportAddress', () => {
  it('מפצל כתובת לעיר, רחוב ומספר בית', () => {
    expect(addressCells('בני ברק', 'הרצל 12')).toEqual(['בני ברק', 'הרצל', '12'])
  })
  it('מצרף דירה למספר הבית', () => {
    expect(addressCells('ירושלים', 'הרצל 12/3')).toEqual(['ירושלים', 'הרצל', '12/3'])
  })
  it('כתובת בלי מספר: הכול ברחוב', () => {
    expect(addressCells('חיפה', 'שדרות')).toEqual(['חיפה', 'שדרות', ''])
  })
  it('ערכים ריקים', () => {
    expect(addressCells(null, undefined)).toEqual(['', '', ''])
  })
  it('מספר העמודות תואם מספר הערכים', () => {
    expect(addressColumns()).toHaveLength(addressCells('a', 'b 1').length)
  })
})
