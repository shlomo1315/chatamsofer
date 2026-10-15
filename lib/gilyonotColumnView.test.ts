import { describe, expect, it } from 'vitest'
import { applyColumnView, clearColumn, distinctValues, EMPTY_VIEW, isColumnActive, type ColumnRow, type ColumnView } from './gilyonotColumnView'

const rows: ColumnRow[] = [
  { full_name: 'משה כהן', city: 'בני ברק', route: 3, phone: '052-111-2222', quantity: 40 },
  { full_name: 'אברהם לוי', city: 'ירושלים', route: null, phone: null, quantity: 10 },
  { full_name: 'יעקב גרין', city: 'אלעד', route: 12, phone: '03-5551234', quantity: 25 },
  { full_name: 'דוד שור', city: null, route: 1, phone: null, phone2: '0527778888', quantity: 10 },
]
const names = (rs: ColumnRow[]) => rs.map(r => r.full_name)
const view = (v: Partial<ColumnView>): ColumnView => ({ ...EMPTY_VIEW, ...v })

describe('applyColumnView', () => {
  it('בלי מיון וסינון מחזיר את אותו סדר', () => {
    expect(names(applyColumnView(rows, EMPTY_VIEW))).toEqual(names(rows))
  })

  it('מיון שם א-ב וב-א', () => {
    expect(names(applyColumnView(rows, view({ sort: { col: 'name', dir: 'asc' } })))).toEqual(['אברהם לוי', 'דוד שור', 'יעקב גרין', 'משה כהן'])
    expect(names(applyColumnView(rows, view({ sort: { col: 'name', dir: 'desc' } })))).toEqual(['משה כהן', 'יעקב גרין', 'דוד שור', 'אברהם לוי'])
  })

  it('מיון עיר: ריק תמיד בסוף', () => {
    expect(names(applyColumnView(rows, view({ sort: { col: 'city', dir: 'asc' } })))).toEqual(['יעקב גרין', 'משה כהן', 'אברהם לוי', 'דוד שור'])
    expect(names(applyColumnView(rows, view({ sort: { col: 'city', dir: 'desc' } })))).toEqual(['אברהם לוי', 'משה כהן', 'יעקב גרין', 'דוד שור'])
  })

  it('מיון מסלול מספרי (12 אחרי 3), בלי מסלול בסוף', () => {
    expect(names(applyColumnView(rows, view({ sort: { col: 'route', dir: 'asc' } })))).toEqual(['דוד שור', 'משה כהן', 'יעקב גרין', 'אברהם לוי'])
    expect(names(applyColumnView(rows, view({ sort: { col: 'route', dir: 'desc' } })))).toEqual(['יעקב גרין', 'משה כהן', 'דוד שור', 'אברהם לוי'])
  })

  it('מיון כמות יציב בשוויון', () => {
    expect(names(applyColumnView(rows, view({ sort: { col: 'quantity', dir: 'desc' } })))).toEqual(['משה כהן', 'יעקב גרין', 'אברהם לוי', 'דוד שור'])
  })

  it('סינון ערכים: עיר כולל "בלי עיר", ומערך ריק מסנן הכול', () => {
    expect(names(applyColumnView(rows, view({ values: { city: ['בני ברק', ''] } })))).toEqual(['משה כהן', 'דוד שור'])
    expect(applyColumnView(rows, view({ values: { route: [] } }))).toEqual([])
    expect(names(applyColumnView(rows, view({ values: { route: [''] } })))).toEqual(['אברהם לוי'])
    expect(names(applyColumnView(rows, view({ values: { quantity: ['10'] } })))).toEqual(['אברהם לוי', 'דוד שור'])
  })

  it('טקסט חופשי בשם ובטלפון (ספרות בלי מקפים, + ו- ליש/אין)', () => {
    expect(names(applyColumnView(rows, view({ text: { name: 'כהן' } })))).toEqual(['משה כהן'])
    expect(names(applyColumnView(rows, view({ text: { phone: '1112222' } })))).toEqual(['משה כהן'])
    expect(names(applyColumnView(rows, view({ text: { phone: '777' } })))).toEqual(['דוד שור'])
    expect(names(applyColumnView(rows, view({ text: { phone: '-' } })))).toEqual(['אברהם לוי'])
    expect(applyColumnView(rows, view({ text: { phone: '+' } }))).toHaveLength(3)
  })

  it('משלב סינונים ומיון', () => {
    const v = view({ sort: { col: 'quantity', dir: 'asc' }, values: { quantity: ['10', '40'] }, text: { phone: '+' } })
    expect(names(applyColumnView(rows, v))).toEqual(['דוד שור', 'משה כהן'])
  })
})

describe('distinctValues', () => {
  it('עיר לפי א-ב עם ריק בסוף, ומספרים לפי ערך', () => {
    expect(distinctValues(rows, 'city').map(v => v.value)).toEqual(['אלעד', 'בני ברק', 'ירושלים', ''])
    expect(distinctValues(rows, 'route').map(v => v.value)).toEqual(['1', '3', '12', ''])
    expect(distinctValues(rows, 'quantity')).toEqual([{ value: '10', count: 2 }, { value: '25', count: 1 }, { value: '40', count: 1 }])
  })
})

describe('isColumnActive / clearColumn', () => {
  it('מסמן ומנקה עמודה אחת בלבד', () => {
    const v = view({ sort: { col: 'city', dir: 'asc' }, values: { city: ['אלעד'], route: ['1'] }, text: { name: 'x' } })
    expect(isColumnActive(v, 'city')).toBe(true)
    expect(isColumnActive(v, 'phone')).toBe(false)
    const c = clearColumn(v, 'city')
    expect(c.sort).toBeNull()
    expect(c.values).toEqual({ route: ['1'] })
    expect(isColumnActive(c, 'name')).toBe(true)
  })
})
