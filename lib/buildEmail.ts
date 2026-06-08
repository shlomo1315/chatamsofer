// Builds a properly-formatted multipart/alternative RFC 2822 email message
// ready for base64url-encoding and sending via the Gmail API.
//
// Multipart (HTML + plain text) is required for good deliverability —
// spam filters heavily penalise HTML-only messages.

export interface BuildOptions {
  from: string
  fromName: string
  to: string
  subject: string
  /** Full HTML string. A plain-text fallback is auto-derived from it. */
  html: string
  threadId?: string
  replyTo?: string
}

function encodeHeader(text: string): string {
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/?(h[1-6]|div|tr|td|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function randomId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

export function buildRawEmail(opts: BuildOptions): string {
  const { from, fromName, to, subject, html, replyTo } = opts
  const boundary = `----=_Part_${randomId()}`
  const domain = from.split('@')[1] ?? 'mail'
  const messageId = `<${randomId()}.${Date.now()}@${domain}>`
  const plain = htmlToPlain(html)

  const lines: string[] = [
    `From: ${encodeHeader(fromName)} <${from}>`,
    `To: ${to}`,
    `Reply-To: ${replyTo ?? from}`,
    `Subject: ${encodeHeader(subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    plain,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    '',
    `--${boundary}--`,
  ]

  return lines.join('\r\n')
}

export function encodeForGmail(raw: string): string {
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
