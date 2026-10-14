// ─────────────────────────────────────────────────────────────────────────────
// מייל הגיליון השבועי. HTML פשוט בטבלאות, כדי שייראה זהה ב-Gmail, ב-Outlook
// ובטלפון. אותה פונקציה בונה את התצוגה המקדימה, את מייל הניסיון ואת המייל לנמענים.
// ─────────────────────────────────────────────────────────────────────────────

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
const NAVY = '#1B3256'

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

export function buildGilyonHtml(opts: {
  title: string
  parasha: string
  intro?: string | null
  name?: string | null
  downloadUrl: string
  unsubscribeUrl: string | null
  pixelUrl?: string | null
}): string {
  const greeting = opts.name ? `<p style="margin:0 0 14px;color:#334155;font-size:16px;">לכבוד ${escHtml(opts.name)} שליט"א,</p>` : ''
  const intro = opts.intro?.trim() ? paragraphs(opts.intro) : ''
  const unsub = opts.unsubscribeUrl
    ? `<a href="${escHtml(opts.unsubscribeUrl)}" style="color:#64748b;">להסרה מרשימת התפוצה</a>`
    : ''
  const pixel = opts.pixelUrl ? `<img src="${escHtml(opts.pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;"/>` : ''

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,'Heebo',sans-serif;direction:rtl;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td style="background:${NAVY};padding:26px 28px;text-align:center;">
<p style="margin:0;color:#cbd5e1;font-size:13px;letter-spacing:.5px;">גיליונות החתם סופר</p>
<h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;line-height:1.4;">${escHtml(opts.title)}</h1>
${opts.parasha ? `<p style="margin:6px 0 0;color:#e2e8f0;font-size:16px;">${escHtml(opts.parasha)}</p>` : ''}
</td></tr>
<tr><td style="padding:28px 28px 8px;text-align:right;">
${greeting}${intro}
</td></tr>
<tr><td align="center" style="padding:8px 28px 30px;">
<a href="${escHtml(opts.downloadUrl)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-size:17px;font-weight:bold;padding:14px 34px;border-radius:10px;">להורדת הגיליון</a>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 28px;text-align:center;color:#64748b;font-size:12px;line-height:1.7;">
קיבלתם מייל זה כי נרשמתם לקבלת הגיליון השבועי של היכל החתם סופר.<br/>${unsub}
</td></tr>
</table>
${pixel}
</td></tr>
</table>
</body>
</html>`
}
