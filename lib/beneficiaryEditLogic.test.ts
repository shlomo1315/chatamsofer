import { describe, it, expect } from 'vitest'
import { isoToDmy, dmyToIso, diffFields, normalizeId } from '@/app/admin/beneficiaries/[id]/edit/editLogic'
import { pickEditable } from '@/app/api/admin/beneficiaries/update/route'

describe('המרת תאריכים', () => {
  it('ISO ל-dd.mm.yyyy', () => expect(isoToDmy('1988-03-14')).toBe('14.03.1988'))
  it('ריק נשאר ריק', () => expect(isoToDmy(null)).toBe(''))
  it('חזרה ל-ISO', () => expect(dmyToIso('14.03.1988')).toBe('1988-03-14'))
  it('יום וחודש בספרה אחת', () => expect(dmyToIso('4.3.1988')).toBe('1988-03-04'))
  it('תאריך לא אמיתי נדחה', () => expect(dmyToIso('31.02.1988')).toBeNull())
  it('טקסט חופשי נדחה', () => expect(dmyToIso('אתמול')).toBeNull())
  it('ריק מותר', () => expect(dmyToIso('  ')).toBe(''))
})

describe('חישוב שינויים', () => {
  const defs = [
    { key: 'a', label: 'שם', section: 's1' as const },
    { key: 'b', label: 'עיר', section: 's3' as const },
  ]
  it('אין שינוי', () => expect(diffFields(defs, { a: 'x', b: 'y' }, { a: 'x', b: 'y' })).toEqual([]))
  it('רווחים לא נחשבים שינוי', () => expect(diffFields(defs, { a: 'x', b: '' }, { a: ' x ', b: '' })).toEqual([]))
  it('שינוי אחד', () => expect(diffFields(defs, { a: 'x', b: 'y' }, { a: 'x', b: 'z' })).toEqual([{ label: 'עיר', section: 's3' }]))
})

describe('ת.ז.', () => {
  it('ת.ז. ספרות בלבד', () => expect(normalizeId('038-412-567', 'id')).toBe('038412567'))
  it('דרכון נשמר', () => expect(normalizeId(' AB123 ', 'passport')).toBe('AB123'))
})

describe('נתיב השמירה', () => {
  it('זורק שדות שלא ברשימה', () => {
    expect(pickEditable({ family_name: 'כהן', is_active: false, nedarim_id: 5, id: 'x' })).toEqual({ family_name: 'כהן' })
  })
  it('קלט לא תקין', () => expect(pickEditable(null)).toEqual({}))
})
