import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { deliverMail, urlToAttachment, type MailAttachment } from '@/lib/sendMail'
import { departmentByEmail, BRAND_NAME, mailFor } from '@/lib/departments'
import { shell, benefitsLinkEmail } from '@/lib/emailTemplates'
import { handleEmailRequest, isRequestSubject, buildDraftLinks } from '@/lib/emailRequestIntake'

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
    `<div style="direction:rtl;text-align:right;font-family:Arial,sans-serif;">` +
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

// מענה אוטומטי לפניות שמגיעות לתיבת "יריד" — "פנייתך התקבלה ותטופל בהקדם"
async function maybeAutoReplyYerid(msg: { fromEmail: string; fromName: string | null; toEmail: string; subject: string }) {
  if (departmentByEmail(msg.toEmail)?.key !== 'yerid') return
  const from = (msg.fromEmail || '').toLowerCase()
  // הגנות לולאה: לא עונים לדואר פנימי/אוטומטי/כתובת לא תקינה
  if (!from || from.endsWith('@chasamsofer.info')) return
  if (/(^|[._-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce|bounces)/i.test(from)) return
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return

  const greet = msg.fromName ? ` ${msg.fromName}` : ''
  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">אישור קבלה</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">פנייתך התקבלה</h2>
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">
      שלום${greet},<br/>
      תודה על פנייתך לאגף היריד של <strong>היכל החתם סופר</strong>. הודעתך התקבלה במערכת ותטופל בהקדם על ידי הצוות.
    </p>
    ${msg.subject ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td style="background:#f0f9ff;border-right:4px solid #0ea5e9;border-radius:0 10px 10px 0;padding:12px 16px;color:#075985;font-size:14px;">
        נושא פנייתך: <strong>${msg.subject.replace(/</g, '&lt;')}</strong>
      </td></tr></table>` : ''}
    <p style="margin:0;color:#94a3b8;font-size:13px;">זהו מענה אוטומטי — אין צורך להשיב להודעה זו.</p>`
  const html = shell({ preheader: 'פנייתך התקבלה ותטופל בהקדם', accent: '#0ea5e9', title: 'פנייתך התקבלה', subtitle: 'היכל החתם סופר · יריד', body })
  await deliverMail(from, 'פנייתך התקבלה — היכל החתם סופר · יריד', html, undefined, { ...mailFor('yerid'), skipLog: true })
}

// מענה אוטומטי לפניות שמגיעות לתיבה 8 — הודעה על הגרלת כרטיסי טיסה
async function maybeAutoReplyInbox8(msg: { fromEmail: string; fromName: string | null; toEmail: string }) {
  if (departmentByEmail(msg.toEmail)?.key !== 'inbox8') return
  const from = (msg.fromEmail || '').toLowerCase()
  // הגנות לולאה: לא עונים לדואר פנימי/אוטומטי/כתובת לא תקינה
  if (!from || from.endsWith('@chasamsofer.info')) return
  if (/(^|[._-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce|bounces)/i.test(from)) return
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return

  const body = `
    <p style="margin:0 0 8px;color:#0d9488;font-size:13px;font-weight:700;letter-spacing:0.5px;">בעזרת ה'</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">הגרלת כרטיסי טיסה</h2>

    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.9;">
      בעזרת ה' בימים הקרובים יתקיימו הגרלות על כרטיסי טיסה<br/>
      לציונו הקדוש של רבינו מרן החתם סופר זי"ע בפרשבורג
    </p>

    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.9;">
      ההגרלה היא לכל מגידי השיעורים בתורתו של מרן החת"ס<br/>
      וכן לכל המשתתפים הקבועים בשיעורים
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:#f0fdfa;border-right:4px solid #14b8a6;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0 0 8px;color:#0f766e;font-size:15px;font-weight:900;">שימו לב!</p>
        <p style="margin:0;color:#115e59;font-size:14px;line-height:1.9;">
          כדי שנוכל לערוך את ההגרלה לכל משתתפי השיעור עליכם לשלוח
          <strong>עד יום רביעי בלילה בשבוע זה פרשת בלק</strong>
          את שמות המשתתפים הקבועים בשיעורים לאימייל
          <a href="mailto:8@chasamsofer.info" style="color:#0d9488;font-weight:700;text-decoration:none;">8@chasamsofer.info</a>
        </p>
      </td></tr>
    </table>

    <p style="margin:0;color:#334155;font-size:15px;line-height:1.8;text-align:center;font-weight:700;">
      בברכת התורה<br/>
      היכל החתם סופר
    </p>`
  const html = shell({
    preheader: 'הגרלת כרטיסי טיסה לציונו הקדוש של מרן החתם סופר זי"ע בפרשבורג',
    accent: '#14b8a6',
    title: 'הגרלת כרטיסי טיסה',
    subtitle: 'היכל החתם סופר',
    body,
  })
  await deliverMail(from, 'הגרלת כרטיסי טיסה — היכל החתם סופר', html, undefined, { ...mailFor('inbox8'), skipLog: true })
}

// מענה אוטומטי לפניות שמגיעות לתיבת "איגוד" — מייל חדש עם הפרטים של הפונה +
// קישורי הגשת בקשות. הזיהוי: מספר ת"ז מלא (9 ספרות, כולל ספרת ביקורת) בשורת
// הנושא — של הרשום או של בן/בת הזוג; אם אין ת"ז בנושא, ננסה לפי כתובת השולח.
async function maybeAutoReplyIgud(
  admin: SupabaseClient,
  msg: { fromEmail: string; fromName: string | null; toEmail: string; subject: string },
) {
  if (departmentByEmail(msg.toEmail)?.key !== 'igud') return
  const from = (msg.fromEmail || '').toLowerCase()
  // הגנות לולאה: לא עונים לדואר פנימי/אוטומטי/כתובת לא תקינה
  if (!from || from.endsWith('@chasamsofer.info')) return
  if (/(^|[._-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce|bounces)/i.test(from)) return
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return

  const COLS = 'id_number, full_name, family_name, email, phone, city, address, marital_status, spouse_name, children_count, eligibility_status'
  type Ben = { id_number: string | null; full_name: string | null; family_name: string | null; email: string | null; phone: string | null; city: string | null; address: string | null; marital_status: string | null; spouse_name: string | null; children_count: number | null; eligibility_status: string | null }
  let ben: Ben | null = null

  // 1) זיהוי לפי ת"ז מלאה (9 ספרות) בשורת הנושא — של הרשום או של בן/בת הזוג
  const idMatch = String(msg.subject ?? '').match(/\d{9}/)
  if (idMatch) {
    const id = idMatch[0]
    const { data } = await admin
      .from('beneficiaries')
      .select(COLS)
      .or(`id_number.eq.${id},spouse_id_number.eq.${id}`)
      .maybeSingle()
    ben = (data as Ben) ?? null
  }
  // 2) נפילה-לאחור — לפי כתובת השולח
  if (!ben) {
    const { data } = await admin.from('beneficiaries').select(COLS).ilike('email', from).maybeSingle()
    ben = (data as Ben) ?? null
  }
  if (!ben) return

  const name = [ben.family_name, ben.full_name].filter(Boolean).join(' ')
  const details: [string, string | number | null | undefined][] = [
    ['שם מלא', name], ['ת.ז.', ben.id_number], ['טלפון', ben.phone], ['דוא״ל', ben.email],
    ['מצב משפחתי', ben.marital_status], ['בן/בת זוג', ben.spouse_name],
    ['כתובת', [ben.address, ben.city].filter(Boolean).join(', ')],
    ['מספר ילדים', ben.children_count != null ? String(ben.children_count) : ''],
  ]
  const draftLinks = ben.id_number
    ? await buildDraftLinks(admin, String(ben.id_number).replace(/\D/g, ''), ben.eligibility_status !== 'approved', ben.marital_status)
    : []
  const mail = benefitsLinkEmail(name, undefined, details, draftLinks)
  // מייל חדש (לא reply), עם הת"ז בשורת הנושא
  const subject = ben.id_number ? `${mail.subject} · ת.ז ${ben.id_number}` : mail.subject
  await deliverMail(from, subject, mail.html, undefined, { ...mailFor('igud'), skipLog: true })
}

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
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  // אבטחה — נכשל-סגור: חובה RESEND_WEBHOOK_SECRET (כותרת x-webhook-secret או ?secret=).
  // ללא אימות, תוקף יכול לזייף מייל נכנס ולגרום לדליפת PII של משפחה (מענה אוטומטי לאיגוד).
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error('[resend-inbound] RESEND_WEBHOOK_SECRET אינו מוגדר — דחיית כל הבקשות (fail-closed)')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  {
    const provided = request.headers.get('x-webhook-secret') ?? request.nextUrl.searchParams.get('secret')
    if (!provided || provided !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

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
  const candidates = [
    ...envelopeRecipients,
    ...extractEmails(getHeader(data.headers, 'to')),
    ...extractEmails(getHeader(data.headers, 'cc')),
    ...extractEmails(getHeader(data.headers, 'delivered-to')),
    ...extractEmails(getHeader(data.headers, 'x-original-to')),
    ...extractEmails(getHeader(data.headers, 'x-gm-original-to')),
    ...extractEmails(getHeader(data.headers, 'x-forwarded-to')),
  ]
  // עדיפות: (1) תיבה מוכרת במערכת; (2) כל נמען אמיתי בדומיין הארגון (כך שכתובת חדשה
  // שטרם הוגדרה כתיבה עדיין נשמרת תחת הכתובת האמיתית שלה, ולא תחת כתובת ה-copy של ה-subdomain);
  // (3) נפילה-לאחור ל-to של ה-envelope.
  const knownDept = candidates.find(addr => departmentByEmail(addr))
  const orgRecipient = candidates.find(addr => addr.endsWith('@chasamsofer.info'))
  // (4) דואר שהגיע לכתובת ה-copy של ה-subdomain (in.chasamsofer.info) ללא נמען מקורי מזוהה —
  // משייכים ל"משרד ראשי" כדי שלא יישאר יתום מחוץ לכל התיבות.
  const isInboundCopy = (knownDept || orgRecipient) ? false : candidates.some(a => a.endsWith('.chasamsofer.info'))
  const resolvedToEmail = knownDept ?? orgRecipient ?? (isInboundCopy ? 'office@chasamsofer.info' : to.email)

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

  const { data: insertedRows, error } = await admin.from('inbound_emails').upsert({
    message_id: messageId,
    from_email: from.email,
    from_name: from.name,
    to_email: resolvedToEmail,
    subject,
    html: html ?? null,
    plain_text: plain ?? null,
    headers: data.headers ?? null,
    attachments,
    is_read: false,
  }, { onConflict: 'message_id', ignoreDuplicates: true }).select('id')

  if (error) {
    console.error('[resend-inbound] DB error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // העברת עותק ל-Gmail רק עבור מייל חדש (לא בכפילות/ניסיון חוזר של ה-webhook)
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
    // מענה אוטומטי לפניות יריד — "פנייתך התקבלה"
    try {
      await maybeAutoReplyYerid({ fromEmail: from.email, fromName: from.name, toEmail: resolvedToEmail, subject })
    } catch (e) {
      console.error('[resend-inbound] yerid auto-reply error:', e instanceof Error ? e.message : String(e))
    }
    // מענה אוטומטי לפניות תיבה 8 — הודעה על הגרלת כרטיסי טיסה
    try {
      await maybeAutoReplyInbox8({ fromEmail: from.email, fromName: from.name, toEmail: resolvedToEmail })
    } catch (e) {
      console.error('[resend-inbound] inbox8 auto-reply error:', e instanceof Error ? e.message : String(e))
    }
    // קליטת בקשות במייל: מזוהה לפי הנושא ("בקשת...") — ולא לפי התיבה שאליה נותב.
    // חשוב: משלוח כפול של Google עלול לגרום לבקשה לאיגוד להיפתר לתיבת "משרד ראשי"
    // (עותק subdomain), ואז הגייטינג לפי isIgud החמיץ את הקליטה לחלוטין. לכן מזהים לפי הנושא.
    const isIgud = departmentByEmail(resolvedToEmail)?.key === 'igud'
    // אבחון קליטה — שומר את הנושא הגולמי/מפוענח והחלטת הניתוב, כדי לאבחן כשל זיהוי בקשה.
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
          isRequestSubject: isRequestSubject(subject),
          plainLen: (plain ?? '').length, htmlLen: (html ?? '').length,
        }),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
    } catch { /* אבחון בלבד */ }
    // גוף לקליטה: מעדיפים טקסט; אם רק HTML — ממירים תוך שמירת שבירות שורה
    const bodyText = (plain && plain.trim()) ? plain : htmlToPlainText(html ?? '')

    // נושא אפקטיבי: אם הנושא לא זוהה כבקשה — נפילה-לאחור לזיהוי לפי גוף הטופס.
    // (מגן על המקרה שבו הנושא הגיע פגום/מקודד/שונה, אך הגוף הוא טופס בקשה תקין
    //  עם שורת "(מזהה: XXXXXXXXX)" ומרקרים של השדות.)
    let effectiveSubject = subject
    if (!isRequestSubject(subject)) {
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
        effectiveSubject = `${bodyType} · ת.ז ${idInBody}`
        console.warn('[resend-inbound] נושא לא זוהה — נפילה-לאחור לזיהוי לפי הגוף:', effectiveSubject)
      }
    }

    if (isRequestSubject(effectiveSubject)) {
      try {
        const handled = await handleEmailRequest(admin, { fromEmail: from.email, subject: effectiveSubject, body: bodyText, attachments })
        if (!handled && isIgud) {
          await maybeAutoReplyIgud(admin, { fromEmail: from.email, fromName: from.name, toEmail: resolvedToEmail, subject })
        }
      } catch (e) {
        console.error('[resend-inbound] email-request intake error:', e instanceof Error ? e.message : String(e))
      }
    } else if (isIgud) {
      try {
        await maybeAutoReplyIgud(admin, { fromEmail: from.email, fromName: from.name, toEmail: resolvedToEmail, subject })
      } catch (e) {
        console.error('[resend-inbound] igud auto-reply error:', e instanceof Error ? e.message : String(e))
      }
    }
  }

  return NextResponse.json({ ok: true })
}
