import { describe, it, expect } from 'vitest'
import {
  rowsFromChain, chainFromRows, updateRow, insertRow, removeRow, moveRow, emptyRows,
  sanitizeEditedChain, ROOT_NAME, type EditRow,
} from './lineageChainEdit'

const names = (rows: EditRow[]) => rows.map(r => r.name)
const base = () => rowsFromChain([
  { generation: 1, name: 'מרן', relation: null },
  { generation: 2, name: 'א', relation: 'son' },
  { generation: 3, name: 'ב', relation: 'son' },
  { generation: 4, name: 'ג', relation: 'son_in_law' },
  { generation: 5, name: 'ד', relation: 'son' },
])

describe('rowsFromChain', () => {
  it('דור 1 תמיד רבינו החתם סופר, ודור חסר באמצע הופך לשורה ריקה', () => {
    const rows = rowsFromChain([{ generation: 2, name: 'א' }, { generation: 4, name: 'ג' }])
    expect(names(rows)).toEqual([ROOT_NAME, 'א', '', 'ג'])
    expect(emptyRows(rows)).toEqual([2])
  })
  it('שרשרת ריקה (משפחה לא משויכת) — בנייה מאפס מדור 1 בלבד', () => {
    expect(names(rowsFromChain(null))).toEqual([ROOT_NAME])
  })
  it('דור כפול נלקח פעם אחת', () => {
    expect(names(rowsFromChain([{ generation: 2, name: 'א' }, { generation: 2, name: 'א' }]))).toEqual([ROOT_NAME, 'א'])
  })
})

describe('עריכה', () => {
  it('עריכת שם וסימון חתן', () => {
    const rows = updateRow(base(), 2, { name: 'ב מתוקן', relation: 'son_in_law' })
    expect(rows[2]).toEqual({ name: 'ב מתוקן', relation: 'son_in_law' })
  })
  it('דור 1 נעול לעריכה, למחיקה ולהזזה', () => {
    const rows = base()
    expect(updateRow(rows, 0, { name: 'x' })).toBe(rows)
    expect(removeRow(rows, 0, 'shift')).toBe(rows)
    expect(moveRow(rows, 1, -1)).toBe(rows)
    expect(moveRow(rows, 0, 1)).toBe(rows)
  })
  it('הוספה באמצע — הדורות הבאים יורדים דור', () => {
    const rows = insertRow(base(), 2)
    expect(names(rows)).toEqual([ROOT_NAME, 'א', '', 'ב', 'ג', 'ד'])
  })
  it('הוספה בסוף ובתחילה (אחרי דור 1)', () => {
    expect(names(insertRow(base(), 99)).at(-1)).toBe('')
    expect(names(insertRow(base(), 0))[1]).toBe('')
  })
  it('סידור מחדש — למעלה ולמטה', () => {
    expect(names(moveRow(base(), 2, -1))).toEqual([ROOT_NAME, 'ב', 'א', 'ג', 'ד'])
    expect(names(moveRow(base(), 2, 1))).toEqual([ROOT_NAME, 'א', 'ג', 'ב', 'ד'])
    expect(moveRow(base(), 4, 1)).toEqual(base())
  })
})

describe('מחיקה', () => {
  it('shift — הדורות הבאים עולים דור', () => {
    const chain = chainFromRows(removeRow(base(), 2, 'shift'))
    expect(chain.map(c => `${c.generation}:${c.name}`)).toEqual([`1:${ROOT_NAME}`, '2:א', '3:ג', '4:ד'])
  })
  it('keep — הדורות הבאים נשארים במקומם, והמקום ריק למילוי', () => {
    const rows = removeRow(base(), 2, 'keep')
    expect(names(rows)).toEqual([ROOT_NAME, 'א', '', 'ג', 'ד'])
    expect(emptyRows(rows)).toEqual([2])
  })
  it('דור אחרון נמחק תמיד, גם ב-keep', () => {
    expect(names(removeRow(base(), 4, 'keep'))).toEqual([ROOT_NAME, 'א', 'ב', 'ג'])
  })
})

describe('sanitizeEditedChain (שרת)', () => {
  it('מספור מחדש לפי מיקום, דור 1 נכפה, והקשר מנוקה', () => {
    const r = sanitizeEditedChain([
      { generation: 1, name: 'משהו אחר' },
      { generation: 7, name: ' א  ב ', relation: 'son' },
      { generation: 9, name: 'ג', relation: 'hacker' },
    ])
    expect(r).toEqual({ ok: true, chain: [
      { generation: 1, name: ROOT_NAME, relation: null },
      { generation: 2, name: 'א ב', relation: 'son' },
      { generation: 3, name: 'ג', relation: null },
    ] })
  })
  it('דור ריק נדחה עם הסבר', () => {
    const r = sanitizeEditedChain([{ generation: 2, name: 'א' }, { generation: 3, name: ' ' }])
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('דור 3 ריק')
  })
  it('אין מגבלה של 12 — 30 דורות עוברים, מעל 40 נדחה', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ generation: i + 2, name: `ד${i}` }))
    expect(sanitizeEditedChain(mk(30)).ok).toBe(true)
    expect(sanitizeEditedChain(mk(40)).ok).toBe(false)
  })
  it('קלט שאינו מערך או בלי דורות — נדחה', () => {
    expect(sanitizeEditedChain('x').ok).toBe(false)
    expect(sanitizeEditedChain([{ generation: 1, name: ROOT_NAME }]).ok).toBe(false)
  })
})
