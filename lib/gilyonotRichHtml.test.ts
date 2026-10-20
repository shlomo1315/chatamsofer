import { describe, expect, it } from 'vitest'
import { sanitizeMailHtml } from './gilyonotRichHtml'
import { DEFAULT_DESIGN, normalizeDesign } from './gilyonotDesign'
import { buildGilyonHtml } from './gilyonotMail'

describe('sanitizeMailHtml', () => {
  it('חוסם סקריפטים, אירועים וקישורי javascript', () => {
    const out = sanitizeMailHtml('<p onclick="x()">שלום<script>alert(1)</script></p><a href="javascript:alert(1)">א</a><img src="data:image/png;base64,AA" onerror="x()">')
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|data:/i)
    expect(out).toContain('שלום')
  })

  it('שומר כפתור, צבעים ויישור, ומוסיף target לקישור', () => {
    const out = sanitizeMailHtml('<p style="text-align:center"><a href="https://x.co" data-btn="1" style="background-color:#2563eb;color:#ffffff;padding:12px 28px;border-radius:10px">לחצו</a></p>')
    expect(out).toContain('data-btn="1"')
    expect(out).toContain('background-color:#2563eb')
    expect(out).toContain('text-align:center')
    expect(out).toContain('target="_blank"')
  })

  it('מסיר סגנון לא מוכר', () => {
    expect(sanitizeMailHtml('<p style="position:fixed;color:red">א</p>')).not.toContain('position')
  })

  it('ניקוי חוזר לא משנה את התוצאה', () => {
    const once = sanitizeMailHtml('<h2>כותרת</h2><p>טקסט <b>מודגש</b></p><hr><img src="https://x.co/a.png">')
    expect(sanitizeMailHtml(once)).toBe(once)
  })

  it('עורך ריק מחזיר מחרוזת ריקה', () => {
    expect(sanitizeMailHtml('<p><br></p><div>&nbsp;</div>')).toBe('')
    expect(sanitizeMailHtml(42)).toBe('')
  })
})

describe('normalizeDesign', () => {
  it('מקבל רק מפתחות מוכרים וצבעי hex', () => {
    const d = normalizeDesign({ headerColor: '#FF0000', buttonColor: 'red', showButton: false, evil: 1, kicker: 'x'.repeat(500) })
    expect(d.headerColor).toBe('#ff0000')
    expect(d.buttonColor).toBe(DEFAULT_DESIGN.buttonColor)
    expect(d.showButton).toBe(false)
    expect(d.kicker).toHaveLength(80)
    expect('evil' in d).toBe(false)
  })
})

describe('buildGilyonHtml', () => {
  const base = { title: 'גיליון', parasha: 'נח', downloadUrl: 'https://x.co/d', unsubscribeUrl: 'https://x.co/u' }

  it('מחליף {{שם}} בשם המנוקה, בפתיחה ובגוף', () => {
    const html = buildGilyonHtml({ ...base, name: '<b>משה</b>', bodyHtml: '<p>שלום {{שם}}</p>' })
    expect(html).toContain('שלום &lt;b&gt;משה&lt;/b&gt;')
    expect(html).toContain('לכבוד &lt;b&gt;משה&lt;/b&gt; שליט&quot;א')
    expect(html).not.toContain('{{שם}}')
  })

  it('מכבד את העיצוב: בלי כפתור ובלי כותרת', () => {
    const html = buildGilyonHtml({ ...base, design: { showButton: false, showHeader: false } })
    expect(html).not.toContain('להורדת הגיליון')
    expect(html).not.toContain('גיליונות החתם סופר')
  })
})
