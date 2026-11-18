import { gilyonFileName } from './gilyonotFileName'
import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from './apiAuth'
import { isBlockedForMail } from './jewishCalendar'
import { GILYONOT_FROM_EMAIL, GILYONOT_FROM_NAME } from './gilyonot'
import { buildGilyonHtml, gilyonotUrls } from './gilyonotMail'
import { sanitizeMailHtml } from './gilyonotRichHtml'
import { advanceIssueCounter, heichalotMissingError } from './gilyonotHeichalot'
import { loadLists, resolveRecipients, type Recipient } from './gilyonotLists'

// ─────────────────────────────────────────────────────────────────────────────
// שליחת הגיליון השבועי לרשימת התפוצה, באותה שיטה כמו מנוע הניוזלטר
// (lib/newsletter/sender.ts): Resend Batch של עד 100 מיילים, 2 בקשות בשנייה,
// נעילה נגד ריצה כפולה, והמשך מהשורות שנשארו pending אם השרת נפל באמצע.
//
// הגיליון נשלח כקישור הורדה אישי (/api/gilyonot/d/<טוקן>) ולא כקובץ מצורף, ולכן
// אפשר לספור הורדות. המעקב: פיקסל פתיחה (/api/gilyonot/o), הקלקות, הורדות
// והאירועים של Resend (נמסר, חזר, ספאם). אין שמות בשום מקום במייל.
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 100
// קצב: כמה מיילים מתחילים בכל שנייה. ברירת המחדל 2 היא המגבלה של Resend לחשבון.
// אחרי ש-Resend מעלה את המגבלה, מגדירים GILYONOT_RATE_PER_SEC בשרת בלי שינוי קוד.
// השליחות לא מחכות זו לזו: מייל עם PDF כבד לוקח זמן להעלות, וקודם הוא עיכב את כל השאר (2 מיילים, המתנה לשניהם, ועוד שנייה).
const RATE_PER_SEC = Math.max(1, Math.floor(Number(process.env.GILYONOT_RATE_PER_SEC) || 2))
const MAX_IN_FLIGHT = RATE_PER_SEC * 4
const MAX_ATTEMPTS = 3
const RATE_LIMIT_RETRIES = 5
// ה-worker נקרא כל דקה, אבל סבב שליחה ממשיך עד 10 דקות (הנעילה מתחדשת), ולא נעצר כל 50 שניות
const TICK_BUDGET_MS = 10 * 60_000
const isRateLimit = (e: unknown) => {
  const x = e as { name?: string; statusCode?: number } | null
  return x?.name === 'rate_limit_exceeded' || x?.statusCode === 429
}
/** מגבלת Resend: 40MB למייל אחרי קידוד base64 (גדל ב-33%) */
export const RESEND_MAX_BYTES = 40 * 1024 * 1024
const LOCK_KEY = 771122335 // שונה מהניוזלטר (771122334)
const PAGE = 1000

/** ה-RPC מחזיק את הנעילה 15 דקות. פריסה באמצע שליחה הורגת את התהליך והנעילה נשארת, ולכן מקצרים אותה לדקתיים ומחדשים בכל סבב. */
const LOCK_TTL_MS = 2 * 60_000
async function renewLock(db: SupabaseClient) {
  const { error } = await db.from('worker_locks').update({ expires_at: new Date(Date.now() + LOCK_TTL_MS).toISOString() }).eq('key', LOCK_KEY)
  if (error) console.error('[gilyonot] חידוש הנעילה נכשל:', error.message)
}

// ── כיבוי מסודר בפריסה ──
// ECS שולח SIGTERM לשרת הישן. מכאן לא לוקחים נמענים חדשים: הזוג שבשליחה
// מסתיים ומסומן במסד, הנעילה משתחררת, והשרת החדש ממשיך בטיק הבא בלי המתנה.
let stopping = false
let running: Promise<unknown> | null = null
export async function stopGilyonotSender(): Promise<void> {
  stopping = true
  if (running) await running.catch(() => {})
}
/** לבדיקות בלבד */
export function resetGilyonotSenderForTest() { stopping = false; running = null }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** גרסת טקסט של המייל: מיילים בלי חלק טקסט נראים יותר כמו ספאם. קישורים נשמרים כ"טקסט: כתובת". */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => `${label.replace(/<[^>]+>/g, '').trim()}: ${href}`)
    .replace(/<br\s*\/?>|<\/(p|h1|h2|h3|li|tr|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const from = () => `${GILYONOT_FROM_NAME} <${GILYONOT_FROM_EMAIL}>`

/** שם לדוגמה בתצוגה המקדימה ובמייל הניסיון, במקום {{שם}}. */
export const SAMPLE_NAME = 'ישראל ישראלי'

export interface IssueRow {
  id: string
  title: string
  parasha: string
  subject: string
  intro: string | null
  body_html: string | null
  design: unknown
  file_path: string
  file_name: string
  /** קובץ שני ("היכלות"), לא חובה */
  file2_path?: string | null
  file2_name?: string | null
  /** סומן "יש היכלות חדש": חובה קובץ חדש לפני שמירה ושליחה */
  heichalot_new?: boolean | null
  status: 'draft' | 'scheduled' | 'sending' | 'sent'
  /** 'attachment' = קובץ מצורף במייל (ברירת מחדל, אין נתוני הורדות); 'link' = גיליונות שנשלחו עם קישור הורדה שנספר */
  delivery_mode?: 'link' | 'attachment'
}

interface DeliveryRow {
  id: string
  email: string
  token: string
  attempts: number
  gilyonot_subscribers: { full_name: string | null; token: string; status: string } | null
}

// הגוף נשמר נקי, ובכל זאת מנוקה שוב לפני שליחה. זיכרון של האחרון כדי לא לנקות לכל נמען.
let lastBody = { raw: '', clean: '' }
function cleanBody(raw: string | null): string {
  if (!raw) return ''
  if (lastBody.raw !== raw) lastBody = { raw, clean: sanitizeMailHtml(raw) }
  return lastBody.clean
}

export { gilyonFileName } from './gilyonotFileName'

export interface Attachment { filename: string; content: Buffer }


/** האם קובץ בגודל הזה נכנס במייל אחד (עם base64). נשאר לגיליונות ישנים ולכיווץ. */
export const fitsInMail = (bytes: number) => Math.ceil(bytes * 4 / 3) <= RESEND_MAX_BYTES

/** בודק שהקובץ קיים באחסון, ומחזיר קישור חתום (7 ימים) למייל הניסיון. */
export async function checkIssueFile(db: SupabaseClient, issue: Pick<IssueRow, 'title' | 'parasha' | 'file_path' | 'file_name'>): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { data, error } = await db.storage.from('documents')
    .createSignedUrl(issue.file_path, 7 * 24 * 3600, { download: gilyonFileName(issue, issue.file_name) })
  if (error || !data?.signedUrl) return { ok: false, error: 'הקובץ לא נמצא באחסון' }
  return { ok: true, url: data.signedUrl }
}

export async function loadAttachment(db: SupabaseClient, issue: Pick<IssueRow, 'title' | 'parasha' | 'file_path'>): Promise<{ ok: true; att: Attachment } | { ok: false; error: string }> {
  const { data, error } = await db.storage.from('documents').download(issue.file_path)
  if (error || !data) return { ok: false, error: 'הקובץ לא נמצא באחסון' }
  const content = Buffer.from(await data.arrayBuffer())
  if (!fitsInMail(content.length)) {
    return { ok: false, error: `הקובץ גדול מדי למייל (${(content.length / 1048576).toFixed(1)}MB; המגבלה כ-30MB). כווץ את הקובץ או העלה קטן יותר.` }
  }
  return { ok: true, att: { filename: gilyonFileName(issue, issue.file_path), content } }
}

/** כל הצרופות של הגיליון: קובץ הגיליון, ואם יש, גם "היכלות". הגודל המצטבר נבדק מול מגבלת המייל. */
export async function loadAttachments(db: SupabaseClient, issue: Pick<IssueRow, 'title' | 'parasha' | 'file_path' | 'file2_path' | 'heichalot_new'>): Promise<{ ok: true; atts: Attachment[] } | { ok: false; error: string }> {
  const missing = heichalotMissingError(issue)
  if (missing) return { ok: false, error: missing }
  const first = await loadAttachment(db, issue)
  if (!first.ok) return first
  const atts = [first.att]
  if (issue.file2_path) {
    const { data, error } = await db.storage.from('documents').download(issue.file2_path)
    if (error || !data) return { ok: false, error: 'קובץ "היכלות" לא נמצא באחסון' }
    const ext = /\.(\w+)$/.exec(issue.file2_path)?.[1] ?? 'pdf'
    atts.push({ filename: `היכלות.${ext}`, content: Buffer.from(await data.arrayBuffer()) })
  }
  const total = atts.reduce((n, a) => n + a.content.length, 0)
  if (!fitsInMail(total)) {
    return { ok: false, error: `שני הקבצים יחד גדולים מדי למייל (${(total / 1048576).toFixed(1)}MB; המגבלה כ-30MB). כווצו אחד מהם או העלו קטנים יותר.` }
  }
  return { ok: true, atts }
}

type MailFields = Pick<IssueRow, 'title' | 'parasha' | 'intro' | 'body_html' | 'design'>

/** המייל עצמו לנמען אחד. גם התצוגה המקדימה משתמשת בזה (עם טוקנים לדוגמה). */
export function issueEmail(issue: MailFields, r: { deliveryToken: string; subscriberToken: string | null }) {
  // מנוי רשום מוסר מהרשימה הראשית; נמען מרשימה חיצונית מוסר מכל הרשימות (לפי טוקן המשלוח)
  const unsubscribeUrl = r.subscriberToken ? gilyonotUrls.unsubscribe(r.subscriberToken) : gilyonotUrls.optout(r.deliveryToken)
  return {
    html: buildGilyonHtml({
      title: issue.title, parasha: issue.parasha, intro: issue.intro,
      bodyHtml: cleanBody(issue.body_html), design: issue.design,
      unsubscribeUrl, senderEmail: GILYONOT_FROM_EMAIL, senderName: GILYONOT_FROM_NAME,
      pixelUrl: gilyonotUrls.pixel(r.deliveryToken),
    }),
    unsubscribeUrl,
  }
}

/** מייל ניסיון לכתובת אחת: הקובץ מצורף, בלי פיקסל. */
export async function sendGilyonTest(db: SupabaseClient, issue: IssueRow, to: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY לא מוגדר בשרת' }
  const file = await loadAttachments(db, issue)
  if (!file.ok) return file
  const html = buildGilyonHtml({
    title: issue.title, parasha: issue.parasha, intro: issue.intro, bodyHtml: cleanBody(issue.body_html), design: issue.design,
    unsubscribeUrl: await testUnsubscribeUrl(db, to), senderEmail: GILYONOT_FROM_EMAIL, senderName: GILYONOT_FROM_NAME,
  })
  const { error } = await new Resend(apiKey).emails.send({ from: from(), to, subject: `[ניסיון] ${issue.subject}`, html, text: htmlToPlainText(html), replyTo: GILYONOT_FROM_EMAIL, attachments: file.atts })
  if (error) return { ok: false, error: String(error.message ?? error) }
  return { ok: true }
}

/**
 * מקפיא את הרשימה: שורת משלוח לכל נרשם פעיל, ומעביר את הגיליון ל-'sending'.
 * ה-worker ישלח בטיק הקרוב. מחזיר את מספר הנמענים.
 */
export async function startIssueSend(db: SupabaseClient, issueId: string, listIds?: string[], from: 'draft' | 'scheduled' = 'draft'): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const { data: row } = await db.from('gilyonot_issues').select('title, parasha, file_path, file_name, file2_path, heichalot_new').eq('id', issueId).maybeSingle()
  if (!row) return { ok: false, error: 'הגיליון לא נמצא' }
  // הקובץ מצורף לכל מייל, אז בודקים כבר כאן שהוא קיים ונכנס במייל
  const file = await loadAttachments(db, row as Pick<IssueRow, 'title' | 'parasha' | 'file_path' | 'file2_path' | 'heichalot_new'>)
  if (!file.ok) return file
  // נעילה אופטימית: רק טיוטה עוברת לשליחה, כך שלחיצה כפולה לא מכפילה
  const { data: claimed, error: claimErr } = await db.from('gilyonot_issues')
    .update({ status: 'sending', delivery_mode: 'attachment', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', issueId).eq('status', from).select('id').maybeSingle()
  if (claimErr) return { ok: false, error: 'עדכון הגיליון נכשל' }
  if (!claimed) return { ok: false, error: 'הגיליון כבר נשלח או בשליחה' }

  const rollback = async () => {
    await db.from('gilyonot_deliveries').delete().eq('issue_id', issueId)
    await db.from('gilyonot_issues').update({ status: 'draft', started_at: null, scheduled_at: null, scheduled_list_ids: null }).eq('id', issueId)
  }
  // הרשימות שנבחרו, מאוחדות לפי מייל. בלי בחירה = הרשימה הראשית בלבד (כמו קודם).
  let recipients: Recipient[]
  try {
    const ids = listIds?.length ? listIds : (await loadLists(db)).filter(l => l.kind === 'subscribers').map(l => l.id)
    recipients = (await resolveRecipients(db, ids)).recipients
  } catch {
    await rollback()
    return { ok: false, error: 'טעינת רשימות התפוצה נכשלה' }
  }

  const total = recipients.length
  for (let i = 0; i < total; i += PAGE) {
    const { error: insErr } = await db.from('gilyonot_deliveries').upsert(
      recipients.slice(i, i + PAGE).map(r => ({ issue_id: issueId, subscriber_id: r.subscriberId, email: r.email })),
      { onConflict: 'issue_id,email', ignoreDuplicates: true },
    )
    if (insErr) {
      await rollback()
      return { ok: false, error: 'הכנת רשימת הנמענים נכשלה' }
    }
  }

  if (!total) {
    await rollback()
    return { ok: false, error: 'אין נמענים ברשימות שנבחרו' }
  }
  await db.from('gilyonot_issues').update({ total_count: total }).eq('id', issueId)
  // השליחה האמיתית יצאה לדרך (לא נכשלה ולא חזרה לטיוטה): מקדמים את מספר הגיליון הבא.
  // פעם אחת לגיליון, ולא במייל ניסיון.
  await advanceIssueCounter(db, issueId).catch(() => null)
  return { ok: true, total }
}

/** בדיקה בזמן התזמון שהקובץ קיים ונכנס במייל (אותה בדיקה כמו בשליחה). */
export async function checkScheduleReady(db: SupabaseClient, issueId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row } = await db.from('gilyonot_issues').select('title, parasha, file_path, file_name, file2_path, heichalot_new').eq('id', issueId).maybeSingle()
  if (!row) return { ok: false, error: 'הגיליון לא נמצא' }
  const file = await loadAttachments(db, row as Pick<IssueRow, 'title' | 'parasha' | 'file_path' | 'file2_path' | 'heichalot_new'>)
  return file.ok ? { ok: true } : file
}

/** גיליונות מתוזמנים שהגיע זמנם עוברים ל-'sending' (אותו מסלול כמו שליחה ידנית). כישלון חוזר לטיוטה עם הסבר. */
async function promoteDueScheduled(db: SupabaseClient): Promise<void> {
  const { data: due } = await db.from('gilyonot_issues').select('id, scheduled_list_ids').eq('status', 'scheduled').lte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(5)
  for (const d of due ?? []) {
    const ids = Array.isArray(d.scheduled_list_ids) ? d.scheduled_list_ids.filter((x: unknown): x is string => typeof x === 'string') : undefined
    const r = await startIssueSend(db, d.id, ids, 'scheduled')
    if (!r.ok && r.error !== 'הגיליון כבר נשלח או בשליחה') {
      await db.from('gilyonot_issues').update({ schedule_error: `השליחה המתוזמנת נכשלה: ${r.error}` }).eq('id', d.id)
    }
  }
}

/** ה-worker. נקרא כל דקה מ-instrumentation.ts. */
export async function runGilyonotSender(): Promise<{ sent: number; failed: number }> {
  // סבב קודם עדיין שולח (סבב נמשך עד 10 דקות): לא מתחילים סבב נוסף באותו תהליך
  if (stopping || running) return { sent: 0, failed: 0 }
  const p = runSender()
  running = p
  try { return await p } finally { if (running === p) running = null }
}

async function runSender(): Promise<{ sent: number; failed: number }> {
  const empty = { sent: 0, failed: 0 }
  // לא שולחים בשבת ובחג: הגיליון ממתין לטיק הבא ביום חול
  if (isBlockedForMail(new Date())) return empty
  const db = getServiceClient()
  if (!db) return empty
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return empty

  await promoteDueScheduled(db)

  const { data: issues } = await db.from('gilyonot_issues').select('*').eq('status', 'sending').order('started_at')
  if (!issues?.length) return empty

  const { data: gotLock } = await db.rpc('try_worker_lock', { p_key: LOCK_KEY })
  if (gotLock === false) return empty
  await renewLock(db)

  let sent = 0, failed = 0
  try {
    for (const issue of issues as IssueRow[]) {
      const res = await sendBatches(db, new Resend(apiKey), issue)
      sent += res.sent
      failed += res.failed
    }
  } catch (err) {
    console.error('[gilyonot] worker failed', err)
  } finally {
    await db.rpc('release_worker_lock', { p_key: LOCK_KEY })
  }
  return { sent, failed }
}

async function sendBatches(db: SupabaseClient, resend: Resend, issue: IssueRow): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0
  const deadline = Date.now() + TICK_BUDGET_MS
  const file = await loadAttachments(db, issue)
  if (!file.ok) {
    console.error(`[gilyonot] ${issue.id}: ${file.error}`)
    return { sent, failed }
  }

  while (Date.now() < deadline && !stopping) {
    await renewLock(db)
    const { data } = await db.from('gilyonot_deliveries')
      .select('id, email, token, attempts, gilyonot_subscribers(full_name, token, status)')
      .eq('issue_id', issue.id).eq('status', 'pending').limit(BATCH_SIZE)
    let batch = (data ?? []) as unknown as DeliveryRow[]

    // מי שהסיר את עצמו אחרי שהרשימה הוקפאה — לא שולחים לו, והשורה יורדת מהספירה
    const gone = batch.filter(d => d.gilyonot_subscribers?.status === 'unsubscribed')
    if (gone.length) {
      await db.from('gilyonot_deliveries').delete().in('id', gone.map(d => d.id))
      batch = batch.filter(d => d.gilyonot_subscribers?.status !== 'unsubscribed')
      if (!batch.length) continue
    }
    // מי שהסיר את עצמו מכל הרשימות (קישור הסרה של נמען חיצוני או ניוזלטר)
    const optedOut = await optedOutEmails(db, batch.map(d => d.email))
    if (optedOut.size) {
      const skip = batch.filter(d => optedOut.has(d.email.trim().toLowerCase()))
      await db.from('gilyonot_deliveries').delete().in('id', skip.map(d => d.id))
      batch = batch.filter(d => !optedOut.has(d.email.trim().toLowerCase()))
      if (!batch.length) continue
    }
    if (!batch.length) { await finalize(db, issue.id); break }

    let hadFailure = false
    const sendOne = async (d: DeliveryRow, retry = 0): Promise<boolean> => {
      const { html, unsubscribeUrl } = issueEmail(issue, {
        deliveryToken: d.token,
        subscriberToken: d.gilyonot_subscribers?.token ?? null,
      })
      try {
        const { data: res, error } = await resend.emails.send({
          from: from(), to: d.email, subject: issue.subject, html, text: htmlToPlainText(html), replyTo: GILYONOT_FROM_EMAIL, attachments: file.atts,
          headers: unsubscribeUrl
            ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
            : undefined,
        // אם התהליך נהרג בין השליחה לסימון במסד, הניסיון הבא נושא אותו מפתח
        // ו-Resend לא שולח שוב (חלון של 24 שעות).
        }, { idempotencyKey: `gilyon-${d.id}-${d.attempts}` })
        if (error) {
          // חריגה מהקצב של Resend: מחכים ומנסים שוב באותו מפתח, בלי לספור ניסיון ובלי לעצור את הסבב
          if (isRateLimit(error) && retry < RATE_LIMIT_RETRIES && !stopping) { await sleep(1000 * (retry + 1)); return sendOne(d, retry + 1) }
          throw new Error(String(error.message ?? error))
        }
        await db.from('gilyonot_deliveries')
          .update({ status: 'sent', resend_id: res?.id ?? null, sent_at: new Date().toISOString(), attempts: d.attempts + 1, error: null })
          .eq('id', d.id)
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[gilyonot] send failed (${issue.id}):`, msg)
        const attempts = d.attempts + 1
        await db.from('gilyonot_deliveries')
          .update({ attempts, status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', error: msg.slice(0, 300) })
          .eq('id', d.id)
        return false
      }
    }
    const inFlight = new Set<Promise<void>>()
    let renewedAt = Date.now()
    for (let i = 0; i < batch.length && Date.now() < deadline && !hadFailure && !stopping; i += RATE_PER_SEC) {
      const startedAt = Date.now()
      for (const d of batch.slice(i, i + RATE_PER_SEC)) {
        const p: Promise<void> = sendOne(d).then(ok => { if (ok) sent++; else { failed++; hadFailure = true } }).finally(() => { inFlight.delete(p) })
        inFlight.add(p)
      }
      while (inFlight.size >= MAX_IN_FLIGHT) await Promise.race(inFlight)
      if (Date.now() - renewedAt > 30_000) { await renewLock(db); renewedAt = Date.now() }
      const wait = 1000 - (Date.now() - startedAt)
      if (wait > 0 && !stopping) await sleep(wait)
    }
    // מסיימים את כל מה שבדרך לפני שמושכים נמענים חדשים, כדי שאף אחד לא יישלף פעמיים
    await Promise.all(inFlight)
    if (hadFailure) break // לא יורים על קיר; ננסה שוב בטיק הבא
  }
  return { sent, failed }
}

async function optedOutEmails(db: SupabaseClient, emails: string[]): Promise<Set<string>> {
  const lower = [...new Set(emails.map(e => e.trim().toLowerCase()))]
  if (!lower.length) return new Set()
  const { data } = await db.from('unsubscribes').select('email').in('email', lower)
  return new Set((data ?? []).map((r: { email: string }) => r.email.trim().toLowerCase()))
}

async function finalize(db: SupabaseClient, issueId: string) {
  const { count } = await db.from('gilyonot_deliveries').select('id', { count: 'exact', head: true }).eq('issue_id', issueId)
  const now = new Date().toISOString()
  await db.from('gilyonot_issues')
    .update({ status: 'sent', completed_at: now, updated_at: now, total_count: count ?? 0 })
    .eq('id', issueId).eq('status', 'sending')
  console.log(`[gilyonot] גיליון ${issueId} נשלח · ${count ?? 0} נמענים`)
}

export const ISSUE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function loadIssue(db: SupabaseClient, id: string): Promise<IssueRow | null> {
  if (!ISSUE_ID_RE.test(id)) return null
  const { data } = await db.from('gilyonot_issues').select('*').eq('id', id).maybeSingle()
  return (data as IssueRow | null) ?? null
}

/** טוקן לדוגמה למייל ניסיון לכתובת שאינה ברשימות. הקישור מוביל ל"קישור לא תקין" ולא מסיר אף אחד. */
export const SAMPLE_UNSUBSCRIBE_TOKEN = '00000000-0000-0000-0000-000000000000'

/** קישור ההסרה במייל הניסיון: הקישור האמיתי של הנמען אם הוא מנוי או קיבל גיליון, אחרת לדוגמה. */
async function testUnsubscribeUrl(db: SupabaseClient, to: string): Promise<string> {
  const email = to.trim().toLowerCase()
  const { data: sub } = await db.from('gilyonot_subscribers').select('token').eq('email', email).maybeSingle()
  if (sub?.token) return gilyonotUrls.unsubscribe(sub.token as string)
  const { data: del } = await db.from('gilyonot_deliveries').select('token').eq('email', email).limit(1).maybeSingle()
  if (del?.token) return gilyonotUrls.optout(del.token as string)
  return gilyonotUrls.unsubscribe(SAMPLE_UNSUBSCRIBE_TOKEN)
}
