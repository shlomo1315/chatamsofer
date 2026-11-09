import { describe, it, expect } from 'vitest'
import { buildGilyonHtml } from './gilyonotMail'
import { sanitizeMailHtml as sanitizeRichHtml } from './gilyonotRichHtml'
import { DEFAULT_DESIGN } from './gilyonotDesign'

const btn = '<p style="text-align:center"><a href="https://example.com/x" data-btn="1" style="display:inline-block;background-color:#1d4ed8;color:#ffffff;padding:12px 28px;border-radius:10px;font-weight:bold;text-decoration:none;">לחצו כאן</a></p>'

describe('גיליונות: כפתורים ידניים בגוף', () => {
  it('כפתור מעוצב שורד ניקוי עם העיצוב', () => {
    const out = sanitizeRichHtml(btn)
    expect(out).toContain('href="https://example.com/x"')
    expect(out).toContain('background-color:#1d4ed8')
    expect(out).toContain('border-radius:10px')
    expect(out).toContain('display:inline-block')
  })
  it('המייל לא מכניס כפתור או קישור לארכיון אוטומטית', () => {
    const html = buildGilyonHtml({ title: 'ט', parasha: '', bodyHtml: btn, design: { ...DEFAULT_DESIGN, showArchiveButton: true }, unsubscribeUrl: null })
    expect(html).not.toContain('/archive/gilyonot')
    expect(html).not.toContain('לכל הגיליונות הקודמים')
    expect(html).toContain('לחצו כאן')
  })
})
