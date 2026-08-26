import { describe, it, expect } from 'vitest'
import { parseRich, richToHtml, richToPlain, hasRichMarkup } from './richText'

describe('הדגשה', () => {
  it('**טקסט** הופך למודגש', () => {
    expect(richToHtml('שלום **וברכה** לכם')).toBe('שלום <strong>וברכה</strong> לכם')
  })

  it('כמה הדגשות באותה שורה', () => {
    expect(richToHtml('**א** ו**ב**')).toBe('<strong>א</strong> ו<strong>ב</strong>')
  })

  it('כוכבית בודדת נשארת טקסט', () => {
    // ⚠️ הנוסחים הקיימים משתמשים ב-* כתבליט רשימה.
    expect(richToHtml('* רשת שיעורי תורה')).toBe('* רשת שיעורי תורה')
  })

  it('הדגשה לא נבלעת על פני שורות', () => {
    const out = richToHtml('**פתיחה\nסיום**')
    expect(out).not.toContain('<strong>')
  })
})

describe('קישורים', () => {
  it('[טקסט](כתובת) הופך לקישור', () => {
    const out = richToHtml('[לחצו כאן](https://chasamsofer.co.il)')
    expect(out).toContain('href="https://chasamsofer.co.il"')
    expect(out).toContain('>לחצו כאן<')
  })

  it('mailto מותר — הנוסחים משתמשים בו', () => {
    expect(richToHtml('[מייל](mailto:g@chasamsofer.info)')).toContain('href="mailto:g@chasamsofer.info"')
  })

  it('🔴 javascript: אינו הופך לקישור', () => {
    // הכתובת נראית תקינה בשדה, ומריצה קוד אצל מי שלוחץ.
    // ⚠️ הטקסט עצמו כן נשאר גלוי (מנוטרל) — מחיקה שקטה של מה שהמזכיר
    // הקליד גרועה יותר, כי הוא לא יבין למה הנוסח השתנה.
    const out = richToHtml('[לחצו](javascript:alert(1))')
    expect(out).not.toContain('<a ')
    expect(out).not.toContain('href=')
  })

  it('🔴 data: נחסם', () => {
    expect(richToHtml('[x](data:text/html,<script>)')).not.toContain('<a ')
  })

  it('קישור מקבל target ו-rel', () => {
    const out = richToHtml('[א](https://x.co.il)')
    expect(out).toContain('rel="noopener noreferrer"')
  })
})

describe('🔴 אבטחה — הטקסט נערך במסך ההגדרות ונשלח לאלפי נמענים', () => {
  it('HTML גולמי מנוטרל', () => {
    const out = richToHtml('<script>alert(1)</script>')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('HTML בתוך הדגשה מנוטרל', () => {
    expect(richToHtml('**<img src=x onerror=1>**')).not.toContain('<img')
  })

  it('גרשיים בכתובת אינם שוברים את התגית', () => {
    const out = richToHtml('[a](https://x.co.il/?q="onmouseover="alert(1))')
    expect(out).not.toContain('onmouseover="alert')
  })

  it('תווית הקישור מנוטרלת', () => {
    expect(richToHtml('[<b>x</b>](https://x.co.il)')).not.toContain('<b>')
  })
})

describe('⚠️ תאימות לאחור — הנוסחים הקיימים', () => {
  it('טקסט רגיל ללא סימון אינו משתנה', () => {
    expect(richToHtml('שלום וברכה!')).toBe('שלום וברכה!')
  })

  it('שורות חדשות הופכות ל-br, כמו קודם', () => {
    expect(richToHtml('שורה\nשנייה')).toBe('שורה<br/>שנייה')
  })

  it('סוגריים מרובעים רגילים נשארים טקסט', () => {
    expect(richToHtml('[הערה] כלשהי')).toBe('[הערה] כלשהי')
  })

  it('כתובת פסולה משאירה את הטקסט ולא מוחקת אותו', () => {
    // ⚠️ מחיקה שקטה של מה שהמזכיר הקליד גרועה מהצגתו כטקסט.
    expect(richToHtml('[x](ftp://a.b)')).toContain('x')
  })
})

describe('גרסת טקסט נקי', () => {
  it('קישור מוצג עם הכתובת', () => {
    expect(richToPlain('[לחצו](https://x.co.il)')).toBe('לחצו (https://x.co.il)')
  })

  it('הדגשה יורדת', () => {
    expect(richToPlain('**חשוב**')).toBe('חשוב')
  })
})

describe('hasRichMarkup', () => {
  it('מזהה סימון', () => {
    expect(hasRichMarkup('**א**')).toBe(true)
    expect(hasRichMarkup('[א](https://x.co.il)')).toBe(true)
  })
  it('טקסט רגיל — false', () => {
    expect(hasRichMarkup('שלום')).toBe(false)
  })
})

describe('parseRich', () => {
  it('מפרק לקטעים לפי הסדר', () => {
    expect(parseRich('א**ב**ג').map(t => t.kind)).toEqual(['text', 'bold', 'text'])
  })
})
