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
  // מייל תפעולי חד-פעמי (קוד אימות): ללא מעקב וללא כותרות הסרה מרשימת תפוצה.
  // ⚠️ שני אלה פוגעים דווקא במייל שחייב להגיע: פיקסל המעקב וקישורי ההפניה
  // יוצאים מדומיין המעקב של Resend — שרשתות מסוננות (NetFree/רימון), שדרכן
  // גולש כל הקהל שלנו, חוסמות; ו-List-Unsubscribe הוא סימן של דיוור המוני
  // ומוריד את ציון המסירה של הודעה שאינה דיוור כלל.
  transactional?: boolean
  unsubscribeUrl?: string // קישור הסרה — מפעיל One-Click unsubscribe (חובה בדיוור המוני)
  inReplyTo?: string   // שרשור: Message-ID של ההודעה שאליה זו תשובה
  references?: string  // שרשור: שרשרת ה-Message-IDs הקודמים בשיחה (מופרדים ברווח)
  // עדיפות במסלול Gmail (ראו GMAIL ROUTING למטה):
  //   'high'   — קוד אימות. חוסם הרשמה, ולכן מקבל את מרבית המכסה היומית.
  //   'normal' — ברירת מחדל לכל מייל תפעולי אחר (אישורים, הודעות).
  //   'never'  — דיוור המוני. לעולם לא דרך Workspace.
  gmailPriority?: 'high' | 'normal' | 'never'
}

// ─── GMAIL ROUTING ──────────────────────────────────────────────────────────
// ⚠️ [תקלת מסירה 05/08/2026] Resend קיבל 100% מהשליחות בלי שגיאה אחת, אבל
// הודעות ל-@gmail.com נתקעו ב-"Sent" ולא נמסרו. ההוכחה הייתה בלוח של Resend:
// באותה שנייה בדיוק הודעות לדומיינים אחרים הגיעו ל-"Delivered". כלומר הדומיין,
// ה-DNS ו-Resend תקינים — Gmail לבדו מקצה מסירה במשורה אחרי קפיצת נפח חדה.
//
// לכן נמעני Gmail יוצאים דרך חשבון ה-Google Workspace של הארגון. זה עובד כאן
// כי הדומיין מחזיק MX של smtp.google.com, רשומת google._domainkey ו-SPF ראשי
// עם include:_spf.google.com — מייל מהחשבון עובר SPF ו-DKIM מיושרים מול Gmail.
//
// ⚠️ המסלול יכול רק להוסיף מסירות ולעולם לא לגרוע: כל כשל — תקרה, חשבון שאינו
// מחובר, שגיאת API — נופל אוטומטית ל-Resend, שהוא ההתנהגות שהייתה קודם.
//
// ⚠️ דיוור המוני לעולם אינו עובר כאן. חשבון Workspace אינו כלי דיוור, ושליחת
// ניוזלטר דרכו תמצה את המכסה ותסכן את החשבון עצמו. הזיהוי הוא לפי
// unsubscribeUrl — קישור הסרה קיים בדיוור בלבד.
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])
// תקרות רכות, מתחת לתקרת Workspace האמיתית (~2,000 ליום למשתמש).
// ⚠️ שתי מדרגות בכוונה: מייל תפעולי רגיל נעצר ב-800 כדי שתמיד תישאר מכסה
// לקודי אימות. אחרת גל של אישורי הרשמה היה מחסל את המכסה, וקוד האימות —
// היחיד שחוסם אדם מלהירשם — היה נופל חזרה למסלול התקוע.
const GMAIL_CAP_HIGH = 1500
const GMAIL_CAP_NORMAL = 800

function isGmailAddress(email: string): boolean {
  const at = email.lastIndexOf('@')
  return at >= 0 && GMAIL_DOMAINS.has(email.slice(at + 1).trim().toLowerCase())
}

// מונה יומי לפי שעון ישראל, כדי שהאיפוס יקרה בחצות המקומית ולא באמצע היום.
function gmailCounterKey(): string {
  const d = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return `gmail_daily_send:${d}`
}

// ניסיון שליחה דרך Workspace. מחזיר true רק בהצלחה מלאה; בכל מקרה אחר false,
// והקורא ממשיך ל-Resend. אינו זורק לעולם.
async function trySendViaGmail(
  to: string, subject: string, html: string, from: string, fromName: string, cap: number,
): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return false
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

    // ⚠️ אינו אטומי, ובכוונה: התקרה כאן רכה. חריגה קלה בתנאי מרוץ תיתקל
    // ממילא בתקרה האמיתית של Google ותיפול חזרה ל-Resend.
    const ck = gmailCounterKey()
    const { data } = await admin.from('app_settings').select('value').eq('key', ck).maybeSingle()
    const next = (Number(data?.value ?? 0) || 0) + 1
    if (next > cap) return false
    await admin.from('app_settings').upsert(
      { key: ck, value: String(next), updated_at: new Date().toISOString() }, { onConflict: 'key' },
    )

    // ייבוא דינמי — googleapis כבד, ואין סיבה לטעון אותו במסלול שאינו ג'ימייל.
    const { getGmailClient, sendGmailMessage } = await import('@/lib/gmail')
    const gmail = await getGmailClient()
    await sendGmailMessage(gmail, { to, subject, html, from, fromName })
    return true
  } catch (e) {
    console.error('[mail] שליחה דרך Gmail נכשלה, נופלים ל-Resend:', e)
    return false
  }
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

  // ── ניתוב Gmail (ההסבר המלא ליד GMAIL ROUTING למעלה) ──
  // דיוור המוני (unsubscribeUrl) ו-'never' לעולם אינם עוברים כאן.
  const priority = options?.gmailPriority ?? 'normal'
  if (priority !== 'never' && !options?.unsubscribeUrl && !options?.scheduledAt
      && !attachments?.length && isGmailAddress(to)) {
    const cap = priority === 'high' ? GMAIL_CAP_HIGH : GMAIL_CAP_NORMAL
    const okGmail = await trySendViaGmail(to, subject, html, fromEmail, fromName, cap)
    if (okGmail) {
      // ⚠️ אין resendId במסלול הזה, ולכן אירועי המסירה של Resend לא יגיעו
      // להודעה הזו. התיעוד ב"דואר יוצא" נשמר כדי שההודעה בכל זאת תופיע שם.
      if (!options?.skipLog) {
        await logSentEmail(to, subject, html, attachments, options, fromName, null)
      }
      return { ok: true }
    }
  }

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
  // ⚠️ מייל תפעולי (קוד אימות) יוצא *בלי* כותרות הסרה: הן מסמנות דיוור המוני,
  // וקוד חד-פעמי אינו דיוור. אין ממה להסיר את הנמען, והסימון רק מוריד את סיכויי
  // ההגעה לתיבה הראשית של הודעה שהמשתמש ממתין לה ברגע זה.
  const unsubHeaders: Record<string, string> = options?.transactional
    ? {}
    : options?.unsubscribeUrl
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
      ...({ tracking: (options?.tracking === false || options?.transactional)
        ? { open: false, click: false }
        : { open: true, click: true },
      } as Record<string, unknown>),
      // כותרות שמשפרות אמון ומסירה (פחות סיכוי לספאם בג'ימייל/אאוטלוק)
      headers: {
        ...unsubHeaders,
        'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        // שרשור מייל — In-Reply-To / References גורמים ללקוח המייל של הנמען
        // לשרשר את ההודעה תחת אותה שיחה, במקום ליצור שרשור חדש.
        ...(options?.inReplyTo ? { 'In-Reply-To': options.inReplyTo } : {}),
        ...(options?.references ? { References: options.references } : {}),
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
