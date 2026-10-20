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
