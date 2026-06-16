import { Resend } from 'resend'
import { NOREPLY_FROM, BRAND_NAME } from './departments'

export interface MailAttachment { filename: string; mimeType: string; contentB64: string }
export interface MailOptions {
  replyTo?: string
  fromName?: string
}

// שליחת מייל דרך Resend. כל המיילים נשלחים מ-noreply@chasamsofer.info,
// עם אפשרות "דואר לתשובה" (Reply-To) לפי המחלקה. תומך בצרופות.
export async function deliverMail(
  to: string,
  subject: string,
  html: string,
  attachments?: MailAttachment[],
  options?: MailOptions,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[mail] RESEND_API_KEY חסר — לא נשלח מייל')
    return { ok: false, error: 'RESEND_API_KEY missing' }
  }

  const fromName = options?.fromName ?? BRAND_NAME
  const from = `${fromName} <${NOREPLY_FROM}>`

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
      ...(attachments?.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.contentB64, 'base64') })) }
        : {}),
    })
    if (error) {
      console.error('[mail] Resend error:', error)
      return { ok: false, error: String(error.message ?? error) }
    }
    return { ok: true }
  } catch (err) {
    console.error('[mail] Resend threw:', err)
    return { ok: false, error: String(err) }
  }
}

// שליפת קובץ מ-URL והמרתו לצרופה (base64), עם timeout. מחזיר null אם נכשל.
export async function urlToAttachment(url: string, filename: string): Promise<MailAttachment | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return { filename, mimeType: res.headers.get('content-type') || 'application/octet-stream', contentB64: buf.toString('base64') }
  } catch { return null }
}
