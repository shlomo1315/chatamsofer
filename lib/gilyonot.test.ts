import { describe, it, expect } from 'vitest'
import { normalizeEmail, decideSubscribe, parseNedarimGilyon, parseImportText, currentParasha } from './gilyonot'
import { buildGilyonHtml, defaultSubject } from './gilyonotMail'

describe('gilyonot: אימות מייל', () => {
  it('מקבל כתובות תקינות ומנרמל לאותיות קטנות', () => {
    expect(normalizeEmail('  Moshe.Cohen@Gmail.com ')).toBe('moshe.cohen@gmail.com')
    expect(normalizeEmail('a+b@mail.co.il')).toBe('a+b@mail.co.il')
  })
  it('דוחה כתובות שבורות', () => {
    for (const bad of ['', 'abc', 'a@b', 'a@b.c', '@x.com', 'a@.com', 'a..b@x.com', '.a@x.com', 'a@x..com', 'a b@x.com', 'א@x.com', 'a@-x.com', null, 5]) {
      expect(normalizeEmail(bad)).toBeNull()
    }
  })
})

describe('gilyonot: מניעת כפילויות', () => {
  it('מייל חדש נכנס', () => {
    expect(decideSubscribe(null, { source: 'web', name: 'משה' })).toBe('insert')
  })
  it('מייל קיים ופעיל לא נכנס שוב, ורק משלים שם חסר', () => {
    expect(decideSubscribe({ status: 'active', full_name: 'משה' }, { source: 'nedarim', name: 'משה כהן' })).toBe('exists')
    expect(decideSubscribe({ status: 'active', full_name: null }, { source: 'nedarim', name: 'משה כהן' })).toBe('update_name')
  })
  it('מי שהסיר את עצמו חוזר רק בהרשמה שלו עצמו, לא בייבוא או בהוספה ידנית', () => {
    const gone = { status: 'unsubscribed' as const, full_name: null }
    expect(decideSubscribe(gone, { source: 'web', name: null })).toBe('reactivate')
    expect(decideSubscribe(gone, { source: 'nedarim', name: null })).toBe('reactivate')
    expect(decideSubscribe(gone, { source: 'import', name: null })).toBe('blocked_unsubscribed')
    expect(decideSubscribe(gone, { source: 'manual', name: null })).toBe('blocked_unsubscribed')
  })
  it('ייבוא: כפילות בתוך הרשימה עצמה נספרת פעם אחת, שורות בלי מייל תקין נספרות', () => {
    const r = parseImportText('משה כהן\tMoshe@x.com\nmoshe@x.com\nבלי מייל\n\nלוי, levi@y.co.il')
    expect(r.rows).toEqual([{ email: 'moshe@x.com', name: 'משה כהן' }, { email: 'levi@y.co.il', name: 'לוי' }])
    expect(r.invalid).toBe(1)
  })
})

describe('gilyonot: טופס נדרים', () => {
  it('קורא שם ומייל משמות השדות המקובלים', () => {
    expect(parseNedarimGilyon({ ClientName: 'יעקב לוי', Mail: 'Y@X.com', TransactionId: '123' }))
      .toEqual({ email: 'y@x.com', name: 'יעקב לוי', sourceRef: '123' })
    expect(parseNedarimGilyon({ FirstName: 'יעקב', LastName: 'לוי', Email: 'y@x.com' }).name).toBe('יעקב לוי')
    expect(parseNedarimGilyon({ Mail: 'not-an-email' }).email).toBeNull()
  })
})

describe('gilyonot: פרשה ומייל', () => {
  it('מציע את הפרשה של השבת הקרובה', () => {
    // יום ד' 14.10.2026 — השבת הקרובה 17.10.2026 היא פרשת נח
    expect(currentParasha(new Date('2026-10-14T10:00:00Z'))).toBe('פרשת נח')
  })
  it('מנטרל HTML בטקסט של המנהל ובשם הנמען', () => {
    const html = buildGilyonHtml({ title: '<b>x</b>', parasha: 'פרשת נח', intro: 'שורה\n\n<script>', name: '"><img>', unsubscribeUrl: 'https://a/u' })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>x</b>')
    expect(html).not.toContain('"><img>')
    expect(html).toContain('https://a/u')
  })
  it('נושא ברירת מחדל', () => {
    expect(defaultSubject('גיליון החתם סופר', 'פרשת נח')).toBe('גיליון החתם סופר · פרשת נח')
  })
})

describe('parseImportText', () => {
  it('מפריד מייל ושם בכל סדר ובלי כפילויות', () => {
    const { rows, invalid } = parseImportText('משה כהן, Moshe@Gmail.com\nmoshe@gmail.com\tכפול\nלא מייל\n\n"דוד לוי";david@x.co.il')
    expect(invalid).toBe(1)
    expect(rows.map(r => r.email)).toEqual(['moshe@gmail.com', 'david@x.co.il'])
    expect(rows[0].name).toBe('משה כהן')
    expect(rows[1].name).toBe('דוד לוי')
  })
})
