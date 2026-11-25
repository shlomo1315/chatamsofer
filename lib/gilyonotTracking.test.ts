import { beforeAll, describe, expect, it } from 'vitest'
import { gilyonClickUrl, signGilyonClick, verifyGilyonClick, wrapGilyonLinks } from './gilyonotTracking'

const TOKEN = '11111111-2222-3333-4444-555555555555'

beforeAll(() => {
  process.env.OTP_NONCE_SECRET = 'test-secret'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://chasamsofer.co.il'
})

describe('gilyonotTracking', () => {
  it('חתימה תקפה רק לאותו טוקן ואותה כתובת', () => {
    const s = signGilyonClick(TOKEN, 'https://a.co/x')
    expect(verifyGilyonClick(TOKEN, 'https://a.co/x', s)).toBe(true)
    expect(verifyGilyonClick(TOKEN, 'https://evil.co/x', s)).toBe(false)
    expect(verifyGilyonClick('99999999-2222-3333-4444-555555555555', 'https://a.co/x', s)).toBe(false)
    expect(verifyGilyonClick(TOKEN, 'https://a.co/x', 'zz')).toBe(false)
  })

  it('עוטף קישורים רגילים ומשאיר הסרה, מעקב, mailto ועוגנים', () => {
    const unsub = `https://chasamsofer.co.il/api/gilyonot/unsubscribe/${TOKEN}`
    const html = [
      '<a href="https://chasamsofer.co.il/gilyonot?a=1&amp;b=2">גיליון</a>',
      `<a href="${unsub}">הסרה</a>`,
      `<a href="https://chasamsofer.co.il/api/gilyonot/d/${TOKEN}">הורדה</a>`,
      '<a href="mailto:x@y.co">מייל</a>',
      '<a href="#top">למעלה</a>',
      "<a class='b' href='https://other.co/p'>אחר</a>",
    ].join('')
    const out = wrapGilyonLinks(html, TOKEN, [unsub])
    expect(out).toContain(`href="${gilyonClickUrl(TOKEN, 'https://chasamsofer.co.il/gilyonot?a=1&b=2').replace(/&/g, '&amp;')}"`)
    expect(out).toContain(`href="${unsub}"`)
    expect(out).toContain(`/api/gilyonot/d/${TOKEN}">`)
    expect(out).toContain('href="mailto:x@y.co"')
    expect(out).toContain('href="#top"')
    expect(out).toContain(`href='${gilyonClickUrl(TOKEN, 'https://other.co/p').replace(/&/g, '&amp;')}'`)
    expect(out.match(/\/api\/gilyonot\/c\//g)).toHaveLength(2)
  })
})
