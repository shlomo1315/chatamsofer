import { describe, it, expect } from 'vitest'
import { htmlToPlainText } from './sendMail'

describe('htmlToPlainText', () => {
  it('שומר את כתובת הקישור בגרסת הטקסט (A2)', () => {
    const html = `<p>נא לתקן</p><a href="https://chasamsofer.co.il/lineage-review/abc" style="x">
            לעדכון סדר הדורות
          </a>`
    const text = htmlToPlainText(html)
    expect(text).toContain('לעדכון סדר הדורות: https://chasamsofer.co.il/lineage-review/abc')
  })

  it('קישור שהתווית שלו היא הכתובת עצמה לא מוכפל', () => {
    expect(htmlToPlainText('<a href="https://x.co/a">https://x.co/a</a>')).toBe('https://x.co/a')
  })

  it('קישור mailto נשאר תווית בלבד', () => {
    expect(htmlToPlainText('<a href="mailto:a@b.c">כתבו לנו</a>')).toBe('כתבו לנו')
  })

  it('ממיר שורות ופענוח ישויות כמו קודם', () => {
    expect(htmlToPlainText('שלום<br/>עולם &amp; כל')).toBe('שלום\nעולם & כל')
  })
})
