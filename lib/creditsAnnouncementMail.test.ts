import { describe, it, expect } from 'vitest'
import { pickAnnouncementRecipients, buildAnnouncementMailHtml } from './creditsAnnouncementMail'
import { CREDITS_ANNOUNCEMENT_TEXT } from './creditsAnnouncement'

describe('נמעני מייל ההודעה', () => {
  it('כתובת אחת פעם אחת, בלי ריקות ולא תקינות', () => {
    const r = pickAnnouncementRecipients([
      { customer_email: 'A@x.com ' }, { customer_email: 'a@x.com' }, { customer_email: null },
      { customer_email: '' }, { customer_email: 'bad' }, { customer_email: 'b@y.co.il' },
    ])
    expect(r).toEqual(['a@x.com', 'b@y.co.il'])
  })
  it('המייל מכיל את הנוסח כל פסקה, RTL', () => {
    const h = buildAnnouncementMailHtml()
    expect(h).toContain('dir="rtl"')
    for (const p of CREDITS_ANNOUNCEMENT_TEXT.split('\n\n')) expect(h).toContain(p.replace(/&/g, '&amp;'))
  })
})

import { parseAnnouncementMail, defaultAnnouncementMail, ANNOUNCEMENT_MAIL_SUBJECT } from './creditsAnnouncementMail'
describe('נוסח ערוך', () => {
  it('נשמר ונקרא חזרה', () => {
    const raw = JSON.stringify({ subject: ' נושא חדש ', body: 'פסקה א\n\nפסקה ב' })
    expect(parseAnnouncementMail(raw)).toEqual({ subject: 'נושא חדש', body: 'פסקה א\n\nפסקה ב' })
  })
  it('ריק או פגום חוזר לברירת המחדל', () => {
    expect(parseAnnouncementMail(null)).toEqual(defaultAnnouncementMail())
    expect(parseAnnouncementMail('xx')).toEqual(defaultAnnouncementMail())
    expect(parseAnnouncementMail({ subject: ' ', body: '' }).subject).toBe(ANNOUNCEMENT_MAIL_SUBJECT)
  })
  it('המייל נבנה מהגוף הערוך ומנוקה מ-HTML', () => {
    const h = buildAnnouncementMailHtml('שלום <b>x</b>\n\nשורה שנייה')
    expect(h).toContain('שלום &lt;b&gt;x&lt;/b&gt;')
    expect(h).toContain('שורה שנייה')
    expect(h).not.toContain(CREDITS_ANNOUNCEMENT_TEXT.slice(0, 20))
  })
})
