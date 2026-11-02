import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { shell } from '@/lib/emailTemplates'
import { shouldSkipAutoReply, isAutoSubmittedMail } from '@/lib/maintenanceReply'
import { GILYONOT_FROM_EMAIL, GILYONOT_FROM_NAME, normalizeEmail, cleanSubscriberName, subscribeGilyonot } from '@/lib/gilyonot'
import { gilyonotUrls, escHtml } from '@/lib/gilyonotMail'
import { htmlToPlainText } from '@/lib/gilyonotSender'
import { textOf, type EmailTexts } from '@/lib/emailCatalog'
import { ensureEmailTexts, textFor } from '@/lib/emailTextsStore'

// ─────────────────────────────────────────────────────────────────────────────
// קליטת מייל נכנס ל-d@: כל שולח נרשם לרשימת התפוצה ומקבל מייל אישור.
// נקרא מ-app/api/webhooks/resend-inbound (אחרי אימות חתימת ה-webhook).
// התיבה אינה נקראת בידי אדם, ולכן המייל לא נשמר בדואר הנכנס.
// ─────────────────────────────────────────────────────────────────────────────

export type InboundOutcome =
  | 'added' | 'exists' | 'blocked_unsubscribed'
  | 'ignored_auto' | 'ignored_invalid' | 'ignored_spoofed' | 'rate_limited' | 'error'

/** נושא הרישום ביומן המענים, משמש גם לספירת התקרות. */
export const GILYONOT_REPLY_SUBJECT = {
  added: 'גיליונות החתם סופר: הרשמתך לעדכונים וגיליונות התקבלה בהצלחה',
  exists: 'גיליונות החתם סופר: אתה כבר רשום לקבלת עדכונים',
  blocked_unsubscribed: 'גיליונות החתם סופר: הרישום הוסר בעבר',
} as const

/** תקרת מענים לשולח ביממה, ותקרה כללית בשעה (בולמים לולאה והצפה). */
export const SENDER_DAILY_CAP = 2
export const GLOBAL_HOURLY_CAP = 300

export function isGilyonotAddress(addr: string): boolean {
  return addr.trim().toLowerCase() === GILYONOT_FROM_EMAIL.toLowerCase()
}

function headerValue(headers: unknown, name: string): string {
  const t = name.toLowerCase()
  if (Array.isArray(headers)) {
    const h = headers.find((x: { name?: string }) => String(x?.name ?? '').toLowerCase() === t) as { value?: unknown } | undefined
    return h ? String(h.value ?? '') : ''
  }
  if (headers && typeof headers === 'object') {
    const k = Object.keys(headers as Record<string, unknown>).find(x => x.toLowerCase() === t)
    return k ? String((headers as Record<string, unknown>)[k] ?? '') : ''
  }
  return ''
}

/** מייל אוטומטי: לפי כותרות תקניות (Auto-Submitted ועוד) או דפוס כתובת (bounce, mailer-daemon, noreply). */
export function isAutomatedInbound(fromEmail: string, headers: unknown): boolean {
  if (shouldSkipAutoReply(fromEmail)) return true
  if (isAutoSubmittedMail(headers)) return true
  const auto = headerValue(headers, 'auto-submitted').trim().toLowerCase()
  if (auto && auto !== 'no') return true
  if (headerValue(headers, 'x-auto-response-suppress') || headerValue(headers, 'list-id')) return true
  if (['bulk', 'auto_reply', 'junk', 'list'].includes(headerValue(headers, 'precedence').trim().toLowerCase())) return true
  return false
}

/**
 * אימות השולח: כשהכותרות כוללות Authentication-Results וה-DMARC או ה-SPF נכשלו,
 * הכתובת מזויפת ולא נרשמים. אם הספק לא מוסר כותרות, אין מה לבדוק מעבר לתקינות הכתובת
 * (ההגנה אז היא התקרות, והמייל מכיל קישור הסרה).
 */
export function isSpoofedSender(headers: unknown): boolean {
  const ar = headerValue(headers, 'authentication-results').toLowerCase()
  return /\b(dmarc|spf)=(fail|softfail|permerror)\b/.test(ar)
}

// ── המייל ──
const GREEN = '#15803d'
const BLUE = '#2563eb'

function button(href: string, label: string, bg: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 8px;"><tr><td align="center" style="border-radius:14px;background:${bg};">
<a href="${escHtml(href)}" target="_blank" style="display:block;padding:15px 36px;font-family:'Heebo',Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;">${label}</a>
</td></tr></table>`
}

// הפניה לכתובות הפעילות, כמו במענה האוטומטי של התיבות (lib/autoReplyConfig.ts)
export const GILYONOT_CONTACTS = [
  { label: 'לנושאים כלליים של היכל החתם סופר', email: 'office@chasamsofer.info' },
  { label: 'לנושאים הקשורים לאיגוד הצאצאים', email: 'igud@chasamsofer.info' },
] as const

/** מקור הטקסטים: ברירת מחדל המטמון; לתצוגה מקדימה מועבר טיוטה. */
type TextGetter = (emailId: string, fieldKey: string) => string
type ReplyKind = 'added' | 'exists' | 'blocked_unsubscribed'
export const GILYONOT_REPLY_IDS = ['gilyonot_reply_added', 'gilyonot_reply_exists', 'gilyonot_reply_blocked', 'gilyonot_reply_shared'] as const
const REPLY_ID: Record<ReplyKind, string> = {
  added: 'gilyonot_reply_added',
  exists: 'gilyonot_reply_exists',
  blocked_unsubscribed: 'gilyonot_reply_blocked',
}
const SHARED_ID = 'gilyonot_reply_shared'

/** הכתובות לפניות כפי שנערכו (JSON); נפילה לברירת המחדל אם הערך פגום. מערך ריק מסיר את הבלוק. */
export function gilyonotContacts(get: TextGetter = textFor): { label: string; email: string }[] {
  try {
    const arr = JSON.parse(get(SHARED_ID, 'contacts'))
    if (Array.isArray(arr)) {
      return arr
        .map(c => ({ label: String(c?.label ?? '').trim(), email: String(c?.email ?? '').trim() }))
        .filter(c => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(c.email))
    }
  } catch { /* ברירת המחדל */ }
  return GILYONOT_CONTACTS.map(c => ({ ...c }))
}

function noReplyBox(get: TextGetter): string {
  const contacts = gilyonotContacts(get).map(c =>
    `<p style="margin:10px 0 0;color:#334155;font-size:15px;line-height:1.7;font-family:'Heebo',Arial,sans-serif;text-align:center;">${c.label ? `${escHtml(c.label)}:<br>` : ''}<a href="mailto:${escHtml(c.email)}" style="color:#1d4ed8;font-weight:700;text-decoration:none;direction:ltr;unicode-bidi:embed;">${escHtml(c.email)}</a></p>`,
  ).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;"><tr><td style="background:#fef2f2;border:2px solid #fecaca;border-radius:12px;padding:18px 20px;">
<p style="margin:0;color:#991b1b;font-size:16px;font-weight:900;line-height:1.7;font-family:'Heebo',Arial,sans-serif;text-align:center;">${escHtml(get(SHARED_ID, 'noreply'))}</p>
${contacts ? `<p style="margin:12px 0 0;color:#334155;font-size:15px;font-weight:700;line-height:1.7;font-family:'Heebo',Arial,sans-serif;text-align:center;">לפניות:</p>${contacts}` : ''}
</td></tr></table>`
}

const p = (t: string) => `<p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.8;font-family:'Heebo',Arial,sans-serif;text-align:center;">${t}</p>`

/** טקסט חופשי: מקוטע לפסקאות בשורה ריקה, ושורה בודדת הופכת ל-<br>. */
function paragraphs(t: string): string {
  return t.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean).map(x => p(escHtml(x).replace(/\n/g, '<br>'))).join('')
}

/**
 * ⚠️ קורא את הטקסטים הערוכים מהמטמון (textFor). מי שקורא לה חייב לקרוא קודם ל-ensureEmailTexts().
 * נושא היומן (GILYONOT_REPLY_SUBJECT) נשאר קבוע, כדי שהתקרות לא יישברו כשעורכים את הנושא.
 */
export function buildGilyonotReply(
  kind: ReplyKind,
  opts: { name?: string | null; unsubscribeUrl?: string | null; texts?: EmailTexts },
): { subject: string; html: string } {
  const get: TextGetter = opts.texts ? (id, k) => textOf(opts.texts, id, k) : textFor
  const t = (key: string) => get(REPLY_ID[kind], key)
  const hello = escHtml(t('hello').replace('{{שם}}', opts.name ? opts.name : 'רב'))
  const lead = escHtml(t('lead'))
  const btnLabel = escHtml(t('btn'))
  const accent = kind === 'added' ? GREEN : BLUE
  const action = kind === 'blocked_unsubscribed'
    ? button(gilyonotUrls.signup(), btnLabel, GREEN)
    : opts.unsubscribeUrl ? button(opts.unsubscribeUrl, btnLabel, '#64748b') : ''
  const body = p(hello) + p(`<strong>${lead}</strong>`) + paragraphs(t('text')) + action
  const html = shell({ preheader: get(SHARED_ID, 'noreply'), accent, title: t('title'), subtitle: t('subtitle'), body: body + noReplyBox(get) })
  return { subject: t('subject'), html }
}

// ── שליחה ──
export type SendReply = (to: string, mail: { subject: string; html: string }, unsubscribeUrl: string | null) => Promise<boolean>

export const sendReplyViaResend: SendReply = async (to, mail, unsubscribeUrl) => {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) { console.error('[gilyonot-inbound] RESEND_API_KEY לא מוגדר'); return false }
  const { error } = await new Resend(apiKey).emails.send({
    from: `${GILYONOT_FROM_NAME} <${GILYONOT_FROM_EMAIL}>`,
    to, subject: mail.subject, html: mail.html, text: htmlToPlainText(mail.html),
    // ⚠️ תשובה לא חוזרת ל-d@ (שאינה נקראת), אלא למשרד הראשי
    replyTo: GILYONOT_CONTACTS[0].email,
    headers: {
      'Auto-Submitted': 'auto-replied',
      'X-Auto-Response-Suppress': 'All',
      Precedence: 'auto_reply',
      ...(unsubscribeUrl ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {}),
    },
  })
  if (error) { console.error('[gilyonot-inbound] שליחה נכשלה:', error.message); return false }
  return true
}

/** תקרות: נכשל-סגור (אם אי אפשר לספור, לא שולחים). */
async function underCaps(db: SupabaseClient, email: string): Promise<boolean> {
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString()
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const mine = await db.from('auto_reply_log').select('id', { count: 'exact', head: true })
    .eq('to_email', email).like('subject', 'גיליונות החתם סופר:%').gte('created_at', dayAgo)
  if (mine.error || (mine.count ?? 0) >= SENDER_DAILY_CAP) return false
  const all = await db.from('auto_reply_log').select('id', { count: 'exact', head: true })
    .like('subject', 'גיליונות החתם סופר:%').gte('created_at', hourAgo)
  if (all.error || (all.count ?? 0) >= GLOBAL_HOURLY_CAP) return false
  return true
}

/**
 * מטפל במייל שהגיע ל-d@: רושם את השולח (אם חדש) ושולח מייל אישור.
 * ⚠️ מי שהסיר את עצמו לא מוחזר אוטומטית (כתובת השולח ניתנת לזיוף); הוא מקבל קישור להרשמה מחדש.
 */
export async function handleGilyonotInbound(
  db: SupabaseClient,
  msg: { fromEmail: string; fromName?: string | null; headers?: unknown; messageId?: string },
  send: SendReply = sendReplyViaResend,
): Promise<InboundOutcome> {
  const email = normalizeEmail(msg.fromEmail)
  if (!email) return 'ignored_invalid'
  if (isGilyonotAddress(email) || /@chasamsofer\./i.test(email)) return 'ignored_auto'
  if (isAutomatedInbound(email, msg.headers)) return 'ignored_auto'
  if (isSpoofedSender(msg.headers)) return 'ignored_spoofed'

  // התקרה נבדקת לפני הרישום, כדי שגם הצפה לא תכתוב לטבלה ללא הגבלה.
  if (!(await underCaps(db, email))) return 'rate_limited'

  const name = cleanSubscriberName(msg.fromName)
  const res = await subscribeGilyonot(db, { email, name, source: 'email', sourceRef: (msg.messageId ?? '').slice(0, 100) || null })
  if (!res.ok) return 'error'

  const kind = res.outcome === 'added' || res.outcome === 'reactivated' ? 'added'
    : res.outcome === 'blocked_unsubscribed' ? 'blocked_unsubscribed' : 'exists'

  let unsubscribeUrl: string | null = null
  if (kind !== 'blocked_unsubscribed') {
    const { data } = await db.from('gilyonot_subscribers').select('token').eq('email', email).maybeSingle()
    unsubscribeUrl = data?.token ? gilyonotUrls.unsubscribe(String(data.token)) : null
  }
  await ensureEmailTexts()
  const mail = buildGilyonotReply(kind, { name, unsubscribeUrl })
  if (!(await send(email, mail, unsubscribeUrl))) return 'error'
  // נושא קבוע ביומן (לא הנושא הערוך), כדי שספירת התקרות תמשיך לעבוד
  await db.from('auto_reply_log').insert({ to_email: email, subject: GILYONOT_REPLY_SUBJECT[kind] })
  return kind
}

/** כתובת ההעתקה של Resend (copy@in.chasamsofer.info) מצורפת לכל מייל נכנס, ואינה נמען אמיתי. */
const COPY_ADDRESS_RE = /@in\.chasamsofer\.info$/i

/** האם המייל נועד ל-d@ בלבד: כל הנמענים הישירים בדומיין הארגון הם d@, בלי לספור את כתובת ההעתקה. */
export function isGilyonotOnlyRecipient(direct: string[], isOrgAddr: (a: string) => boolean): boolean {
  const org = direct.filter(a => isOrgAddr(a) && !COPY_ADDRESS_RE.test(a.trim()))
  return org.length > 0 && org.every(isGilyonotAddress)
}
