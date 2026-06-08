// Builds a properly-formatted multipart/alternative RFC 2822 email message
// ready for base64url-encoding and sending via the Gmail API.

export interface BuildOptions {
  from: string
  fromName: string
  to: string
  subject: string
  html: string
  threadId?: string
  replyTo?: string
  /** Message-ID of the original message — adds In-Reply-To + References for proper threading */
  inReplyTo?: string
  /** UUID token for open-tracking pixel — injected before </body> */
  trackingToken?: string
}

function encodeHeader(text: string): string {
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`
}

// RFC 2045: base64 lines must not exceed 76 characters
function wrapBase64(b64: string): string {
  return b64.match(/.{1,76}/g)?.join('\r\n') ?? b64
}

// RFC 2045 quoted-printable encoder for UTF-8 text
function encodeQP(text: string): string {
  const bytes = Buffer.from(text, 'utf8')
  const lines: string[] = []
  let line = ''

  for (const byte of bytes) {
    let encoded: string
    if (
      (byte >= 33 && byte <= 126 && byte !== 61) || // printable ASCII except '='
      byte === 9 || byte === 32                     // tab and space (not at end of line)
    ) {
      encoded = String.fromCharCode(byte)
    } else if (byte === 10) {
      // newline — flush line
      if (line.endsWith(' ') || line.endsWith('\t')) line += '='
      lines.push(line)
      line = ''
      continue
    } else if (byte === 13) {
      continue // skip bare CR
    } else {
      encoded = `=${byte.toString(16).toUpperCase().padStart(2, '0')}`
    }

    // Soft line break at 75 chars (76 - 1 for the '=')
    if (line.length + encoded.length > 75) {
      lines.push(line + '=')
      line = ''
    }
    line += encoded
  }
  if (line) lines.push(line)
  return lines.join('\r\n')
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
  const { from, fromName, to, subject, html, replyTo, inReplyTo, trackingToken } = opts
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my-app-gamma-pearl-29.vercel.app'
  const pixel = trackingToken
    ? `<img src="${appUrl}/api/track/open?t=${trackingToken}" width="1" height="1" style="display:none;border:0;" alt="" />`
    : ''
  const finalHtml = trackingToken ? html.replace(/<\/body>/i, `${pixel}</body>`) || html + pixel : html
  const boundary = `----=_Part_${randomId()}`
  const domain = from.split('@')[1] ?? 'mail'
  const messageId = `<${randomId()}.${Date.now()}@${domain}>`
  const plain = htmlToPlain(finalHtml)

  const parts: string[] = [
    `From: ${encodeHeader(fromName)} <${from}>`,
    `To: ${to}`,
    `Reply-To: ${replyTo ?? from}`,
    `Subject: ${encodeHeader(subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    encodeQP(plain),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(finalHtml, 'utf8').toString('base64')),
    '',
    `--${boundary}--`,
  ]

  return parts.join('\r\n')
}

export function encodeForGmail(raw: string): string {
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
