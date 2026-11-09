import { describe, it, expect } from 'vitest'
import { isRecipientToken, withoutRemoved, confirmPage, removedPage, WARNING_TEXT } from './gilyonotUnsubscribe'
import { buildGilyonHtml } from './gilyonotMail'
import { issueEmail } from './gilyonotSender'

const TOKEN = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c'

describe('טוקן ההסרה', () => {
  it('מקבל רק uuid ולא כתובת מייל או ניחוש', () => {
    expect(isRecipientToken(TOKEN)).toBe(true)
    expect(isRecipientToken('a@b.com')).toBe(false)
    expect(isRecipientToken('1')).toBe(false)
    expect(isRecipientToken(`${TOKEN}' or 1=1`)).toBe(false)
    expect(isRecipientToken(undefined)).toBe(false)
  })
})

describe('סינון נמענים שהוסרו', () => {
  it('מסנן בלי תלות ברישיות וברווחים', () => {
    const removed = new Set(['gone@example.com'])
    const list = [{ email: ' Gone@Example.com ' }, { email: 'stay@example.com' }]
    expect(withoutRemoved(list, removed, x => x.email)).toEqual([{ email: 'stay@example.com' }])
  })
})

describe('עמוד ההסרה', () => {
  it('מציג אזהרה ושני כפתורים, וההסרה רק ב-POST עם confirm', async () => {
    const html = await confirmPage(`/api/gilyonot/unsubscribe/${TOKEN}`, 'a@b.com').text()
    expect(html).toContain('שימו לב!')
    expect(html).toContain(WARNING_TEXT.replace(/"/g, '&quot;'))
    expect(html).toContain('אישור הסרה')
    expect(html).toContain('ביטול, השארו ברשימה')
    expect(html).toMatch(/<form method="POST" action="[^"]+\?confirm=1"/)
    expect(html).toContain('?stay=1')
  })

  it('אחרי ההסרה יש אפשרות לחזור', async () => {
    const html = await removedPage(`/api/gilyonot/optout/${TOKEN}`).text()
    expect(html).toContain('הוסרתם בהצלחה')
    expect(html).toContain('?resubscribe=1')
  })
})

describe('קישור ההסרה במייל', () => {
  it('בתחתית המייל: "להסרה מרשימת התפוצה לחצו כאן" עם הקישור', () => {
    const html = buildGilyonHtml({ title: 'ג', parasha: 'נח', bodyHtml: '<p>x</p>', unsubscribeUrl: `https://x/api/gilyonot/unsubscribe/${TOKEN}` })
    expect(html).toMatch(new RegExp(`להסרה מרשימת התפוצה <a href="https://x/api/gilyonot/unsubscribe/${TOKEN}"[^>]*>לחצו כאן</a>`))
  })

  it('מייל אמיתי לנמען מרשימה חיצונית מוביל להסרה לפי טוקן המשלוח', () => {
    const m = issueEmail({ title: 'ג', parasha: 'נח', intro: null, body_html: '<p>x</p>', design: null } as never, { deliveryToken: TOKEN, subscriberToken: null })
    expect(m.html).toContain(`/api/gilyonot/optout/${TOKEN}`)
    expect(m.html).toContain('לחצו כאן')
  })
})
