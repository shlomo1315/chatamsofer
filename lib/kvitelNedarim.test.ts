import { describe, it, expect } from 'vitest'
import { clearDefaultRequest, parseNedarimKvitel } from './kvitelNedarim'

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
    expect(p.lines.map(l => [l.name, l.relation, l.requestType])).toEqual([['שרה', 'bat', 'zivug'], ['דוד', 'ben', '']])
    expect(p.flags).toEqual([null, 'חסר בטופס נדרים: בן או בת'])
  })

  it('טקסט חופשי בהערות מפוענח כמו מייל, ושדות רגישים לא נשמרים במקור', () => {
    const p = parseNedarimKvitel({ Comments: 'יעקב בן מרים - פרנסה', token: 'x', CardNumber: '4580' })
    expect(p.lines[0]).toMatchObject({ name: 'יעקב', parentName: 'מרים', requestType: 'parnasa' })
    expect(p.rawText).toContain('Comments')
    expect(p.rawText).not.toContain('token')
    expect(p.rawText).not.toContain('4580')
  })

  it('הגשה חדשה עם שמות בשדות וגם בטקסט החופשי: כל השמות נקלטים', () => {
    const p = parseNedarimKvitel({ TransactionId: 'T1', name1: 'דוד', mother1: 'לאה', relation1: 'בן', Comments: 'משה בן שרה\nיוסף בן רחל' })
    expect(p.lines.map(l => l.name)).toEqual(['דוד', 'משה', 'יוסף'])
    expect(p.lines[1]).toMatchObject({ relation: 'ben', parentName: 'שרה' })
  })
})

describe('בקשה מנדרים: שמות ובקשה אמיתית, בלי "ברכה והצלחה" כברירת מחדל', () => {
  it('הגשה עם כמה שמות ובקשה אמיתית: כל שם נקלט, הבקשה נשמרת במלואה, ובלי בקשה — "לא צוינה בקשה"', () => {
    const p = parseNedarimKvitel({
      Id: '77', name1: 'דוד', relation1: 'בן', mother1: 'לאה', request1: 'לזיווג הגון בקרוב ולנחת מכל יוצ"ח',
      name2: 'שרה', relation2: 'בת', mother2: 'רחל', name3: 'יוסף', relation3: 'בן', mother3: 'ברכה',
    })
    expect(p.lines.map(l => [l.name, l.relation, l.parentName, l.requestType])).toEqual([
      ['דוד', 'ben', 'לאה', 'other'], ['שרה', 'bat', 'רחל', ''], ['יוסף', 'ben', 'ברכה', ''],
    ])
    expect(p.lines[0].requestNote).toBe('לזיווג הגון בקרוב ולנחת מכל יוצ"ח')
    expect(p.lines.some(l => l.requestType === 'yeshua')).toBe(false)
    expect(p.flags).toEqual([null, null, null])
  })

  it('הגשה ישנה עם "ברכה והצלחה" שהונחה: חוזרת ל"לא צוינה בקשה", בלי שורות כפולות, ושאר הסימון נשמר', () => {
    const old = [
      { request_type: 'yeshua', request_note: null, flag_reason: 'חסר בטופס נדרים: סוג בקשה' },
      { request_type: 'yeshua', request_note: null, flag_reason: 'חסר בטופס נדרים: בן או בת, סוג בקשה' },
      { request_type: 'yeshua', request_note: null, flag_reason: 'לא צוין סוג בקשה (הונח "ישועה וברכה") · כבר הוגש ב-6 הימים האחרונים' },
      { request_type: 'yeshua', request_note: null, flag_reason: null },
      { request_type: 'refua', request_note: null, flag_reason: 'חסר בטופס נדרים: סוג בקשה' },
    ]
    const fixed = old.map(l => clearDefaultRequest(l))
    expect(fixed).toEqual([
      { request_type: '', flagged: false, flag_reason: null },
      { request_type: '', flagged: true, flag_reason: 'חסר בטופס נדרים: בן או בת' },
      { request_type: '', flagged: true, flag_reason: 'כבר הוגש ב-6 הימים האחרונים' },
      null, // "ברכה והצלחה" בלי סימון של ברירת מחדל — אולי נבחרה ידנית, לא נוגעים
      null,
    ])
    expect(fixed).toHaveLength(old.length)
    // הרצה שנייה לא משנה כלום
    expect(clearDefaultRequest({ ...old[0], ...fixed[0]! })).toBeNull()
  })
})
