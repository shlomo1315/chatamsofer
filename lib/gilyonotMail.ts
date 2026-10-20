// ─────────────────────────────────────────────────────────────────────────────
// מייל הגיליון השבועי. HTML פשוט בטבלאות, כדי שייראה זהה ב-Gmail, ב-Outlook
// ובטלפון. אותה פונקציה בונה את התצוגה המקדימה, את מייל הניסיון ואת המייל לנמענים.
// ─────────────────────────────────────────────────────────────────────────────

import { NAME_TOKEN, normalizeDesign } from './gilyonotDesign'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')

export const gilyonotUrls = {
  download: (token: string) => `${SITE}/api/gilyonot/d/${token}`,
  pixel: (token: string) => `${SITE}/api/gilyonot/o/${token}`,
  unsubscribe: (token: string) => `${SITE}/api/gilyonot/unsubscribe/${token}`,
  signup: () => `${SITE}/gilyonot`,
}

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// פסקאות מהטקסט החופשי של המנהל: שורה ריקה = פסקה חדשה, ירידת שורה = <br>.
function paragraphs(text: string): string {
  return text.trim().split(/\n\s*\n/).filter(Boolean)
    .map(p => `<p style="margin:0 0 14px;color:#334155;font-size:16px;line-height:1.8;">${escHtml(p.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

export function defaultSubject(title: string, parasha: string): string {
  return [title.trim() || 'גיליון החתם סופר', parasha.trim()].filter(Boolean).join(' · ')
}

/** טקסט קצר מהעיצוב (כותרת, פוטר): escape, וירידת שורה = <br>. */
const plain = (s: string) => escHtml(s.trim()).replace(/\n/g, '<br/>')

export function buildGilyonHtml(opts: {
  title: string
  parasha: string
  intro?: string | null
  /** גוף המייל מהעורך, אחרי sanitizeMailHtml בשרת. אם ריק, משתמשים ב-intro. */
  bodyHtml?: string | null
  design?: unknown
  name?: string | null
  downloadUrl: string
  unsubscribeUrl: string | null
  pixelUrl?: string | null
}): string {
  const d = normalizeDesign(opts.design)
  const name = opts.name?.trim() ? escHtml(opts.name.trim()) : ''
  const withName = (html: string) => html.split(NAME_TOKEN).join(name)
  const greeting = d.showGreeting && name && d.greeting.trim()
    ? `<p style="margin:0 0 14px;color:#334155;font-size:16px;">${withName(plain(d.greeting))}</p>` : ''
  const body = opts.bodyHtml?.trim() ? withName(opts.bodyHtml) : (opts.intro?.trim() ? paragraphs(opts.intro) : '')
  const title = d.headerTitle.trim() || opts.title
  const sub = d.headerSub.trim() || opts.parasha
  const unsub = opts.unsubscribeUrl
    ? `<a href="${escHtml(opts.unsubscribeUrl)}" style="color:#64748b;">להסרה מרשימת התפוצה</a>`
    : ''
  const pixel = opts.pixelUrl ? `<img src="${escHtml(opts.pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;"/>` : ''
  const header = d.showHeader ? `<tr><td style="background:${d.headerColor};padding:26px 28px;text-align:center;">
${d.kicker.trim() ? `<p style="margin:0;color:#dbeafe;font-size:13px;letter-spacing:.5px;">${plain(d.kicker)}</p>` : ''}
<h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;line-height:1.4;">${plain(title)}</h1>
${sub.trim() ? `<p style="margin:6px 0 0;color:#eff6ff;font-size:16px;">${plain(sub)}</p>` : ''}
</td></tr>` : ''
  const button = d.showButton && d.buttonLabel.trim() ? `<tr><td align="center" style="padding:8px 28px 30px;">
<a href="${escHtml(opts.downloadUrl)}" style="display:inline-block;background:${d.buttonColor};color:#ffffff;text-decoration:none;font-size:17px;font-weight:bold;padding:14px 34px;border-radius:10px;">${plain(d.buttonLabel)}</a>
</td></tr>` : ''

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${d.bgColor};font-family:Arial,'Heebo',sans-serif;direction:rtl;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${d.bgColor};padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
${header}
<tr><td style="padding:28px 28px 8px;text-align:right;">
${greeting}${body}
</td></tr>
${button}
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 28px;text-align:center;color:#64748b;font-size:12px;line-height:1.7;">
${d.footerText.trim() ? `${plain(d.footerText)}<br/>` : ''}${unsub}
</td></tr>
</table>
${pixel}
</td></tr>
</table>
</body>
</html>`
}
