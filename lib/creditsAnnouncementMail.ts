// מייל ההודעה למזמינים (אותו נוסח של הודעת הקול), נשלח מכתובת היריד.
import { CREDITS_ANNOUNCEMENT_TEXT } from './creditsAnnouncement'

export const ANNOUNCEMENT_MAIL_SUBJECT = 'הודעה ממערכת הזמנות הספרים - היכל החתם סופר'
export const ANNOUNCEMENT_MAIL_STATUSES = ['paid', 'picking', 'packed', 'shipped']

export type AnnouncementOrderRow = { customer_email: string | null }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** כתובות ייחודיות (אותיות קטנות), דילוג על ריקות/לא תקינות. */
export function pickAnnouncementRecipients(rows: AnnouncementOrderRow[]): string[] {
  const seen = new Set<string>()
  for (const r of rows) {
    const e = String(r.customer_email ?? '').trim().toLowerCase()
    if (e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) seen.add(e)
  }
  return [...seen]
}

/** HTML בכיוון RTL, פסקה לכל בלוק בנוסח, בלי תוספות. */
export function buildAnnouncementMailHtml(): string {
  const paras = CREDITS_ANNOUNCEMENT_TEXT.split('\n\n')
    .map(p => `<p style="margin:0 0 16px;">${esc(p)}</p>`).join('')
  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;font-size:16px;line-height:1.7;color:#111827;text-align:right;">${paras}</div>`
}
