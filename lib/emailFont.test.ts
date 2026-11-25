import { describe, it, expect } from 'vitest'
import { withHeeboFont } from './emailFont'

describe('withHeeboFont: כל מייל יוצא בפונט Heebo', () => {
  it('פונט אחר מקבל Heebo בראש, והגיבוי נשמר', () => {
    const out = withHeeboFont('<div style="font-family:Arial,sans-serif;line-height:1.7">שלום</div>')
    expect(out).toContain('font-family:Heebo,Arial,sans-serif;line-height:1.7')
  })

  it('system-ui, ומרכאות בודדות בתכונה לא נשברות', () => {
    expect(withHeeboFont(`<p style='font-family: system-ui, Arial'>x</p>`)).toContain(`font-family:Heebo,system-ui, Arial'`)
  })

  it('Heebo קיים, monospace ו-inherit נשארים כמו שהם', () => {
    const html = `<div style="font-family:'Heebo',Arial">a<code style="font-family:'Courier New',monospace">123</code><span style="font-family:inherit">b</span></div>`
    expect(withHeeboFont(html)).toBe(html)
  })

  it('מייל בלי פונט בכלל נעטף ב-Heebo, גם בתוך body', () => {
    expect(withHeeboFont('<p>שלום</p>')).toMatch(/^<div style="font-family:Heebo,Arial,sans-serif">[\s\S]*<p>שלום<\/p><\/div>$/)
    expect(withHeeboFont('<html><body dir="rtl"><p>x</p></body></html>'))
      .toBe('<html><body dir="rtl"><div style="font-family:Heebo,Arial,sans-serif"><p>x</p></div></body></html>')
  })
})
