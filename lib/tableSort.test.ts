import { describe, it, expect } from 'vitest'
import { compareBy, sortRows, distinctValues, filterRows, BLANK } from './tableSort'

describe('compareBy', () => {
  it('ממיין עברית לפי א-ב', () => {
    expect(compareBy('text', 'אברהם', 'בנימין')).toBeLessThan(0)
    expect(compareBy('text', 'תמר', 'אברהם')).toBeGreaterThan(0)
  })

  it('ממיין מספרים כמספרים ולא כטקסט', () => {
    // כטקסט "10" < "9". זה בדיוק מה שמיון נאיבי שובר.
    expect(compareBy('number', 10, 9)).toBeGreaterThan(0)
    expect(compareBy('number', '1,234', '999')).toBeGreaterThan(0)
    expect(compareBy('number', '600.00 ₪', '0.21')).toBeGreaterThan(0)
  })

  it('ממיין תאריכים כרונולוגית', () => {
    expect(compareBy('date', '2026-01-01', '2026-08-26')).toBeLessThan(0)
  })

  it('מציב ריקים בסוף, לא בהתחלה', () => {
    // ⚠️ ריק אינו "קטן" — הוא חוסר ידיעה.
    expect(compareBy('text', null, 'אברהם')).toBeGreaterThan(0)
    expect(compareBy('text', 'אברהם', '')).toBeLessThan(0)
    expect(compareBy('text', null, undefined)).toBe(0)
    expect(compareBy('text', '—', 'אברהם')).toBeGreaterThan(0)
  })

  it('תאריך פגום מתנהג כריק ולא כ-1970', () => {
    // תאריך לא תקין כבר הפיל רינדור שלם במערכת הזו.
    expect(compareBy('date', 'לא תאריך', '2026-01-01')).toBeGreaterThan(0)
  })

  it('ערך לא-מספרי אינו נחשב 0', () => {
    // "לא ידוע" ו-0 הם דברים שונים — מיון שמציב אותם יחד מטעה.
    expect(compareBy('number', 'אין', 0)).toBeGreaterThan(0)
  })

  it('"בית 10" בא אחרי "בית 9"', () => {
    expect(compareBy('text', 'בית 10', 'בית 9')).toBeGreaterThan(0)
  })
})

describe('sortRows', () => {
  const rows = [
    { id: 'a', name: 'בנימין', n: 5 },
    { id: 'b', name: 'אברהם', n: 5 },
    { id: 'c', name: 'גד', n: 1 },
  ]

  it('עולה ויורד', () => {
    expect(sortRows(rows, r => r.name, 'text', 'asc').map(r => r.id)).toEqual(['b', 'a', 'c'])
    expect(sortRows(rows, r => r.name, 'text', 'desc').map(r => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('מיון יציב — שווים שומרים על סדרם המקורי', () => {
    // 🔴 בלי זה הטבלה "רוקדת": 6,903 נשואים מתחלפים בכל רינדור.
    const byN = sortRows(rows, r => r.n, 'number', 'asc')
    expect(byN.map(r => r.id)).toEqual(['c', 'a', 'b'])
    const desc = sortRows(rows, r => r.n, 'number', 'desc')
    expect(desc.map(r => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('ריקים נשארים בסוף גם בסדר יורד', () => {
    const withBlank = [{ id: 'x', name: '' }, { id: 'y', name: 'אברהם' }, { id: 'z', name: 'תמר' }]
    expect(sortRows(withBlank, r => r.name, 'text', 'asc').map(r => r.id)).toEqual(['y', 'z', 'x'])
    expect(sortRows(withBlank, r => r.name, 'text', 'desc').map(r => r.id)).toEqual(['z', 'y', 'x'])
  })

  it('אינו משנה את המערך המקורי', () => {
    const orig = [...rows]
    sortRows(rows, r => r.name, 'text', 'asc')
    expect(rows).toEqual(orig)
  })
})

describe('distinctValues', () => {
  const rows = [
    { city: 'ירושלים' }, { city: 'ירושלים' }, { city: 'ירושלים' },
    { city: 'בית שמש' }, { city: null }, { city: 'ערד' }, { city: 'ערד' },
  ]

  it('סופר כל ערך', () => {
    const d = distinctValues(rows, r => r.city)
    expect(d.find(x => x.value === 'ירושלים')?.count).toBe(3)
    expect(d.find(x => x.value === 'ערד')?.count).toBe(2)
  })

  it('ממוין לפי שכיחות — מה שמחפשים נמצא בראש', () => {
    expect(distinctValues(rows, r => r.city).map(d => d.value))
      .toEqual(['ירושלים', 'ערד', 'בית שמש', BLANK])
  })

  it('ריקים מקובצים לערך אחד ואינם נזרקים', () => {
    // "בלי עיר" הוא מצב שצריך אפשרות לסנן לפיו.
    const d = distinctValues(rows, r => r.city)
    expect(d.find(x => x.value === BLANK)?.count).toBe(1)
  })

  it('הריק תמיד אחרון גם כשהוא הנפוץ ביותר', () => {
    const many = [{ c: null }, { c: null }, { c: null }, { c: 'ערד' }]
    expect(distinctValues(many, r => r.c).map(d => d.value)).toEqual(['ערד', BLANK])
  })
})

describe('filterRows', () => {
  const rows = [{ s: 'נשוי' }, { s: 'נשוי' }, { s: 'אלמן' }, { s: null }]

  it('בחירה ריקה = הכל מוצג, לא כלום', () => {
    // ⚠️ טבלה שמתרוקנת אחרי ניקוי בחירה נראית כמו תקלה.
    expect(filterRows(rows, r => r.s, new Set()).length).toBe(4)
  })

  it('מסנן לפי הערכים שנבחרו', () => {
    expect(filterRows(rows, r => r.s, new Set(['נשוי'])).length).toBe(2)
    expect(filterRows(rows, r => r.s, new Set(['נשוי', 'אלמן'])).length).toBe(3)
  })

  it('אפשר לסנן לפי "ריק"', () => {
    expect(filterRows(rows, r => r.s, new Set([BLANK])).length).toBe(1)
  })
})
