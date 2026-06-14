import { sendEmail } from './email'
import { getGmailClient } from './gmail'
import { buildRawEmail, encodeForGmail } from './buildEmail'

// שליחת מייל דרך Gmail API (מוגדר ועובד), עם נפילה ל-SMTP אם נכשל. תומך בצרופות.
export async function deliverMail(
  to: string,
  subject: string,
  html: string,
  attachments?: { filename: string; mimeType: string; contentB64: string }[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const from     = process.env.GMAIL_EMAIL ?? 'office@chasamsofer.info'
    const fromName = 'היכל החתם סופר משרד ראשי'
    const raw      = buildRawEmail({ from, fromName, to, subject, html, attachments })
    const gmail    = await getGmailClient()
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodeForGmail(raw) } })
    return { ok: true }
  } catch (gmailErr) {
    console.error('[mail] Gmail failed, trying SMTP:', gmailErr)
    return sendEmail({ to, subject, html })
  }
}

// שליפת קובץ מ-URL והמרתו לצרופה (base64), עם timeout. מחזיר null אם נכשל.
export async function urlToAttachment(url: string, filename: string): Promise<{ filename: string; mimeType: string; contentB64: string } | null> {
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
