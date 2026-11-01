import { describe, it, expect } from 'vitest'
import { chumashOf, filterRows, toRows, hebrewYearLabel } from './gilyonotArchiveView'

describe('ארכיון הגיליונות', () => {
  it('חומש לפי פרשה', () => {
    expect(chumashOf('פרשת וירא')).toBe('בראשית')
    expect(chumashOf('בשלח')).toBe('שמות')
    expect(chumashOf('חנוכה')).toBe('מועדים')
    expect(chumashOf('???')).toBe('')
  })
  it('שנה עברית', () => {
    expect(hebrewYearLabel('2026-11-01')).toBe('תשפ״ז')
  })
  const rows = toRows([
    { id: 'a', title: 'הכנסת אורחים', parasha: 'וירא', year: 2026, topic: 'חסד', issue_date: '2026-11-01', file_size: 1 },
    { id: 'b', title: 'תיבה של אמונה', parasha: 'נח', year: 2025, topic: 'אמונה', issue_date: '2025-10-20', file_size: 1 },
  ])
  it('סינון וחיפוש', () => {
    expect(filterRows(rows, { q: '', year: '', chumash: '', topic: 'חסד' }).map(r => r.id)).toEqual(['a'])
    expect(filterRows(rows, { q: 'נח אמונה', year: '', chumash: '', topic: '' }).map(r => r.id)).toEqual(['b'])
    expect(filterRows(rows, { q: '', year: 'תשפ״ז', chumash: 'בראשית', topic: '' }).map(r => r.id)).toEqual(['a'])
    expect(filterRows(rows, { q: 'לא קיים', year: '', chumash: '', topic: '' })).toEqual([])
  })
})
