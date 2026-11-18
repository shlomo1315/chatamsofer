import { describe, expect, it } from 'vitest'
import { imageHtml, isBlankHtml, isNewIssue, pickDefaultTemplate } from './gilyonotDefaultTemplate'

describe('גיליון חדש', () => {
  it('בלי גוף ובלי פתיח נחשב חדש', () => {
    expect(isNewIssue({ body_html: null, intro: null })).toBe(true)
    expect(isNewIssue({ body_html: '  ', intro: '' })).toBe(true)
  })
  it('גיליון עם גוף או פתיח לא נחשב חדש ולא נדרס', () => {
    expect(isNewIssue({ body_html: '<p>שלום</p>' })).toBe(false)
    expect(isNewIssue({ intro: 'פתיח' })).toBe(false)
  })
})

describe('בחירת תבנית ברירת מחדל', () => {
  it('בוחר את התבנית של גיליון החתם סופר', () => {
    const list = [{ name: 'אחרת' }, { name: 'תבנית גיליון החתם סופר' }]
    expect(pickDefaultTemplate(list)).toBe(list[1])
  })
  it('בלי התאמה בשם לא טוען כלום', () => {
    expect(pickDefaultTemplate([{ name: 'אחרת' }])).toBeNull()
    expect(pickDefaultTemplate([])).toBeNull()
  })
})

describe('עורך ריק', () => {
  it('פסקה ריקה נחשבת ריקה, תמונה לא', () => {
    expect(isBlankHtml('<p><br></p>')).toBe(true)
    expect(isBlankHtml('<p>טקסט</p>')).toBe(false)
    expect(isBlankHtml(imageHtml('https://x.co/a.png'))).toBe(false)
  })
})

describe('תמונה', () => {
  it('כתובת מלאה ורוחב מוגבל, עם בריחה', () => {
    const h = imageHtml('https://x.co/a.png?a=1&b="2"')
    expect(h).toContain('max-width:100%')
    expect(h).toContain('&amp;')
    expect(h).toContain('&quot;')
  })
})
