// מייל ההודעה למזמינים (אותו נוסח של הודעת הקול), נשלח מכתובת היריד.
import { CREDITS_ANNOUNCEMENT_TEXT } from './creditsAnnouncement'
import { shell, HEICHAL_LOGO_URL } from './emailTemplates'

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

/** HTML במעטפת המיילים הראשית (לוגו היכל החתם סופר), פסקה לכל בלוק בנוסח. */
export function buildAnnouncementMailHtml(): string {
  const paras = CREDITS_ANNOUNCEMENT_TEXT.split('\n\n')
    .map(p => `<p style="margin:0 0 18px;color:#1e293b;font-size:16px;line-height:1.8;text-align:right;">${esc(p)}</p>`).join('')
  return shell({
    logoUrl: HEICHAL_LOGO_URL,
    preheader: 'הודעה ממערכת הזמנות הספרים',
    accent: '#0ea5e9',
    title: 'הודעה ממערכת הזמנות הספרים',
    subtitle: 'יריד הספרים',
    body: paras,
  })
}
