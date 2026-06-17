import { Resend } from 'resend'
import { NOREPLY_FROM, BRAND_NAME } from './departments'

export interface MailAttachment { filename: string; mimeType: string; contentB64: string }
export interface MailOptions {
  replyTo?: string
  fromName?: string
  fromEmail?: string   // כתובת השולח (ברירת מחדל: noreply). מחלקות שולחות מכתובתן.
}

// שליחת מייל דרך Resend. ברירת המחדל לשולח היא noreply@chasamsofer.info,
// אך מיילים מחלקתיים נשלחים מכתובת המחלקה (fromEmail). תומך בצרופות.
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
  const fromEmail = options?.fromEmail ?? NOREPLY_FROM
  const from = `${fromName} <${fromEmail}>`

  // גרסת טקסט רגיל (multipart) — משפרת מסירה ומקטינה סיכוי לספאם
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
      ...(attachments?.length
        ? { attachments: attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.contentB64, 'base64'),
            ...(a.mimeType ? { contentType: a.mimeType } : {}),
          })) }
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

// מיפוי סוג-תוכן → סיומת קובץ, להבטחת צרופה שנפתחת אצל הנמען
const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/bmp': 'bmp',
  'image/tiff': 'tiff', 'image/svg+xml': 'svg',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

// חילוץ סיומת מתוך נתיב URL (מתעלם מ-query string)
function extFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname
    const m = path.match(/\.([a-z0-9]{2,5})$/i)
    return m ? m[1].toLowerCase() : null
  } catch {
    const m = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)
    return m ? m[1].toLowerCase() : null
  }
}

// שליפת קובץ מ-URL והמרתו לצרופה (base64), עם timeout. מחזיר null אם נכשל.
// מבטיח שלשם הקובץ יש סיומת תקינה (לפי ה-URL או סוג-התוכן) כדי שייפתח אצל הנמען.
export async function urlToAttachment(url: string, filename: string): Promise<MailAttachment | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const mimeType = (res.headers.get('content-type') || '').split(';')[0].trim() || 'application/octet-stream'

    // ודא סיומת: אם השם כבר מסתיים בסיומת — נשאיר; אחרת נגזור מה-URL או מ-mimeType
    let safeName = filename
    if (!/\.[a-z0-9]{2,5}$/i.test(safeName)) {
      const ext = extFromUrl(url) ?? MIME_EXT[mimeType.toLowerCase()] ?? null
      if (ext) safeName = `${safeName}.${ext}`
    }

    return { filename: safeName, mimeType, contentB64: buf.toString('base64') }
  } catch { return null }
}
