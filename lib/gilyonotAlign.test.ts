// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { alignBlocks } from './gilyonotAlign'
import { sanitizeMailHtml } from './gilyonotRichHtml'
import { buildGilyonHtml } from './gilyonotMail'

const SAMPLE = '<p>פסקה</p><div>שורה א<br>שורה ב</div><h2>כותרת</h2><ul><li>אחד</li><li>שניים</li></ul>טקסט חשוף א<br>טקסט חשוף ב<br><p>סוף</p>'

function setup(html: string) {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  const range = document.createRange()
  range.selectNodeContents(root)
  return { root, range }
}

describe('יישור בעורך הגיליונות', () => {
  it('מרכוז חל על כל סוגי השורות', () => {
    const { root, range } = setup(SAMPLE)
    expect(alignBlocks(root, range, 'center')).toBeGreaterThan(5)
    const html = root.innerHTML
    // כל פסקה, div, כותרת ופריט רשימה ממורכזים
    for (const el of root.querySelectorAll('p, div, h2, li')) expect((el as HTMLElement).style.textAlign).toBe('center')
    // טקסט חשוף נעטף ב-div ממורכז, ואין טקסט חשוף שנשאר בשורש
    expect([...root.childNodes].every(n => n.nodeType !== 3 && n.nodeName !== 'BR')).toBe(true)
    expect(html).toContain('טקסט חשוף א')
  })

  it('היישור נשמר אחרי הניקוי ובמייל הסופי', () => {
    const { root, range } = setup(SAMPLE)
    alignBlocks(root, range, 'center')
    const clean = sanitizeMailHtml(root.innerHTML)
    const count = (clean.match(/text-align:center/g) ?? []).length
    expect(count).toBeGreaterThanOrEqual(7)
    expect(sanitizeMailHtml(clean)).toBe(clean)
    const mail = buildGilyonHtml({ title: 'ט', parasha: 'נח', bodyHtml: clean, unsubscribeUrl: null })
    expect((mail.match(/text-align:center/g) ?? []).length).toBeGreaterThanOrEqual(count)
  })

  it('מרכוז רק לשורות המסומנות, ויישור חוזר לימין', () => {
    const { root } = setup('<p>א</p><p>ב</p><p>ג</p>')
    const ps = root.querySelectorAll('p')
    const range = document.createRange()
    range.setStart(ps[0].firstChild!, 0)
    range.setEnd(ps[1].firstChild!, 1)
    alignBlocks(root, range, 'center')
    expect([...ps].map(p => p.style.textAlign)).toEqual(['center', 'center', ''])
    alignBlocks(root, range, 'right')
    expect([...ps].map(p => p.style.textAlign)).toEqual(['right', 'right', ''])
  })

  it('בחירה שנגמרת בתחילת הבלוק הבא לא מיישרת אותו', () => {
    const { root } = setup('<p>א</p><p>ב</p>')
    const ps = root.querySelectorAll('p')
    const range = document.createRange()
    range.setStart(ps[0].firstChild!, 0)
    range.setEnd(ps[1].firstChild!, 0)
    alignBlocks(root, range, 'center')
    expect([...ps].map(p => p.style.textAlign)).toEqual(['center', ''])
  })
})
