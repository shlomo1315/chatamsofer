import { describe, it, expect } from 'vitest'
import { parseNedarimKvitel } from './kvitelNedarim'

describe('kvitelNedarim', () => {
  it('מערך lines (גם כמחרוזת JSON), עם פרטי מגיש ומזהה הגשה', () => {
    const p = parseNedarimKvitel({
      TransactionId: '12345', ClientName: 'משה כהן', Phone: '050-123-4567', Mail: 'M@x.com',
      lines: JSON.stringify([{ name: 'מאיר', relation: 'בן', parentName: 'פעשא לאה', requestType: 'לרפואה שלימה' }]),
    })
    expect(p.lines).toEqual([{ name: 'מאיר', relation: 'ben', parentName: 'פעשא לאה', requestType: 'refua', requestNote: null }])
    expect(p.flags).toEqual([null])
    expect(p).toMatchObject({ sourceRef: '12345', contactName: 'משה כהן', phone: '0501234567', email: 'm@x.com' })
  })

  it('שדות שטוחים ממוספרים; חסר בן/בת או בקשה — מסומן', () => {
    const p = parseNedarimKvitel({ name1: 'שרה', mother1: 'רחל', relation1: 'bat', request1: 'zivug', name2: 'דוד', mother2: 'חנה' })
    expect(p.lines.map(l => [l.name, l.relation, l.requestType])).toEqual([['שרה', 'bat', 'zivug'], ['דוד', 'ben', 'yeshua']])
    expect(p.flags).toEqual([null, 'חסר בטופס נדרים: בן או בת, סוג בקשה'])
  })

  it('טקסט חופשי בהערות מפוענח כמו מייל, ושדות רגישים לא נשמרים במקור', () => {
    const p = parseNedarimKvitel({ Comments: 'יעקב בן מרים - פרנסה', token: 'x', CardNumber: '4580' })
    expect(p.lines[0]).toMatchObject({ name: 'יעקב', parentName: 'מרים', requestType: 'parnasa' })
    expect(p.rawText).toContain('Comments')
    expect(p.rawText).not.toContain('token')
    expect(p.rawText).not.toContain('4580')
  })
})
