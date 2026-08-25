import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { deliverMail, urlToAttachment, type MailAttachment } from '@/lib/sendMail'
import { departmentByEmail, departmentByEmailAsync, BRAND_NAME } from '@/lib/departments'
import { sendAutoReply } from '@/lib/autoReplySender'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { handleEmailRequest, isRequestSubject, isRequestMailFor, effectiveRequestSubject } from '@/lib/emailRequestIntake'
import { resolveMailbox } from '@/lib/mailRouting'
import { verifySvixSignature, hasSvixHeaders, safeEqual } from '@/lib/svix'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// העברת עותק של מייל נכנס ל-Gmail (כדי שאותו מייל יופיע גם במערכת וגם בגוגל).
// יעדי ההעברה מוגדרים ב-app_settings תחת המפתח 'mail_forward':
//   { "global": "x@gmail.com" }                 → כל הדואר הנכנס
//   { "main": "a@gmail.com", "inbox8": "b@..." } → לפי תיבה (DepartmentKey), עם נפילה ל-global
async function maybeForwardToGmail(admin: SupabaseClient, msg: {
  fromEmail: string; fromName: string | null; toEmail: string; subject: string
  html: string | null; plain: string | null
  attachments: { filename: string; mimeType: string; url?: string }[]
}) {
  // הגנות לולאה: לא מעבירים דואר פנימי/אוטומטי
  const from = (msg.fromEmail || '').toLowerCase()
  if (!from || from.endsWith('@chasamsofer.info')) return
  if (/(^|[._-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce|bounces)/i.test(from)) return

  // יעד ההעברה לפי הגדרות
  const { data: setting } = await admin.from('app_settings').select('value').eq('key', 'mail_forward').maybeSingle()
  let map: Record<string, string> = {}
  try { map = setting?.value ? JSON.parse(setting.value as string) : {} } catch { return }
  const depKey = departmentByEmail(msg.toEmail)?.key
  const target = (depKey && map[depKey]) || map.global
  if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return
  if (target.toLowerCase() === from) return  // לא מעבירים בחזרה לשולח

  // 🔴 כתובת מציין-מקום שנשארה בהגדרות.
  //
  // ⚠️ קרה בפועל: 'YOUR_EMAIL@gmail.com' נשארה ב-mail_forward מהתקנה,
  // וכל מייל נכנס נשלח אליה, נכשל, והחזיר Delivery Status Notification
  // לתיבה. עשרות הודעות כשל ביום שהסתירו דואר אמיתי.
  //
  // ⚠️ נבדק כאן ולא רק בשמירת ההגדרות: הערך כבר יושב במסד אצל מי
  // שהתקין, ותיקון בטופס לבדו לא היה מנקה אותו.
  if (/^(your_?email|example|test|changeme|placeholder)@/i.test(target)) {
    console.warn(`[mail-forward] 🔴 כתובת מציין-מקום בהגדרות — ההעברה מדולגת: ${target}`)
    return
  }

  // צרופות — מצרפים מחדש מתוך האחסון (best-effort)
  const atts: MailAttachment[] = []
  for (const a of msg.attachments) {
    if (!a.url) continue
    const built = await urlToAttachment(a.url, a.filename)
    if (built) atts.push(built)
  }

  const origin = msg.fromName ? `${msg.fromName} &lt;${msg.fromEmail}&gt;` : msg.fromEmail
  const bodyHtml = (msg.html && msg.html.trim())
    ? msg.html
    : `<pre style="white-space:pre-wrap;font-family:inherit;">${(msg.plain ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
  const html =
    `<div style="direction:rtl;text-align:right;font-family:'Heebo',Arial,sans-serif;">` +
    `<div style="font-size:12px;color:#94a3b8;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:10px;">` +
    `התקבל ב-${msg.toEmail} · מאת: ${origin}</div>${bodyHtml}</div>`

  // נשלח מכתובת התיבה (כדי ש-DKIM יתאים), עם reply-to לשולח המקורי
  await deliverMail(target, msg.subject || '(ללא נושא)', html, atts.length ? atts : undefined, {
    fromName: `${BRAND_NAME} · התקבל ב-${msg.toEmail}`,
    fromEmail: msg.toEmail,
    replyTo: msg.fromEmail,
    skipLog: true,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// המענים האוטומטיים המקודדים-קשיח שהיו כאן (yerid, inbox8, gemach, igud) אוחדו
// למנגנון אחד מונחה-הגדרות: lib/autoReplyConfig.ts (הנוסחים) + lib/autoReplySender.ts
// (השליחה). הנוסחים שרצו כאן נשמרו כברירות המחדל שם, ונערכים במסך ההגדרות.
//
// ⚠️ התיבות הן נקודות כניסה, לא כלי עבודה: המענה מאשר קבלה ומפנה לאגף הנכון.
// מענה igud שהחזיר פרטים אישיים וקישורי הגשה חתומים הוסר בכוונה — ואיתו נעלם
// גם הצורך בשער הבעלות, שכן מייל שאינו מכיל נתונים אישיים אינו יכול לדלוף.
// ─────────────────────────────────────────────────────────────────────────────

// פענוח MIME encoded-words בכותרות (Subject וכו') — =?charset?B?base64?= / =?charset?Q?quoted?=.
// בלי זה נושא בעברית מקודד לא מזוהה כבקשה ("בקשת לידה") והבקשה לא נקלטת.
function decodeMimeWords(input: string): string {
  const s = String(input || '')
  if (!s.includes('=?')) return s
  // מאחדים encoded-words צמודים (מופרדים ברווח/שורה) לפי תקן RFC 2047
  return s
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, _charset: string, enc: string, text: string) => {
      try {
        if (enc.toUpperCase() === 'B') return Buffer.from(text, 'base64').toString('utf8')
        // Q-encoding: _ → רווח, =XX → בייט
        const cleaned = text.replace(/_/g, ' ')
        const bytes: number[] = []
        for (let i = 0; i < cleaned.length; i++) {
          const c = cleaned[i]
          if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))) { bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16)); i += 2 }
          else bytes.push(cleaned.charCodeAt(i) & 0xff)
        }
        return Buffer.from(bytes).toString('utf8')
      } catch { return text }
    })
}

// המרת HTML לטקסט תוך שמירת שבירות שורה — נדרש לפרסור בקשות שמגיעות כ-HTML בלבד.
// (פרסור הבקשה סורק שורה-אחר-שורה; strip נאיבי של תגיות היה מוחק את כל שבירות השורה.)
function htmlToPlainText(html: string): string {
  return String(html || '')
    .replace(/\r\n?/g, '\n')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|li|h[1-6]|table|ul|ol|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// פירוק שדה "שם <כתובת>" לשם וכתובת
function parseAddress(raw: string): { name: string | null; email: string } {
  const s = String(raw ?? '').trim()
  const m = s.match(/^(.*?)\s*<([^>]+)>$/)
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim() || null, email: m[2].trim().toLowerCase() }
  return { name: null, email: s.toLowerCase() }
}

// קריאת ערך כותרת (case-insensitive) — תומך במערך [{name,value}] או באובייקט {name: value}
function getHeader(headers: unknown, name: string): string {
  const target = name.toLowerCase()
  if (Array.isArray(headers)) {
    const found = headers.find((h: { name?: string }) => String(h?.name ?? '').toLowerCase() === target)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return found ? String((found as any).value ?? '') : ''
  }
  if (headers && typeof headers === 'object') {
    const key = Object.keys(headers as Record<string, unknown>).find(k => k.toLowerCase() === target)
    return key ? String((headers as Record<string, unknown>)[key] ?? '') : ''
  }
  return ''
}

// חילוץ כל הכתובות מתוך ערך כותרת (To/Cc יכולים להכיל כמה נמענים מופרדים בפסיק)
function extractEmails(raw: string): string[] {
  return String(raw ?? '')
    .split(',')
    .map(s => parseAddress(s).email)
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
}

// פענוח חלק MIME לפי Content-Transfer-Encoding (base64 / quoted-printable)
function decodeMimePart(content: string, encoding: string): string {
  const enc = (encoding || '').toLowerCase()
  try {
    if (enc.includes('base64')) return Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf8')
    if (enc.includes('quoted-printable')) {
      // פענוח נכון של UTF-8 (עברית): אוספים בייטים ואז מפענחים כ-UTF-8, ולא תו-תו
      const cleaned = content.replace(/=\r?\n/g, '')
      const bytes: number[] = []
      for (let i = 0; i < cleaned.length; i++) {
        const c = cleaned[i]
        if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))) {
          bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16)); i += 2
        } else {
          bytes.push(cleaned.charCodeAt(i) & 0xff)
        }
      }
      return Buffer.from(bytes).toString('utf8')
    }
  } catch { /* נופלים לתוכן הגולמי */ }
  return content
}

// נפילה-לאחור: חילוץ בסיסי של חלקי text/html ו-text/plain מתוך MIME גולמי
function extractFromRawMime(raw: string): { html: string | null; text: string | null } {
  try {
    let html: string | null = null
    let text: string | null = null
    for (const part of raw.split(/\r?\n--/)) {
      const sep = part.search(/\r?\n\r?\n/)
      if (sep === -1) continue
      const head = part.slice(0, sep).toLowerCase()
      const enc = (head.match(/content-transfer-encoding:\s*([^\r\n;]+)/) || [])[1] || ''
      const content = part.slice(sep).trim()
      if (head.includes('text/html') && !html) html = decodeMimePart(content, enc)
      else if (head.includes('text/plain') && !text) text = decodeMimePart(content, enc)
    }
    return { html, text }
  } catch { return { html: null, text: null } }
}

// צילום מצב של ה-payload הנכנס לאבחון — ללא תוכן בינארי של קבצים, עם קיצור מחרוזות ארוכות.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debugSnapshot(d: any): any {
  try {
    return JSON.parse(JSON.stringify(d, (k, v) => {
      if ((k === 'content' || k === 'content_b64' || k === 'contentB64') && v) return `[binary ${String(v).length} chars]`
      if (typeof v === 'string' && v.length > 1500) return `[len ${v.length}] ${v.slice(0, 1500)}`
      return v
    }))
  } catch { return { _error: 'serialize failed' } }
}

// Webhook לקבלת מיילים נכנסים מ-Resend Inbound.
// Resend עוטף את הנתונים תחת data; תומכים גם במבנה שטוח ליתר ביטחון.
export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  // חובה לקרוא את הגוף כטקסט גולמי — אימות חתימת Svix מחושב עליו בדיוק
  // כפי שהתקבל. כל שינוי (אפילו רווח) ישבור את החתימה.
  const rawBody = await request.text()

  // ── אבטחה: נכשל-סגור, עם שתי שיטות אימות ──
  //
  // 1. חתימת Svix (המומלצת) — תקפה 5 דקות, משתנה בכל בקשה, עמידה ל-replay.
  // 2. סוד סטטי בכותרת (הישנה) — נשמרת לתאימות לאחור, כדי שהמייל הנכנס
  //    לא ייפול בין הפריסה לבין עדכון ההגדרה ב-Resend.
  //
  // ⚠️ אחרי שמוגדר RESEND_WEBHOOK_SIGNING_SECRET ואומת שהמיילים נכנסים —
  //    כדאי להסיר את RESEND_WEBHOOK_SECRET ולהישאר עם החתימה בלבד.
  const signingSecret = process.env.RESEND_WEBHOOK_SIGNING_SECRET
  const staticSecret = process.env.RESEND_WEBHOOK_SECRET

  // כשל אימות הוא הכשל המסוכן ביותר כאן: Resend מקבל 401, מפסיק לנסות,
  // והמיילים נעלמים בשקט מוחלט — בלי שום סימן במערכת. לכן כל דחייה
  // נרשמת ל-app_settings ומוצגת בכלי האבחון, עם הסיבה המדויקת.
  const denyAuth = async (reason: string) => {
    console.error('[resend-inbound] דחיית אימות:', reason)
    try {
      // לקוח משלו: admin נוצר רק בהמשך, אחרי האימות.
      const db = getAdminClient()
      if (!db) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      await db.from('app_settings').upsert({
        key: 'mail_auth_failure',
        value: JSON.stringify({
          at: new Date().toISOString(),
          reason,
          hasSigningSecret: Boolean(signingSecret),
          hasStaticSecret: Boolean(staticSecret),
          hasSvixHeaders: hasSvixHeaders(request),
        }),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
    } catch { /* אבחון בלבד — לעולם לא מפיל את הבקשה */ }
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!signingSecret && !staticSecret) {
    return await denyAuth('אין סוד אימות מוגדר כלל (fail-closed)')
  }

  let authenticated = false

  if (signingSecret && hasSvixHeaders(request)) {
    authenticated = verifySvixSignature(request, rawBody, signingSecret)
    // נפילה-לאחור לסוד הסטטי: אם סוד ה-Svix שגוי או שייך ל-webhook אחר,
    // בלי זה כל הדואר הנכנס מת בשקט עד שמישהו יבחין.
    //
    // ⚠️ הנפילה-לאחור מוותרת על ההגנה מפני replay שחתימת Svix מספקת
    // (חלון 5 דקות + חתימה משתנה). היא נשארת כרשת ביטחון תפעולית, אבל
    // ברגע שאומת שהדואר נכנס דרך חתימת Svix — יש למחוק את
    // RESEND_WEBHOOK_SECRET ואת שני הבלוקים האלה, ולהישאר עם
    // verifySvixSignature בלבד.
    if (!authenticated && staticSecret) {
      const provided = request.headers.get('x-webhook-secret')
      authenticated = Boolean(provided) && safeEqual(provided!, staticSecret)
      if (authenticated) console.warn('[resend-inbound] חתימת Svix נכשלה — אומת בסוד הסטטי. בדוק את RESEND_WEBHOOK_SIGNING_SECRET.')
    }
    if (!authenticated) return await denyAuth('חתימת Svix לא תקינה — ככל הנראה RESEND_WEBHOOK_SIGNING_SECRET שגוי')
  } else if (staticSecret) {
    const provided = request.headers.get('x-webhook-secret')
    authenticated = Boolean(provided) && safeEqual(provided!, staticSecret)
    if (!authenticated) return await denyAuth('הסוד הסטטי חסר או שגוי בבקשה')
  }

  if (!authenticated) {
    return await denyAuth('לא הצליח אף מסלול אימות')
  }

  let body: Record<string, unknown>
  try { body = JSON.parse(rawBody) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = (body.data as Record<string, unknown>) ?? body

  const from = parseAddress(data.from ?? '')
  const toRaw = Array.isArray(data.to) ? data.to[0] : data.to
  const to = parseAddress(toRaw ?? '')

  // נושא: data.subject הוא המקור הרגיל; נפילה-לאחור לכותרת Subject אם ריק.
  // פענוח MIME encoded-words (=?UTF-8?B?...?=) — קריטי! נושא בעברית מגיע לעיתים מקודד,
  // ואז זיהוי הבקשה (detectReqType שמחפש "בקשת לידה") נכשל והבקשה לא נקלטת.
  const subject = decodeMimeWords(String(data.subject ?? data.Subject ?? '').trim() || getHeader(data.headers, 'subject').trim())

  // ── זיהוי הנמען המקורי (לתמיכה ב-Dual Delivery מ-Google Workspace) ──
  // כשהדואר מגיע כעותק דרך subdomain של Resend, ה-"to" של ה-envelope הוא כתובת ה-subdomain,
  // אך הנמען האמיתי (תיבת המחלקה) נמצא בכותרות To/Cc/Delivered-To. בוחרים את הכתובת
  // שמתאימה לתיבה מוכרת במערכת; אחרת נופלים ל-to של ה-envelope (התנהגות קודמת).
  const envelopeRecipients = (Array.isArray(data.to) ? data.to : [data.to])
    .map((t: unknown) => parseAddress(String(t ?? '')).email)
    .filter(Boolean)
  // ⚠️ קריטי: Resend Inbound *לא* שולח headers ב-webhook (אין 'to'/'delivered-to'
  // בכותרות). הנמענים האמיתיים — כולל תיבת המחלקה — נמצאים ב-data.received_for
  // (רשימת ה-envelope recipients בפועל). בלי זה הכול נופל ל-to של ה-envelope
  // שהוא כתובת ה-copy של ה-subdomain (copy@in.chasamsofer.info) → הכול לוֹפֵת ל-office.
  // לכן received_for הוא מקור הנמענים הראשון בעדיפות.
  const receivedForRecipients = (Array.isArray(data.received_for) ? data.received_for : [data.received_for])
    .map((t: unknown) => parseAddress(String(t ?? '')).email)
    .filter(Boolean)
  // ⚠️ הסדר כאן קובע לאיזו תיבה המייל משויך — knownDept לוקח את ההתאמה
  // הראשונה. מייל שנשלח לתיבה 10 ובו office ב-Cc (או בשרשור תגובות) היה
  // מגיע ל-office במקום לתיבה 10. לכן: נמענים *ישירים* קודם, ו-Cc אחרון.
  const directRecipients = [
    ...receivedForRecipients,                                    // ← הנמענים האמיתיים מ-Resend (envelope)
    ...extractEmails(getHeader(data.headers, 'delivered-to')),   // הנמען בפועל — הכי אמין (אם headers כן נשלחו)
    ...extractEmails(getHeader(data.headers, 'x-original-to')),
    ...extractEmails(getHeader(data.headers, 'x-gm-original-to')),
    ...extractEmails(getHeader(data.headers, 'x-forwarded-to')),
    ...envelopeRecipients,
    ...extractEmails(getHeader(data.headers, 'to')),
  ]
  const ccRecipients = extractEmails(getHeader(data.headers, 'cc'))
  const candidates = [...directRecipients, ...ccRecipients]
  // עדיפות: (1) תיבה מוכרת במערכת; (2) כל נמען אמיתי בדומיין הארגון (כך שכתובת חדשה
  // שטרם הוגדרה כתיבה עדיין נשמרת תחת הכתובת האמיתית שלה, ולא תחת כתובת ה-copy של ה-subdomain);
  // (3) נפילה-לאחור ל-to של ה-envelope.
  // בקשה (לידה/הלוואה/סיוע) — תמיד מנותבת ל-igud, גם כשהגיעה דרך כתובת
  // ה-copy. בלי זה היא נופלת ל'משרד ראשי' ומייל הדחייה לא נשלח.
  //
  // ⚠️ *לפי הנושא בלבד* כאן, ובכוונה: הכלל הזה נועד להציל בקשה שהגיעה
  // דרך כתובת ה-copy ואיבדה את נמענה. בקשה שהוגשה לתיבת אגף (g@/y@/r@/a@)
  // כבר יודעת לאן היא שייכת, והפנייתה ל-igud הייתה מוציאה אותה מהתיבה
  // שהמזכיר של אותו אגף עוקב אחריה.
  const isRequestMail = isRequestSubject(subject)

  // 🔴 התיבות שהמנהל הוסיף — בלעדיהן הניתוב אינו מזהה אותן.
  //
  // ⚠️ מייל ל-m@chasamsofer.info לא זוהה כתיבה מוכרת, נפל לכלל
  // "הגיע דרך ה-copy" — ונענה מ-office@. הפונה שלח לתיבה אחת וקיבל
  // מענה מאחרת, עם נוסח של אגף שאין לו קשר לפנייתו.
  const customBoxEmails = await (async () => {
    try {
      const { loadCustomMailboxes } = await import('@/lib/customMailboxes')
      const { getServiceClient } = await import('@/lib/apiAuth')
      const db = getServiceClient()
      if (!db) return [] as string[]
      return (await loadCustomMailboxes(db)).map(m => m.email)
    } catch {
      // ⚠️ כשל טעינה אינו עוצר את הקליטה: המייל עדיין נשמר, רק
      // הניתוב חוזר להתנהגות הישנה.
      return [] as string[]
    }
  })()

  // כל כללי הניתוב מרוכזים ב-lib/mailRouting (ונבדקים שם).
  const resolvedToEmail = resolveMailbox({
    direct: directRecipients,
    cc: ccRecipients,
    isRequest: isRequestMail,
    envelopeTo: to.email,
    customEmails: customBoxEmails,
  })

  // 🔴 זיהוי הבקשה הסופי — לפי הנושא *או* לפי התיבה שאליה הגיעה.
  //
  // הגשה לתיבת אגף עם ת"ז בלבד בנושא היא בקשה תקפה: התיבה אומרת את הסוג.
  // ⚠️ חייב לשמש בכל החלטה על המייל הזה. אילו הקליטה הייתה מזהה בקשה
  // והמענה האוטומטי לא — הפונה היה מקבל גם אישור קליטה וגם "פנייתכם
  // התקבלה" הגנרי, שסותר אותו.
  const isRequest = isRequestMailFor(subject, resolvedToEmail)

  // ── בידוד ארגוני: קליטה רק של דואר שמופנה לדומיין של חתם סופר ──
  // אותו webhook נכנס עלול לקבל דואר ממערכות אחרות שמשתמשות באותה תשתית Resend.
  // דוחים (ACK ללא אחסון) כל מייל שאין לו אף נמען בדומיין chasamsofer.info / chasamsofer.co.il,
  // כדי שדואר של מערכות אחרות לא ידלוף לתיבות של חתם סופר.
  const isOrgAddr = (a: string) => /(@|\.)(chasamsofer\.info|chasamsofer\.co\.il)$/i.test(a)
  if (!candidates.some(isOrgAddr)) {
    console.warn('[resend-inbound] דחיית מייל זר — אין נמען בדומיין chasamsofer. נמענים:', candidates.join(',') || '(ריק)')
    return NextResponse.json({ ok: true, ignored: 'foreign-recipient' })
  }

  const admin = getAdminClient()

  const messageId = data.message_id ?? data.messageId ?? data.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

  // אבחון: שומרים צילום של ה-payload האחרון (ללא תוכן בינארי) כדי לאתר היכן נמצא גוף ההודעה
  try {
    await admin.from('app_settings').upsert({
      key: 'mail_inbound_last_payload',
      value: JSON.stringify({
        at: new Date().toISOString(),
        bodyKeys: Object.keys(body),
        dataKeys: Object.keys(data),
        snapshot: debugSnapshot(data),
      }).slice(0, 90000),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
  } catch { /* אבחון בלבד — לא חוסם את הקליטה */ }

  // ── שליפת גוף ההודעה והצרופות מ-Resend ──
  // Resend Inbound שולח ל-webhook מטא-דאטה בלבד (email_id) — ללא גוף וללא תוכן הצרופות.
  // לכן שולפים את ההודעה המלאה דרך ה-API: resend.emails.receiving.get(email_id).
  const emailId = String(data.email_id ?? data.emailId ?? data.id ?? '').trim() || null
  let fetchedHtml: string | null = null
  let fetchedText: string | null = null
  let fetchedRawUrl: string | null = null
  let fetchedAtts: { filename: string; mimeType: string; downloadUrl: string }[] = []
  // אבחון תגובת ה-API של Resend (נשמר ל-mail_inbound_last_body_diag)
  let getDebug: Record<string, unknown> = {}
  if (emailId && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      // ניסיון ראשון מיידי; אם ריק — ניסיון נוסף אחרי השהיה קצרה (Resend עשוי לאנדקס באיחור)
      let got = await resend.emails.receiving.get(emailId)
      if (!got.data?.html && !got.data?.text && !got.error) {
        await new Promise(r => setTimeout(r, 1500))
        got = await resend.emails.receiving.get(emailId)
      }
      if (got.error) console.error('[resend-inbound] receiving.get error:', got.error)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gd = got.data as any
      getDebug = {
        hasData: !!got.data,
        error: got.error ? String((got.error as { message?: string })?.message ?? JSON.stringify(got.error)) : null,
        dataKeys: got.data ? Object.keys(got.data) : [],
        htmlType: gd ? typeof gd.html : 'none',
        textType: gd ? typeof gd.text : 'none',
        hasRaw: !!gd?.raw,
        attCount: Array.isArray(gd?.attachments) ? gd.attachments.length : 0,
      }
      const e = got.data
      if (e) {
        fetchedHtml = e.html ?? null
        fetchedText = e.text ?? null
        // לעיתים (במיוחד במייל מ-Gmail/multipart) Resend אינו מפרק html/text ומספק רק MIME גולמי
        fetchedRawUrl = e.raw?.download_url ?? null
        if (Array.isArray(e.attachments) && e.attachments.length) {
          try {
            const list = await resend.emails.receiving.attachments.list({ emailId })
            fetchedAtts = (list.data?.data ?? []).map(a => ({
              filename: a.filename ?? 'attachment',
              mimeType: a.content_type ?? 'application/octet-stream',
              downloadUrl: a.download_url,
            }))
          } catch (e2) {
            console.error('[resend-inbound] attachments.list failed:', e2 instanceof Error ? e2.message : String(e2))
          }
        }
      }
    } catch (err) {
      console.error('[resend-inbound] receiving.get threw:', err instanceof Error ? err.message : String(err))
      getDebug = { ...getDebug, threw: err instanceof Error ? err.message : String(err) }
    }
  }

  // attachments: העלאת התוכן הבינארי ל-Supabase storage כדי שיהיה ניתן לצפות/להוריד.
  // מקור התוכן: base64 בשדה content (ספקים אחרים) או download_url שנשלף מ-Resend.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawAttachments: any[] = Array.isArray(data.attachments) ? data.attachments : []
  const attachments: { filename: string; mimeType: string; size: number; url?: string }[] = []
  const attCount = Math.max(rawAttachments.length, fetchedAtts.length)
  for (let i = 0; i < attCount; i++) {
    const a = rawAttachments[i] ?? {}
    const fetched = fetchedAtts[i]
    const filename = String(fetched?.filename ?? a.filename ?? a.name ?? `attachment-${i + 1}`)
    const mimeType = String(fetched?.mimeType ?? a.content_type ?? a.contentType ?? a.mimeType ?? 'application/octet-stream')
    const b64 = a.content ?? a.content_b64 ?? a.contentB64 ?? a.data ?? null
    let url: string | undefined
    let size = typeof a.size === 'number' ? a.size : 0
    let buffer: Buffer | null = null
    if (b64) {
      try { buffer = Buffer.from(String(b64), 'base64') } catch { /* תוכן לא תקין */ }
    } else if (fetched?.downloadUrl) {
      try {
        const r = await fetch(fetched.downloadUrl)
        if (r.ok) buffer = Buffer.from(await r.arrayBuffer())
        else console.error('[resend-inbound] attachment download status:', r.status)
      } catch (e) {
        console.error('[resend-inbound] attachment download failed:', e instanceof Error ? e.message : String(e))
      }
    }
    if (buffer) {
      try {
        size = buffer.length
        const safe = filename.replace(/[^\w.\-]+/g, '_')
        const path = `mail/${String(messageId).replace(/[^\w.\-]+/g, '_')}/${i}_${safe}`
        const { error: upErr } = await admin.storage.from('documents').upload(path, buffer, { contentType: mimeType, upsert: true })
        if (!upErr) {
          url = admin.storage.from('documents').getPublicUrl(path).data.publicUrl
        } else {
          console.error('[resend-inbound] attachment upload error:', upErr.message)
        }
      } catch (e) {
        console.error('[resend-inbound] attachment process error:', e instanceof Error ? e.message : String(e))
      }
    }
    attachments.push({ filename, mimeType, size, url })
  }
  // חילוץ גוף ההודעה — תומך בשמות שדה שונים של ספקי Inbound (Resend/Mailgun/SendGrid/Postmark)
  const pickStr = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = (data as Record<string, unknown>)[k]
      if (typeof v === 'string' && v.trim()) return v
    }
    return null
  }
  // חיפוש רקורסיבי של גוף ההודעה בכל מבנה ה-payload (לכיסוי מבנים מקוננים של ספקים שונים)
  const deepFindString = (obj: unknown, keyRe: RegExp, depth = 0): string | null => {
    if (!obj || depth > 5) return null
    if (Array.isArray(obj)) {
      for (const it of obj) { const r = deepFindString(it, keyRe, depth + 1); if (r) return r }
      return null
    }
    if (typeof obj === 'object') {
      const entries = Object.entries(obj as Record<string, unknown>)
      // קודם בדיקת מפתחות תואמים ברמה הנוכחית
      for (const [k, v] of entries) {
        if (keyRe.test(k) && typeof v === 'string' && v.trim()) return v
      }
      // ואז ירידה לעומק
      for (const [, v] of entries) {
        const r = deepFindString(v, keyRe, depth + 1); if (r) return r
      }
    }
    return null
  }
  // עדיפות: גוף שנשלף מ-Resend (receiving.get) → שדות גוף ב-payload → MIME גולמי → חיפוש רקורסיבי
  let html = (fetchedHtml && fetchedHtml.trim() ? fetchedHtml : null)
    ?? pickStr('html', 'body_html', 'body-html', 'bodyHtml', 'stripped-html', 'HtmlBody', 'Html')
  let plain = (fetchedText && fetchedText.trim() ? fetchedText : null)
    ?? pickStr('text', 'plain_text', 'plainText', 'body_plain', 'body-plain', 'bodyPlain', 'stripped-text', 'TextBody', 'Text')
  // אם Resend לא פירק את הגוף אך סיפק MIME גולמי (קישור הורדה) — שולפים ומפרקים בעצמנו.
  // זהו המקרה הנפוץ במייל מ-Gmail (multipart/alternative) שהגיע דרך משלוח כפול.
  if ((!html || !html.trim()) && (!plain || !plain.trim()) && fetchedRawUrl) {
    try {
      const r = await fetch(fetchedRawUrl)
      if (r.ok) {
        const rawMime = await r.text()
        const ex = extractFromRawMime(rawMime)
        if (ex.html) html = ex.html
        if (ex.text) plain = ex.text
      } else {
        console.error('[resend-inbound] raw MIME download status:', r.status)
      }
    } catch (e) {
      console.error('[resend-inbound] raw MIME fetch failed:', e instanceof Error ? e.message : String(e))
    }
  }
  // אם אין גוף מפורק אך יש MIME גולמי בתוך ה-payload — מחלצים ממנו
  if (!html && !plain) {
    const raw = pickStr('raw', 'email', 'message', 'mime', 'body', 'rawEmail', 'raw_email')
      ?? deepFindString(data, /^(raw|mime|rawEmail|raw_email)$/i)
    if (raw) { const ex = extractFromRawMime(raw); html = ex.html; plain = ex.text }
  }
  // נפילה-לאחור אחרונה: חיפוש רקורסיבי של שדות גוף בכל מבנה ה-payload
  if (!html) html = deepFindString(data, /^(html|body[_-]?html|htmlbody)$/i)
  if (!plain) plain = deepFindString(data, /^(text|plain|plain[_-]?text|body[_-]?text|body[_-]?plain|textbody)$/i)
  if (!html && !plain) {
    console.warn('[resend-inbound] empty body for message', messageId, '— payload keys:', Object.keys(data).join(','))
  }

  // אבחון מקור הגוף — מאיפה הגיע (Resend html/text / raw MIME) ומה האורך הסופי
  try {
    await admin.from('app_settings').upsert({
      key: 'mail_inbound_last_body_diag',
      value: JSON.stringify({
        at: new Date().toISOString(), emailId,
        fetchedHtmlLen: (fetchedHtml ?? '').length, fetchedTextLen: (fetchedText ?? '').length,
        hadRawUrl: !!fetchedRawUrl, finalHtmlLen: (html ?? '').length, finalTextLen: (plain ?? '').length,
        attachments: attachments.length,
        getDebug,
      }),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
  } catch { /* אבחון בלבד */ }

  // ── תגובה לניוזלטר? ──
  // הכתובת office+c<8 תווים>@... נושאת את תחילת מזהה הקמפיין.
  // מאתרים את הקמפיין ומקשרים אליו את התגובה.
  let campaignId: string | null = null
  try {
    const m = candidates
      .map(a => String(a).match(/\+c([a-f0-9]{8})@/i))
      .find(Boolean)
    if (m) {
      const prefix = m[1].toLowerCase()
      const { data: cs } = await admin.from('campaigns').select('id').limit(500)
      campaignId = (cs ?? [])
        .map(c => String(c.id))
        .find(id => id.replace(/-/g, '').slice(0, 8) === prefix) ?? null
      if (campaignId) console.log(`[resend-inbound] תגובה לקמפיין ${campaignId}`)
    }
  } catch (e) {
    console.error('[resend-inbound] זיהוי קמפיין נכשל:', e)
  }

  // ── האם המייל הוא *תשובה* למייל שאנחנו שלחנו? ──
  //
  // קריטי לשני דברים:
  //   1. תשובה לעולם אינה בקשה חדשה. מייל הבירור נשלח עם נושא שמכיל
  //      "הלוואה", ולכן detectReqType זיהה את התשובה כבקשה ושלח מייל דחייה.
  //   2. אין לענות אוטומטית על תשובה. המשתמש ענה לנו — ואז קיבל בחזרה
  //      "המערכת בהרצה" או מענה גנרי אחר, וזה נראה שבור.
  //
  // הזיהוי: כותרות השרשור (In-Reply-To / References) קיימות רק בתשובה.
  // זו הדרך היחידה שאינה תלויה בניסוח הנושא.
  // מייל שהוא תשובה לבירור — מזוהה גם לפי הנושא, כרשת ביטחון אם הטוקן אבד.
  const looksLikeLoanInquiry = /הודעה מגמ|בקשת ההלוואה/.test(subject)

  const isReplyToUs = Boolean(
    getHeader(data.headers, 'in-reply-to').trim() ||
    getHeader(data.headers, 'references').trim()
  )

  // אבחון: כל מייל שנכנס עם plus-address נרשם, כדי לדעת אם הוא הגיע בכלל.
  // בלי זה אי אפשר להבחין בין "Resend לא ניתב אותו" לבין "הקוד לא תפס אותו".
  // בלי עוגן ^ — Resend מעביר נמענים בפורמטים שונים, ועוגן היה גורם לאבחון
  // להראות "לא הגיע" גם כשהמייל דווקא הגיע.
  if (candidates.some(a => /\+[a-z][A-Za-z0-9_-]{6,}@/i.test(String(a ?? '')))) {
    try {
      await admin.from('app_settings').upsert({
        key: 'plus_address_debug',
        value: JSON.stringify({
          at: new Date().toISOString(),
          from: from.email,
          candidates,
          isReplyToUs,
          subject,
        }),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
    } catch { /* אבחון בלבד */ }
  }

  // ── תשובת המבקש לבירור הלוואה (office+l<token>@) ──
  //
  // ⚠️ חייב לרוץ *לפני* השמירה ולפני זיהוי הבקשות, משתי סיבות:
  //   1. הנושא הוא "בנוגע לבקשת ההלוואה", ו-detectReqType מחפש את המילה
  //      "הלוואה" — כלומר המערכת זיהתה את המייל של עצמה כבקשה חדשה, ושלחה
  //      למשתמש מייל דחייה ("לא צוינה תעודת זהות בשורת הנושא").
  //   2. התשובה שייכת לצ'אט של ההלוואה, לא לדואר הנכנס. שמירתה שם רק
  //      מציפה את התיבה בהודעות שכבר מוצגות במקום הנכון.
  {
    // ⚠️ הרג'קס זהה לזה של מכתבי הברכה (lib/inboundGratitude), שעובד
    // בפרודקשן. הגרסה הקודמת דרשה שהכתובת *תתחיל* ב-"office+l" (עוגן ^),
    // וזה נכשל: Resend מעביר את הנמענים בפורמט "Name <addr@x>" או עם
    // רווחים, ואז העוגן לא תואם. מחפשים את +l בכל מקום במחרוזת.
    // ⚠️ candidates לבדו לא הספיק: הוא נבנה מכתובות *מנורמלות*, ו-Resend
    // מעביר את הנמען בפורמטים שונים. לכן סורקים גם את גוף ה-payload הגולמי
    // ואת הכותרות — הטוקן חייב להופיע באחד מהם, אחרת התשובה אבודה.
    const rawHaystack = [
      ...candidates,
      String(data.to ?? ''),
      getHeader(data.headers, 'to'),
      getHeader(data.headers, 'delivered-to'),
      getHeader(data.headers, 'x-original-to'),
      // מוצא-אחרון: כל ה-payload. יקר, אבל רץ רק כשיש חשד לתשובת בירור.
      JSON.stringify(data.headers ?? {}),
    ].join(' ')

    const loanTok = rawHaystack.match(/\+l([A-Za-z0-9_-]{8,})@/i)?.[1]

    // בירור יולדות — אותו מנגנון בדיוק, עם קידומת m. ראו lib/maternityInquiry.
    const maternityTok = rawHaystack.match(/\+m([A-Za-z0-9_-]{8,})@/i)?.[1]
    if (maternityTok) {
      try {
        const { verifyReplyToken } = await import('@/lib/publicToken')
        const aidId = await verifyReplyToken(admin, maternityTok, 'm')
        if (aidId) {
          const { handleMaternityInquiryReply } = await import('@/lib/maternityInquiry')
          const { stripQuotedReply } = await import('@/lib/surveyParse')
          const raw = stripQuotedReply(
            (plain && plain.trim()) ? plain : htmlToPlainText(html ?? ''),
          )
          const ok = await handleMaternityInquiryReply(admin, aidId, raw, {
            messageId: getHeader(data.headers, 'message-id').trim() || undefined,
            references: (getHeader(data.headers, 'references').trim()
              || getHeader(data.headers, 'in-reply-to').trim()) || undefined,
            senderName: from.name || from.email || null,
          })
          // ⚠️ יציאה מוקדמת רק בהצלחה: כשל בקליטה חייב להמשיך לנתיבי
          // הקליטה האחרים, אחרת המייל נבלע ואיש לא רואה אותו.
          if (ok) return NextResponse.json({ ok: true, handled: 'maternity_inquiry' })
        }
      } catch (e) {
        console.error('[inbound] קליטת בירור יולדת נכשלה:', e)
      }
    }

    // אבחון: נרשם תמיד כשהמייל נראה כתשובת בירור, גם אם הטוקן לא נמצא.
    // בלי זה אי אפשר לדעת למה הקליטה נכשלה.
    if (looksLikeLoanInquiry || loanTok) {
      try {
        await admin.from('app_settings').upsert({
          key: 'loan_inquiry_debug',
          value: JSON.stringify({
            at: new Date().toISOString(),
            from: from.email,
            subject,
            tokenFound: loanTok ?? null,
            candidates,
            rawTo: String(data.to ?? ''),
            headerTo: getHeader(data.headers, 'to'),
            deliveredTo: getHeader(data.headers, 'delivered-to'),
          }),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })
      } catch { /* אבחון בלבד */ }
    }

    if (loanTok || looksLikeLoanInquiry) {
      try {
        const { handleLoanInquiryReply, findLoanByApplicantEmail } =
          await import('@/lib/loanInquiry')
        const { stripQuotedReply } = await import('@/lib/surveyParse')
        const raw = stripQuotedReply(
          (plain && plain.trim()) ? plain : htmlToPlainText(html ?? ''),
        )

        // מזהי השרשור מכותרות המייל הנכנס — לשרשור הודעות ההמשך שלנו לאותה שיחה.
        const threadMeta = {
          messageId: getHeader(data.headers, 'message-id').trim() || undefined,
          references: (getHeader(data.headers, 'references').trim()
            || getHeader(data.headers, 'in-reply-to').trim()) || undefined,
        }

        // ⚠️ צרופות התשובה נוספות למסמכי ההלוואה עם תווית "הושלם בתהליך
        // הבירור" — אחרת המסמך שהתבקש נשאר בשרשור ואיש לא רואה אותו.
        const inqDocs = attachments
          .filter(a => a.url)
          .map((a, i) => ({ url: a.url as string, name: a.filename || `מסמך ${i + 1}` }))

        // מסלול 1 — הטוקן נמצא (עובד כשהמייל מגיע ישירות ל-Resend)
        if (loanTok && await handleLoanInquiryReply(admin, loanTok, raw, false, threadMeta, inqDocs)) {
          return NextResponse.json({ ok: true, routed: 'loan_inquiry' })
        }

        // מסלול 2 — זיהוי לפי השולח.
        //
        // ⚠️ נדרש כי Google Workspace עושה dual-delivery: המייל מגיע ל-Resend
        // דרך copy@in.chasamsofer.info, וה-To המקורי (office+l<token>@) נאכל
        // בדרך. האבחון הראה candidates: ["copy@in..."] בלבד — כלומר הטוקן
        // פיזית לא מגיע אלינו, ואי אפשר להסתמך עליו.
        if (looksLikeLoanInquiry) {
          const loanId = await findLoanByApplicantEmail(admin, from.email)
          if (loanId && await handleLoanInquiryReply(admin, loanId, raw, true, threadMeta, inqDocs)) {
            return NextResponse.json({ ok: true, routed: 'loan_inquiry_by_sender' })
          }
          console.error('[resend-inbound] תשובת בירור — לא נמצאה בקשה תואמת:', from.email)
        }
      } catch (e) {
        console.error('[resend-inbound] קליטת תשובת בירור נכשלה:', e)
      }
    }
  }

  // ⚠️ שומרים את מפתח המחלקה (department) לצד to_email — קודם לא נשמר כלל
  // (ריק בכל השורות), מה שהשפיע על סינון ההרשאות (canAccessInboundMail בודק
  // department או to_email). נגזר מכתובת הנמען שנפתרה.
  // ⚠️ הגרסה האסינכרונית: היא מכירה גם תיבות שנוספו מהממשק. הסינכרונית
  // רואה רק את המחלקות הקבועות בקוד, ולכן מייל לתיבה חדשה לא היה משויך
  // אליה — ולא היה מקבל מענה אוטומטי.
  const resolvedDept = (await departmentByEmailAsync(admin, resolvedToEmail))?.key ?? null
  const { data: insertedRows, error } = await admin.from('inbound_emails').upsert({
    message_id: messageId,
    from_email: from.email,
    from_name: from.name,
    to_email: resolvedToEmail,
    department: resolvedDept,
    subject,
    html: html ?? null,
    plain_text: plain ?? null,
    headers: data.headers ?? null,
    attachments,
    is_read: false,
    // תשובת בירור שהזיהוי שלה נכשל — לא מציפים בה את הדואר הנכנס; היא
    // נכנסת תחת תווית "צ'אט", שם אפשר לטפל בה ידנית.
    is_chat: looksLikeLoanInquiry,
    ...(campaignId ? { campaign_id: campaignId } : {}),
  }, { onConflict: 'message_id', ignoreDuplicates: true }).select('id')

  if (error) {
    console.error('[resend-inbound] DB error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // העברת עותק ל-Gmail רק עבור מייל חדש (לא בכפילות/ניסיון חוזר של ה-webhook)
  // ── מענה למכתב ברכה / משוב בית החלמה (plus-addressing) ──
  //
  // ⚠️ חייב לרוץ מחוץ ל-if (isNew): Resend שולח את ה-webhook יותר מפעם אחת
  // (retry על timeout, ו-dual-delivery). בריצה השנייה ה-upsert מדלג בגלל
  // ignoreDuplicates, isNew הופך ל-false, וכל הבלוק היה מדולג — כולל
  // ניתוב הברכה. זה גרם למכתבים שנשלחו במייל לא להיקלט.
  //
  // בטוח להריץ פעמיים: השמירה היא upsert על maternity_aid_id.
  {
    const replyBody = (plain && plain.trim()) ? plain : htmlToPlainText(html ?? '')
    try {
      const {
        isGratitudeOrFeedbackReply, handleGratitudeReply, handleFeedbackReply,
        looksLikeFeedbackReply, looksLikeGratitudeReply, findAidBySenderEmail,
      } = await import('@/lib/inboundGratitude')

      const gctx = { recipients: candidates, body: replyBody, attachments }

      // מסלול 1 — הטוקן הגיע (עובד כשהמייל מגיע ישירות ל-Resend).
      if (isGratitudeOrFeedbackReply(candidates)) {
        if (await handleGratitudeReply(admin, gctx)) {
          return NextResponse.json({ ok: true, routed: 'gratitude' })
        }
        if (await handleFeedbackReply(admin, gctx)) {
          return NextResponse.json({ ok: true, routed: 'feedback' })
        }
        console.warn('[resend-inbound] זוהה plus-address אך הקליטה לא הצליחה')
      }

      // ── החזרת טופס אישור רב חתום ──
      //
      // 🔴 שלוש שכבות זיהוי (ראה lib/rabbiFormReturn.ts): כותרות שרשור,
      // קוד בנושא, וכתובת השולח. שכבה אחת לא הספיקה — Google Workspace
      // עושה dual-delivery ו"אוכל" כותרות, וכך בדיוק אבדו משובי בתי
      // ההחלמה. הקוד גלוי בנושא ולכן שורד גם כשהכותרות לא.
      {
        const { looksLikeRabbiFormReturn, findLoanForReturnedForm } =
          await import('@/lib/rabbiFormReturn')

        if (looksLikeRabbiFormReturn(subject)) {
          const doc = attachments.find(a =>
            a.url && /pdf|image\//i.test(a.mimeType ?? ''))

          if (!doc?.url) {
            // ⚠️ נרשם כשגיאה: המבקש השיב, אבל בלי קובץ — הבקשה תקועה
            // והוא אינו יודע. זה חייב להיות נראה בלוגים.
            console.error(`[resend-inbound] 🔴 החזרת טופס אישור רב בלי קובץ מצורף — ${from.email}`)
          } else {
            const match = await findLoanForReturnedForm(admin, from.email, subject)
            if (match) {
              const { error: upErr } = await admin
                .from('loans')
                .update({
                  rabbi_form_url: doc.url,
                  rabbi_form_uploaded_at: new Date().toISOString(),
                  status: 'pending',
                })
                .eq('id', match.loanId)
                .eq('status', 'awaiting_rabbi_form')

              if (!upErr) {
                console.log(`[resend-inbound] טופס אישור רב נקלט (${match.matchedBy}) → ${match.loanId}`)
                return NextResponse.json({ ok: true, routed: 'rabbi_form' })
              }
              console.error('[resend-inbound] שמירת טופס אישור רב נכשלה:', upErr.message)
            } else {
              console.error(
                `[resend-inbound] 🔴 טופס אישור רב חזר אך לא שויך — ${from.email}, נושא: ${subject}`,
              )
            }
          }
        }
      }

      // 🔴 מסלול 2 — זיהוי לפי נושא + שולחת, כשהטוקן אבד.
      //
      // ⚠️ Google Workspace עושה dual-delivery ו"אוכל" את office+s<token>@,
      // ולכן משובים שנשלחו במייל לא נקלטו כלל — הקוד חזר false בשקט.
      // זו אותה תקלה שכבר תוקנה לתשובות בירור הלוואה; המסלול הזה פשוט
      // לא קיבל את הנפילה-לאחור.
      const isFeedback = looksLikeFeedbackReply(subject)
      const isGratitude = looksLikeGratitudeReply(subject)

      if (isFeedback || isGratitude) {
        const table = isFeedback ? 'survey_responses' : 'gratitude_letters'
        const match = await findAidBySenderEmail(admin, from.email, table)

        if (match) {
          if (isFeedback && await handleFeedbackReply(admin, gctx, match.aidId)) {
            console.log('[resend-inbound] משוב נקלט לפי זיהוי השולחת')
            return NextResponse.json({ ok: true, routed: 'feedback_by_sender' })
          }
          if (isGratitude && await handleGratitudeReply(admin, gctx, match.aidId)) {
            console.log('[resend-inbound] מכתב ברכה נקלט לפי זיהוי השולחת')
            return NextResponse.json({ ok: true, routed: 'gratitude_by_sender' })
          }
        }
        // ⚠️ נרשם כשגיאה ולא כאזהרה: זו תשובה של משתמשת אמיתית שאבדה,
        // וצריך שהיא תהיה נראית בלוגים ולא תיבלע בשקט כמו קודם.
        console.error(
          `[resend-inbound] 🔴 תשובת ${isFeedback ? 'משוב' : 'ברכה'} לא נקלטה — ` +
          `שולחת: ${from.email}, שיוך שנמצא: ${match?.aidId ?? 'אין'}`,
        )
      }
    } catch (e) {
      console.error('[resend-inbound] gratitude/feedback routing failed:', e)
    }
  }

  // מחושבים תמיד — קליטת הבקשה רצה גם ב-retry, כשה-isNew הוא false
  // ⚠️ resolvedDept כבר חושב אסינכרונית למעלה וכולל תיבות מותאמות.
  const isIgud = resolvedDept === 'igud'
  const bodyText = (plain && plain.trim()) ? plain : htmlToPlainText(html ?? '')

  // נושא אפקטיבי: אם הנושא לא זוהה כבקשה — נפילה-לאחור לזיהוי לפי גוף הטופס.
  // (מגן על נושא פגום/מקודד, כשהגוף הוא טופס בקשה תקין.)
  //
  // ⚠️ קודם לכל — השלמה לפי התיבה: הגשה ל-g@/y@/r@/a@ עם ת"ז בלבד מקבלת
  // כאן נושא מלא בפורמט שהקליטה מצפה לו, שכן handleEmailRequest נשען על
  // detectReqType(subject) כדי לדעת את הסוג.
  let requestSubject = effectiveRequestSubject(subject, resolvedToEmail)
  if (!isRequestSubject(requestSubject)) {
    const idInBody = (bodyText.match(/מזה[הא][:\s]*?(\d{9})/) || bodyText.match(/ת\.?\s*ז[:\s.]*?(\d{9})/))?.[1] ?? null
    let bodyType: string | null = null
    if (/בית\s*החלמה/.test(bodyText) && /תאריך\s*לידה/.test(bodyText)) {
      bodyType = /לידה\s*שקטה/.test(bodyText) ? 'בקשת לידה שקטה' : 'בקשת לידה'
    } else if (/מטרת\s*ההלוואה|מספר\s*תשלומים|סכום\s*ההלוואה/.test(bodyText)) {
      bodyType = 'בקשת הלוואה'
    } else if (/סיבת\s*הבקשה/.test(bodyText)) {
      bodyType = 'בקשת סיוע רפואי'
    }
    if (bodyType && idInBody) {
      requestSubject = `${bodyType} · ת.ז ${idInBody}`
      console.warn('[resend-inbound] נושא לא זוהה — נפילה-לאחור לזיהוי לפי הגוף:', requestSubject)
    }
  }

  const requestBody = bodyText

  const isNew = (insertedRows?.length ?? 0) > 0
  if (isNew) {
    try {
      await maybeForwardToGmail(admin, {
        fromEmail: from.email, fromName: from.name, toEmail: resolvedToEmail, subject,
        html: html ?? null, plain: plain ?? null, attachments,
      })
    } catch (e) {
      console.error('[resend-inbound] gmail forward error:', e instanceof Error ? e.message : String(e))
    }
    // ⚠️ המענה האוטומטי אינו כאן אלא בסוף הטיפול, מחוץ ל-isNew.
    // אותה תקלה כבר תוקנה כאן פעמיים (ניתוב מכתבי הברכה, קליטת בקשות
    // במייל): מייל שכבר קיים בטבלה מדלג על הבלוק הזה, והמענה לא נשלח.
    // אבחון קליטה — שומר את הנושא והחלטת הניתוב, לאבחון כשל זיהוי בקשה.
    try {
      await admin.from('app_settings').upsert({
        key: 'mail_intake_debug',
        value: JSON.stringify({
          at: new Date().toISOString(),
          from: from.email,
          resolvedToEmail, isIgud,
          rawSubject: String(data.subject ?? data.Subject ?? ''),
          headerSubject: getHeader(data.headers, 'subject'),
          decodedSubject: subject,
          effectiveSubject: requestSubject,
          isRequestSubject: isRequestSubject(requestSubject),
          plainLen: (plain ?? '').length, htmlLen: (html ?? '').length,
        }),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
    } catch { /* אבחון בלבד */ }
  }

  // ── קליטת בקשה שהוגשה במייל (לידה / הלוואה / סיוע) ──
  //
  // ⚠️ חייב לרוץ מחוץ ל-if (isNew): Resend שולח את ה-webhook יותר מפעם אחת
  // (retry על timeout). בריצה השנייה ה-upsert מדלג, isNew הופך false, וכל
  // הבלוק היה מדולג — הבקשה לא נקלטה ומייל הדחייה עם פירוט השגיאות
  // מעולם לא נשלח.
  //
  // ⚠️ אבל isNew לבדו היה גם ההגנה מפני כפילות: Resend שולח את ה-webhook
  // יותר מפעם אחת, ובלי חסם כל ניסיון חוזר שלח מייל דחייה נוסף — משתמשים
  // קיבלו את אותו מייל שוב ושוב על בקשה ישנה. handleEmailRequest אינו מזהה
  // כפילות בעצמו. לכן נעילה מפורשת לפי message_id: הראשון שתופס אותה מטפל,
  // וכל ניסיון חוזר נדחה. ה-upsert אטומי, ולכן בטוח גם בריצה מקבילה.
  // ⚠️ חסם מוחלט: מייל שהוא *תשובה* למייל שהמערכת שלחה לעולם אינו בקשה חדשה.
  //
  // הבאג: מייל הבירור נשלח עם הנושא "בנוגע לבקשת ההלוואה". detectReqType מחפש
  // את המילה "הלוואה" — ולכן המערכת זיהתה את התשובה של המשתמש כבקשת הלוואה
  // חדשה, לא מצאה ת"ז בנושא, ושלחה לו מייל דחייה. אותו דבר יקרה לכל מייל
  // עתידי שהמערכת תשלח והנושא שלו יכיל "לידה" / "הלוואה" / "סיוע".
  //
  // הזיהוי: כותרות השרשור (In-Reply-To / References) קיימות רק בתשובה, ולא
  // במייל חדש. זו הדרך היחידה שאינה תלויה בניסוח הנושא.
  if (requestSubject && isRequestSubject(requestSubject) && !isReplyToUs) {
    // מפתח הנעילה חייב להיות יציב בין ניסיונות. messageId נופל-לאחור לערך
    // אקראי כשהכותרת חסרה — ואז הנעילה חסרת ערך. לכן במקרה כזה נועלים לפי
    // תוכן המייל (שולח + נושא), שזהה בכל ניסיון חוזר.
    const stableId = (data.message_id ?? data.messageId ?? data.id)
      ? String(messageId)
      : `${from.email}|${requestSubject}`
    const lockKey = `req_handled:${stableId}`.slice(0, 200)

    // הנעילה פגה אחרי 10 דקות. ה-retry של Resend קורה תוך שניות, אז החלון
    // הזה חוסם אותו — אבל משתמש שמתקן את הבקשה ושולח שוב (אותו נושא!) לא
    // ייחסם. בלי התפוגה, נעילת "שולח+נושא" הייתה חוסמת אותו לנצח.
    const LOCK_TTL_MS = 10 * 60 * 1000
    const now = Date.now()
    const { data: prev } = await admin
      .from('app_settings').select('value').eq('key', lockKey).maybeSingle()

    const prevAt = prev?.value ? Date.parse(String(prev.value)) : NaN
    const locked = !isNaN(prevAt) && (now - prevAt) < LOCK_TTL_MS

    if (locked) {
      console.log('[resend-inbound] המייל כבר טופל — מדלג (מניעת מייל כפול)')
    } else {
      await admin.from('app_settings').upsert(
        { key: lockKey, value: new Date(now).toISOString(), updated_at: new Date(now).toISOString() },
        { onConflict: 'key' },
      )
      try {
        await handleEmailRequest(admin, {
          fromEmail: from.email,
          subject: requestSubject,
          body: requestBody,
          attachments,
        })
      } catch (e) {
        console.error('[resend-inbound] email-request intake error:', e instanceof Error ? e.message : String(e))
        // משחררים את הנעילה כדי שניסיון חוזר של Resend יוכל לטפל בכל זאת
        await admin.from('app_settings').delete().eq('key', lockKey)
      }
    }
  }

  // ── מענה אוטומטי — מנגנון אחד לכל התיבות ──
  //
  // 🔴 רץ *מחוץ* ל-isNew. זה היה הבאג שהשתיק את המענה: Resend שולח את
  // ה-webhook יותר מפעם אחת (retry על timeout, ו-dual-delivery). בריצה
  // השנייה ה-upsert מדלג בגלל ignoreDuplicates, isNew הופך ל-false, והמענה
  // דולג — בשקט. ההודעה נקלטה בתיבה כרגיל, ולכן שום דבר לא *נראה* שבור.
  //
  // ⚠️ הכפילות נמנעת בנעילה לפי messageId ובתקרת המענים, ולא ב-isNew: הן
  // בודקות מה יצא בפועל, ולכן retry אינו מייצר מענה שני — ואילו מייל אמיתי
  // חדש כן מקבל מענה, גם אם ההודעה כבר הייתה בטבלה.
  //
  // ⚠️ אין יותר שני מענים שרצים ברצף על אותו מייל, ולכן אין יותר צורך
  // ב-autoReplyRouting: הבאג שבו הגנרי אכל את מכסת המענים של הייעודי אינו
  // יכול לחזור כשיש מנגנון אחד בלבד.
  //
  // ⚠️ לא נשלח על בקשות (מקבלות מענה ייעודי — אישור קליטה או פירוט מה חסר),
  // ולא על תשובות בשרשור שלנו או בירורי הלוואה — הפונה כבר בתוך תהליך.
  try {
    // ⚠️ isRequest ולא isRequestSubject: בקשה שהוגשה לתיבת אגף עם ת"ז בלבד
    // אינה מזוהה לפי הנושא, ובלי התיקון הזה הייתה מקבלת גם אישור קליטה
    // וגם את המענה הגנרי — שני מיילים סותרים על פנייה אחת.
    if (!isRequest && !isReplyToUs && !looksLikeLoanInquiry) {
      // 🔴 מענה אוטומטי אחד בלבד, מהתיבה שאליה הפונה שלח.
      //
      // הקוד שלח מענה מכל תיבה ברשימת נמעני ה-envelope. הנחת היסוד
      // הייתה ש-received_for מכיל רק שליחה ישירה — היא שגויה: תיבות
      // האגפים מעבירות זו לזו (igud→office וגם office→igud), וההעברה
      // מופיעה ב-envelope בדיוק כמו נמען מכוון.
      //
      // 🔴 המדידה בפרודקשן (20.08): שליחה ל-igud החזירה main+holidays,
      // ושליחה ל-office החזירה office+igud. בשני המקרים הפונה קיבל שני
      // מענים, ולפחות אחד מהם מאגף שאליו לא פנה כלל.
      //
      // אין בכותרות מה שיבדיל בין השתיים — Resend מוסר delivered-to
      // ו-x-forwarded-to ריקות (אומת מול ההודעה השמורה). לכן ההכרעה היא
      // תיבה אחת: זו ש-resolveMailbox בחר, אותה תיבה שבה ההודעה נשמרה.
      //
      // ⚠️ המחיר: שליחה מכוונת לשני אגפים תיענה מאחד בלבד. זו הכרעת
      // המשתמש (כל אחד שיעבוד בנפרד) ועדיפה על מענה מאגף שגוי.
      const targets = [resolvedToEmail]
      for (const box of targets) {
        // 🔴 Async ולא departmentByEmail הסינכרוני.
        //
        // ⚠️ הגרסה הסינכרונית מכירה רק את המחלקות הקבועות. תיבה שהמנהל
        // הוסיף (m@chasamsofer.info וכדומה) החזירה undefined, והלולאה
        // עשתה continue — כלומר המענה האוטומטי *לא נשלח בשקט*, בלי שום
        // לוג ובלי שום דרך לדעת. ההגדרות נשמרו והכל נראה תקין.
        const key = (await departmentByEmailAsync(admin, box))?.key
        if (!key) {
          console.warn('[resend-inbound] אין מחלקה מזוהה לתיבה — מענה אוטומטי מדולג:', box)
          continue
        }
        await sendAutoReply(admin, {
          fromEmail: from.email,
          department: key,
          headers: data.headers,
          messageId: String(messageId),
        })
      }
    }
  } catch (e) {
    console.error('[resend-inbound] auto-reply error:', e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json({ ok: true })
}
