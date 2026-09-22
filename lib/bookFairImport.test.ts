import { describe, it, expect } from 'vitest'
import { matchHeader, mapHeaderRow, parseBooksTable, TEMPLATE_HEADERS } from './bookFairImport'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ייבוא הקטלוג — הכלל המנחה: לעולם לא לכתוב "מה שהצליח" ולדלג בשקט.
//
// קובץ שנכנס חלקית בלי שאיש ידע הוא קטלוג שקרי: הספרים שנשמטו פשוט לא
// יימכרו, ואיש לא יבין למה. לכן כל שורה מסווגת והמשתמש רואה הכול *לפני*
// שמשהו נשמר.
// ─────────────────────────────────────────────────────────────────────────────

const H = ['מק"ט', 'שם הספר', 'מחבר', 'הוצאה', 'מספר כרכים', 'מחיר', 'מלאי אתר', 'מלאי טלפון', 'קוד טלפוני']

describe('normalizeHeader / matchHeader — הכותרות שהמשתמש כותב בפועל', () => {
  // ⚠️ המשתמש מכין את הקובץ בעצמו. דחייה בגלל גרש היא כישלון של הכלי.
  it('⚠️ גרשיים מכל הסוגים מתנרמלים לאותו דבר', () => {
    const forms = ['מק"ט', "מק'ט", 'מק״ט', 'מק׳ט', 'מקט', 'מק ט', ' מקט ']
    for (const f of forms) expect(matchHeader(f)).toBe('sku')
  })

  it('מזהה ניסוחים חלופיים', () => {
    expect(matchHeader('שם')).toBe('title')
    expect(matchHeader('שם ספר')).toBe('title')
    expect(matchHeader('כותר')).toBe('title')
    expect(matchHeader('מחיר בשקלים')).toBe('price')
    expect(matchHeader('מחיר לצרכן')).toBe('price')
    expect(matchHeader('כמות כרכים')).toBe('volumes')
  })

  it('מזהה גם אנגלית', () => {
    expect(matchHeader('SKU')).toBe('sku')
    expect(matchHeader('Title')).toBe('title')
    expect(matchHeader('Price')).toBe('price')
  })

  it('⚠️ מתעלם מתווי כיווניות בלתי נראים', () => {
    expect(matchHeader('‏מחיר')).toBe('price')
  })

  it('מחזיר null על כותרת לא מוכרת', () => {
    expect(matchHeader('הערות פנימיות')).toBeNull()
    expect(matchHeader('')).toBeNull()
  })

  // 🔴 "מלאי טלפון" מכיל את "טלפון" — התאמה בהכלה הייתה משייכת אותו
  // לשדה הלא נכון, לפי סדר המפתחות באובייקט
  it('🔴 מבחין בין "מלאי אתר", "מלאי טלפון" ו"קוד טלפוני"', () => {
    expect(matchHeader('מלאי אתר')).toBe('stock_web')
    expect(matchHeader('מלאי טלפון')).toBe('stock_phone')
    expect(matchHeader('קוד טלפוני')).toBe('phone_code')
  })

  it('ממפה שורת כותרות שלמה', () => {
    const m = mapHeaderRow(H)
    expect(m).toEqual({
      sku: 0, title: 1, author: 2, publisher: 3,
      volumes: 4, price: 5, stock_web: 6, stock_phone: 7, phone_code: 8,
    })
  })

  it('עמודות בסדר אחר ועם עמודות זרות', () => {
    const m = mapHeaderRow(['הערות', 'מחיר', 'שם הספר', 'בלה בלה', 'מקט'])
    expect(m.price).toBe(1)
    expect(m.title).toBe(2)
    expect(m.sku).toBe(4)
  })

  // ⚠️ הראשון זוכה — קובץ עם שתי עמודות "מחיר" לא יתבלבל
  it('⚠️ כותרת כפולה — הראשונה זוכה', () => {
    expect(mapHeaderRow(['מחיר', 'מחיר']).price).toBe(0)
  })
})

describe('🔴 parseBooksTable — חוסם מוקדם', () => {
  // 🔴 עדיף להיעצר עם הודעה אחת ברורה מאשר לייצר 400 שגיאות זהות
  it('🔴 חוסם קובץ בלי עמודות חובה', () => {
    const r = parseBooksTable([['שם הספר', 'מחבר'], ['ספר', 'מחבר']])
    expect(r.missingColumns).toContain('sku')
    expect(r.missingColumns).toContain('price')
    expect(r.books).toHaveLength(0)
    expect(r.errors).toHaveLength(0)   // לא מציף בשגיאות שורה
  })

  it('קובץ ריק', () => {
    expect(parseBooksTable([]).missingColumns.length).toBeGreaterThan(0)
  })
})

describe('parseBooksTable — פענוח תקין', () => {
  it('מפענח שורה מלאה', () => {
    const r = parseBooksTable([H, ['1001', 'שולחן ערוך', 'רבי יוסף קארו', 'מכון ירושלים', '4', '180', '20', '10', '101']])
    expect(r.errors).toHaveLength(0)
    expect(r.books).toHaveLength(1)
    expect(r.books[0]).toEqual({
      sku: '1001', title: 'שולחן ערוך', author: 'רבי יוסף קארו', publisher: 'מכון ירושלים',
      volumes: 4, price_agorot: 18000, stock_web: 20, stock_phone: 10, phone_code: 101,
    })
  })

  // 🔴 הבדיקה שמגינה מאובדן אגורה בכל ספר בקטלוג
  it('🔴 מחיר שבור נשמר באגורות מדויקות', () => {
    const r = parseBooksTable([H, ['1002', 'ספר', '', '', '', '45.90', '', '', '']])
    expect(r.books[0].price_agorot).toBe(4590)
  })

  it('מחיר עם פסיק וסימן מטבע', () => {
    const r = parseBooksTable([H, ['1003', 'ספר', '', '', '', '₪1,250.50', '', '', '']])
    expect(r.books[0].price_agorot).toBe(125050)
  })

  it('ברירות מחדל: כרך אחד, מלאי אפס, בלי קוד טלפוני', () => {
    const r = parseBooksTable([H, ['1004', 'ספר', '', '', '', '100', '', '', '']])
    expect(r.books[0]).toMatchObject({ volumes: 1, stock_web: 0, stock_phone: 0, phone_code: null })
  })

  it('מלאי 0 מפורש נשמר כ-0', () => {
    const r = parseBooksTable([H, ['1005', 'ספר', '', '', '', '100', '0', '0', '']])
    expect(r.books[0].stock_web).toBe(0)
  })

  // ⚠️ קובץ אקסל כמעט תמיד מסתיים בשורות ריקות — הן אינן שגיאה
  it('⚠️ מדלג על שורות ריקות בלי לדווח שגיאה', () => {
    const r = parseBooksTable([H,
      ['1006', 'ספר', '', '', '', '100', '', '', ''],
      ['', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', ''],
    ])
    expect(r.books).toHaveLength(1)
    expect(r.skipped).toBe(2)
    expect(r.errors).toHaveLength(0)
  })
})

describe('🔴 parseBooksTable — שגיאות', () => {
  it('מדווח שורה שגויה ואינו מכניס אותה', () => {
    const r = parseBooksTable([H,
      ['1001', 'ספר תקין', '', '', '', '100', '', '', ''],
      ['', 'ספר בלי מקט', '', '', '', '100', '', '', ''],
    ])
    expect(r.books).toHaveLength(1)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].messages.join(' ')).toContain('מק"ט')
  })

  // ⚠️ מספר השורה חייב להתאים למה שהמשתמש רואה באקסל, אחרת הוא לא ימצא
  // את התקלה. שורה 1 היא הכותרת, ולכן הנתון הראשון הוא שורה 2.
  it('⚠️ מספר השורה תואם לאקסל (הכותרת היא שורה 1)', () => {
    const r = parseBooksTable([H,
      ['1001', 'תקין', '', '', '', '100', '', '', ''],
      ['1002', 'תקין', '', '', '', '100', '', '', ''],
      ['', '', '', '', '', 'לא מספר', '', '', ''],
    ])
    expect(r.errors[0].row).toBe(4)
  })

  it('מחיר לא מספרי — שגיאה עם הערך המקורי', () => {
    const r = parseBooksTable([H, ['1001', 'ספר', '', '', '', 'מאה שקל', '', '', '']])
    expect(r.errors[0].messages.join(' ')).toContain('מאה שקל')
  })

  // 🔴 ספר בלי מחיר שנשמר כ-0 היה נמכר בחינם
  it('🔴 מחיר חסר הוא שגיאה, לא אפס', () => {
    const r = parseBooksTable([H, ['1001', 'ספר', '', '', '', '', '', '', '']])
    expect(r.books).toHaveLength(0)
    expect(r.errors[0].messages.join(' ')).toContain('חסר מחיר')
  })

  it('מלאי לא מספרי — שגיאה', () => {
    const r = parseBooksTable([H, ['1001', 'ספר', '', '', '', '100', 'הרבה', '', '']])
    expect(r.books).toHaveLength(0)
    expect(r.errors[0].messages.join(' ')).toContain('מלאי אתר')
  })

  it('מלאי שלילי נדחה', () => {
    const r = parseBooksTable([H, ['1001', 'ספר', '', '', '', '100', '-5', '', '']])
    expect(r.books).toHaveLength(0)
  })

  it('אוסף כמה שגיאות באותה שורה', () => {
    const r = parseBooksTable([H, ['', '', '', '', 'שלוש', 'חינם', '', '', '']])
    expect(r.errors[0].messages.length).toBeGreaterThanOrEqual(3)
  })

  // 🔴 שני ספרים עם אותו מק"ט: האחרון היה דורס את הראשון בשקט
  it('🔴 תופס מק"ט כפול בתוך הקובץ ומפנה לשורה הראשונה', () => {
    const r = parseBooksTable([H,
      ['1001', 'ספר א', '', '', '', '100', '', '', ''],
      ['1001', 'ספר ב', '', '', '', '200', '', '', ''],
    ])
    expect(r.books).toHaveLength(1)
    expect(r.books[0].title).toBe('ספר א')
    expect(r.duplicateSkus).toContain('1001')
    expect(r.errors[0].messages.join(' ')).toContain('שורה 2')
  })

  it('כפילות מק"ט אינה תלויה ברישיות', () => {
    const r = parseBooksTable([H,
      ['ABC-1', 'ספר א', '', '', '', '100', '', '', ''],
      ['abc-1', 'ספר ב', '', '', '', '100', '', '', ''],
    ])
    expect(r.books).toHaveLength(1)
  })
})

describe('התבנית', () => {
  it('כוללת את כל השדות ומסמנת חובה', () => {
    const required = TEMPLATE_HEADERS.filter(h => h.required).map(h => h.field)
    expect(required).toEqual(['sku', 'title', 'price'])
    expect(TEMPLATE_HEADERS).toHaveLength(9)
  })

  // 🔴 אם כותרת התבנית לא מזוהה על ידי המפענח, קובץ שהורד מהמערכת
  // ומולא כמו שצריך יידחה. זו התקלה המביכה ביותר האפשרית כאן.
  it('🔴 כל כותרת בתבנית מזוהה על ידי המפענח עצמו', () => {
    for (const h of TEMPLATE_HEADERS) {
      expect(matchHeader(h.label)).toBe(h.field)
    }
  })

  it('🔴 הלוך ושוב: התבנית עצמה מתפענחת במלואה', () => {
    const headers = TEMPLATE_HEADERS.map(h => h.label)
    const m = mapHeaderRow(headers)
    expect(Object.keys(m)).toHaveLength(TEMPLATE_HEADERS.length)
  })
})

describe('🔴 תרחיש מלא — קובץ אמיתי מעורב', () => {
  it('מסווג נכון קובץ עם תקינות, שגיאות, כפילות וריקות', () => {
    const r = parseBooksTable([
      ['מקט', 'שם', 'מחיר', 'מלאי אתר', 'מלאי טלפון'],
      ['A1', 'ספר ראשון',  '45.90',  '10', '5'],
      ['A2', 'ספר שני',    '₪120',   '20', '0'],
      ['',   'בלי מקט',    '50',     '1',  '1'],
      ['A1', 'מקט כפול',   '30',     '1',  '1'],
      ['A4', 'מחיר פגום',  'חינם',   '1',  '1'],
      ['',   '',           '',       '',   ''],
      ['A5', 'אחרון תקין', '1,250',  '3',  '2'],
    ])

    expect(r.books).toHaveLength(3)
    expect(r.books.map(b => b.sku)).toEqual(['A1', 'A2', 'A5'])
    expect(r.errors).toHaveLength(3)
    expect(r.skipped).toBe(1)
    expect(r.duplicateSkus).toEqual(['A1'])

    expect(r.books[0].price_agorot).toBe(4590)
    expect(r.books[1].price_agorot).toBe(12000)
    expect(r.books[2].price_agorot).toBe(125000)

    // 🔴 המלאי הדו-ערוצי נשמר בנפרד
    expect(r.books[0]).toMatchObject({ stock_web: 10, stock_phone: 5 })
    expect(r.books[1]).toMatchObject({ stock_web: 20, stock_phone: 0 })
  })
})
