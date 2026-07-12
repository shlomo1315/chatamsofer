import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { NOREPLY_FROM, BRAND_NAME, departmentByEmail } from './departments'
import { storagePath } from './docUrl'

export interface MailAttachment { filename: string; mimeType: string; contentB64: string }
export interface MailOptions {
  replyTo?: string
  fromName?: string
  fromEmail?: string   // כתובת השולח (ברירת מחדל: noreply). מחלקות שולחות מכתובתן.
  department?: string  // מחלקה לתיוג בתיבת "דואר יוצא" (ברירת מחדל: לפי כתובת השולח/תשובה)
  sentBy?: string      // מי שלח (משתמש מערכת); ריק = מייל אוטומטי
  skipLog?: boolean    // דלג על תיעוד ב-sent_emails (כשהקורא מתעד בעצמו)
  scheduledAt?: string // ISO 8601 — תזמון שליחה דרך Resend (אם מוגדר, המייל יישלח במועד זה)
  tracking?: boolean   // מעקב פתיחות/קליקים (דיוור בלבד; מיילים תפעוליים ללא מעקב)
  unsubscribeUrl?: string // קישור הסרה — מפעיל One-Click unsubscribe (חובה בדיוור המוני)
}

// תיעוד מייל יוצא ב-Supabase כדי שיופיע בתיבת "דואר יוצא" של המחלקה. לא חוסם.
// resendId — המזהה שהוחזר מ-Resend. קריטי: ה-webhook של אירועי המסירה
// (delivered/opened/clicked/bounced) מזהה מיילים אך ורק לפיו.
async function logSentEmail(
  to: string, subject: string, html: string,
  attachments: MailAttachment[] | undefined, opts: MailOptions | undefined, fromName: string,
  resendId?: string | null,
) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    const replyTo = opts?.replyTo ?? opts?.fromEmail ?? null
    const department = opts?.department
      ?? departmentByEmail(opts?.replyTo)?.key
      ?? departmentByEmail(opts?.fromEmail)?.key
      ?? 'main'
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await admin.from('sent_emails').insert({
      from_name: fromName,
      to_email: to,
      subject,
      html,
      department,
      reply_to: replyTo,
      sent_by: opts?.sentBy ?? null,
      attachments: (attachments ?? []).map(a => ({ filename: a.filename, mimeType: a.mimeType })),
      ...(resendId ? { resend_id: resendId } : {}),
      ...(opts?.scheduledAt ? { scheduled_at: opts.scheduledAt } : {}),
    })
    if (error) console.error('[mail] sent_emails log error:', error.message)
  } catch (e) {
    console.error('[mail] sent_emails log threw:', e)
  }
}

// שליחת מייל דרך Resend. ברירת המחדל לשולח היא noreply@chasamsofer.info,
// אך מיילים מחלקתיים נשלחים מכתובת המחלקה (fromEmail). תומך בצרופות.
export async function deliverMail(
  to: string,
  subject: string,
  html: string,
  attachments?: MailAttachment[],
  options?: MailOptions,
): Promise<{ ok: boolean; error?: string; id?: string }> {
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

  // כותרת הסרה מרשימת תפוצה. לדיוור המוני (ניוזלטר) מעבירים קישור One-Click —
  // דרישה של Gmail משולחים מסיביים; בלעדיה המיילים מסומנים כספאם.
  const unsubHeaders: Record<string, string> = options?.unsubscribeUrl
    ? {
        'List-Unsubscribe': `<${options.unsubscribeUrl}>, <mailto:office@chasamsofer.info?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      }
    : { 'List-Unsubscribe': '<mailto:office@chasamsofer.info?subject=unsubscribe>' }

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
      ...(options?.scheduledAt ? { scheduledAt: options.scheduledAt } : {}),
      // מעקב פתיחות/קליקים — מופעל רק כשמבקשים במפורש (דיוור).
      // מיילים תפעוליים נשארים ללא מעקב, כדי לא להוסיף פיקסל ולעטוף קישורים.
      // מעקב פתיחות/קליקים — מופעל כברירת מחדל על כל המיילים.
      //
      // ⚠️ ה-SDK של Resend (v6) לא חושף את השדה הזה בטיפוסים, אבל ה-API
      // מקבל אותו. בלעדיו Resend לא מזריק פיקסל ולא עוטף קישורים, ולכן
      // לא נשלחים אירועי email.opened / email.clicked ל-webhook.
      // (זו הייתה הסיבה ל"נפתחו 0".)
      ...({ tracking: options?.tracking === false
        ? { open: false, click: false }
        : { open: true, click: true },
      } as Record<string, unknown>),
      // כותרות שמשפרות אמון ומסירה (פחות סיכוי לספאם בג'ימייל/אאוטלוק)
      headers: {
        ...unsubHeaders,
        'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      },
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

    // מזהה ההודעה ב-Resend — בלעדיו אי אפשר לקשר אירועי מסירה/פתיחה/קליק למייל.
    const resendId = data?.id ?? null

    // תיעוד אוטומטי בתיבת "דואר יוצא" — אלא אם הקורא מתעד בעצמו
    if (!options?.skipLog) {
      await logSentEmail(to, subject, html, attachments, options, fromName, resendId)
    }
    return { ok: true, id: resendId ?? undefined }
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
    let buf: Buffer
    let mimeType: string
    const path = storagePath(url)
    // אבטחה (מניעת SSRF): מצרפים אך ורק קבצים מדלי 'documents' של Supabase.
    // כתובת חיצונית שרירותית (למשל endpoint פנימי/מטא-דאטה של הענן) נדחית — לא מבצעים
    // fetch לכתובת שסופקה ע"י המשתמש. מותר: URL של האחסון, או נתיב-אחסון יחסי (לא absolute).
    const isAbsolute = /^https?:\/\//i.test(url)
    const isStorageObject = path !== url // נמצא סמן אחסון ('/documents/' וכו')
    const key = isStorageObject ? path : url
    if ((isAbsolute && !isStorageObject) || !key || key.includes('..')) return null
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supaUrl || !supaKey) return null
    {
      // קובץ בדלי 'documents' — הורדה דרך service-role (עובד גם כשהדלי פרטי)
      const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } })
      const { data: blob } = await admin.storage.from('documents').download(key)
      if (!blob) return null
      buf = Buffer.from(await blob.arrayBuffer())
      mimeType = blob.type || 'application/octet-stream'
    }

    // ודא סיומת: אם השם כבר מסתיים בסיומת — נשאיר; אחרת נגזור מה-URL או מ-mimeType
    let safeName = filename
    if (!/\.[a-z0-9]{2,5}$/i.test(safeName)) {
      const ext = extFromUrl(url) ?? MIME_EXT[mimeType.toLowerCase()] ?? null
      if (ext) safeName = `${safeName}.${ext}`
    }

    return { filename: safeName, mimeType, contentB64: buf.toString('base64') }
  } catch { return null }
}
