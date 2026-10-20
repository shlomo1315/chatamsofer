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

export const ANNOUNCEMENT_MAIL_KEY = 'announcement_mail_content'
export const DEFAULT_ANNOUNCEMENT_BODY = CREDITS_ANNOUNCEMENT_TEXT

export type AnnouncementMailContent = { subject: string; body: string }

export const defaultAnnouncementMail = (): AnnouncementMailContent =>
  ({ subject: ANNOUNCEMENT_MAIL_SUBJECT, body: DEFAULT_ANNOUNCEMENT_BODY })

/** ממיר ערך שנשמר ב-app_settings (או קלט מהמסך) לנוסח תקין; שדה ריק חוזר לברירת המחדל. */
export function parseAnnouncementMail(raw: unknown): AnnouncementMailContent {
  let v: unknown = raw
  if (typeof raw === 'string') { try { v = JSON.parse(raw) } catch { v = null } }
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const d = defaultAnnouncementMail()
  const subject = typeof o.subject === 'string' ? o.subject.trim().slice(0, 200) : ''
  const body = typeof o.body === 'string' ? o.body.replace(/\r\n/g, '\n').trim().slice(0, 5000) : ''
  return { subject: subject || d.subject, body: body || d.body }
}

/** HTML במעטפת המיילים הראשית (לוגו היכל החתם סופר), פסקה לכל בלוק בנוסח (שורה ריקה מפרידה). */
export function buildAnnouncementMailHtml(body: string = DEFAULT_ANNOUNCEMENT_BODY): string {
  const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p style="margin:0 0 18px;color:#1e293b;font-size:16px;line-height:1.8;text-align:right;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
  return shell({
    logoUrl: HEICHAL_LOGO_URL,
    preheader: 'הודעה ממערכת הזמנות הספרים',
    accent: '#0ea5e9',
    title: 'הודעה ממערכת הזמנות הספרים',
    subtitle: 'יריד הספרים',
    body: paras,
  })
}
