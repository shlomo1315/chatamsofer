// שכבת שליחת מייל מול Resend דרך ה-REST API (ללא חבילת npm).
// משתמש במשתני סביבה: RESEND_API_KEY, MAILBOX_FROM_ADDRESS, MAILBOX_FROM_NAME

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export interface SendMailParams {
  to: string[]
  cc?: string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
  headers?: Record<string, string>
  attachments?: { filename: string; path: string }[]
}

// האם תשתית השליחה מוגדרת בשרת
export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.MAILBOX_FROM_ADDRESS
}

// כתובת השולח בפורמט "שם <כתובת>"
export function mailFrom(): string {
  const addr = process.env.MAILBOX_FROM_ADDRESS ?? ''
  const name = process.env.MAILBOX_FROM_NAME ?? 'היכל החתם סופר'
  return name ? `${name} <${addr}>` : addr
}

interface ResendResponse {
  id?: string
  message?: string
  name?: string
  error?: string
}

export async function sendMail(params: SendMailParams): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('שירות המייל אינו מוגדר (RESEND_API_KEY חסר)')

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: params.to,
      cc: params.cc && params.cc.length ? params.cc : undefined,
      subject: params.subject,
      html: params.html,
      text: params.text,
      reply_to: params.replyTo,
      headers: params.headers,
      attachments: params.attachments && params.attachments.length ? params.attachments : undefined,
    }),
  })

  let json: ResendResponse = {}
  try { json = (await res.json()) as ResendResponse } catch { /* גוף ריק */ }

  if (!res.ok) {
    throw new Error(json.message ?? json.error ?? `שגיאת Resend (${res.status})`)
  }
  return { id: json.id ?? '' }
}
