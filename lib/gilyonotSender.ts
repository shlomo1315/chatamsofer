import { gilyonFileName } from './gilyonotFileName'
import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from './apiAuth'
import { isBlockedForMail } from './jewishCalendar'
import { GILYONOT_FROM_EMAIL, GILYONOT_FROM_NAME } from './gilyonot'
import { buildGilyonHtml, gilyonotUrls } from './gilyonotMail'
import { sanitizeMailHtml } from './gilyonotRichHtml'

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
const THROTTLE_MS = 1000 // שתי שליחות במקביל, ואז שנייה
const MAX_ATTEMPTS = 3
const TICK_BUDGET_MS = 50_000 // ה-worker רץ כל דקה, עם נעילה
/** מגבלת Resend: 40MB למייל אחרי קידוד base64 (גדל ב-33%) */
export const RESEND_MAX_BYTES = 40 * 1024 * 1024
const LOCK_KEY = 771122335 // שונה מהניוזלטר (771122334)
const PAGE = 1000

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
  status: 'draft' | 'sending' | 'sent'
  /** 'link' = קישור הורדה שנספר; 'attachment' = גיליונות ישנים עם קובץ מצורף (אין נתוני הורדות) */
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

type MailFields = Pick<IssueRow, 'title' | 'parasha' | 'intro' | 'body_html' | 'design'>

/** המייל עצמו לנמען אחד. גם התצוגה המקדימה משתמשת בזה (עם טוקנים לדוגמה). */
export function issueEmail(issue: MailFields, r: { deliveryToken: string; subscriberToken: string | null }) {
  const unsubscribeUrl = r.subscriberToken ? gilyonotUrls.unsubscribe(r.subscriberToken) : null
  return {
    html: buildGilyonHtml({
      title: issue.title, parasha: issue.parasha, intro: issue.intro,
      bodyHtml: cleanBody(issue.body_html), design: issue.design,
      unsubscribeUrl,
      pixelUrl: gilyonotUrls.pixel(r.deliveryToken),
      downloadUrl: gilyonotUrls.download(r.deliveryToken),
    }),
    unsubscribeUrl,
  }
}

/** מייל ניסיון לכתובת אחת: כפתור ההורדה מוביל ישר לקובץ (בלי ספירה), בלי פיקסל. */
export async function sendGilyonTest(db: SupabaseClient, issue: IssueRow, to: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY לא מוגדר בשרת' }
  const file = await checkIssueFile(db, issue)
  if (!file.ok) return file
  const html = buildGilyonHtml({
    title: issue.title, parasha: issue.parasha, intro: issue.intro, bodyHtml: cleanBody(issue.body_html), design: issue.design,
    unsubscribeUrl: null, downloadUrl: file.url,
  })
  const { error } = await new Resend(apiKey).emails.send({ from: from(), to, subject: `[ניסיון] ${issue.subject}`, html, text: htmlToPlainText(html), replyTo: GILYONOT_FROM_EMAIL })
  if (error) return { ok: false, error: String(error.message ?? error) }
  return { ok: true }
}

/**
 * מקפיא את הרשימה: שורת משלוח לכל נרשם פעיל, ומעביר את הגיליון ל-'sending'.
 * ה-worker ישלח בטיק הקרוב. מחזיר את מספר הנמענים.
 */
export async function startIssueSend(db: SupabaseClient, issueId: string): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const { data: row } = await db.from('gilyonot_issues').select('title, parasha, file_path, file_name').eq('id', issueId).maybeSingle()
  if (!row) return { ok: false, error: 'הגיליון לא נמצא' }
  const file = await checkIssueFile(db, row as Pick<IssueRow, 'title' | 'parasha' | 'file_path' | 'file_name'>)
  if (!file.ok) return file
  // נעילה אופטימית: רק טיוטה עוברת לשליחה, כך שלחיצה כפולה לא מכפילה
  const { data: claimed, error: claimErr } = await db.from('gilyonot_issues')
    .update({ status: 'sending', delivery_mode: 'link', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', issueId).eq('status', 'draft').select('id').maybeSingle()
  if (claimErr) return { ok: false, error: 'עדכון הגיליון נכשל' }
  if (!claimed) return { ok: false, error: 'הגיליון כבר נשלח או בשליחה' }

  let total = 0
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.from('gilyonot_subscribers').select('id, email')
      .eq('status', 'active').order('created_at').range(offset, offset + PAGE - 1)
    if (error) {
      await db.from('gilyonot_issues').update({ status: 'draft', started_at: null }).eq('id', issueId)
      return { ok: false, error: 'טעינת רשימת התפוצה נכשלה' }
    }
    const rows = data ?? []
    if (rows.length) {
      const { error: insErr } = await db.from('gilyonot_deliveries').upsert(
        rows.map(s => ({ issue_id: issueId, subscriber_id: s.id, email: s.email })),
        { onConflict: 'issue_id,email', ignoreDuplicates: true },
      )
      if (insErr) {
        await db.from('gilyonot_deliveries').delete().eq('issue_id', issueId)
        await db.from('gilyonot_issues').update({ status: 'draft', started_at: null }).eq('id', issueId)
        return { ok: false, error: 'הכנת רשימת הנמענים נכשלה' }
      }
      total += rows.length
    }
    if (rows.length < PAGE) break
  }

  if (!total) {
    await db.from('gilyonot_issues').update({ status: 'draft', started_at: null }).eq('id', issueId)
    return { ok: false, error: 'אין נרשמים פעילים ברשימה' }
  }
  await db.from('gilyonot_issues').update({ total_count: total }).eq('id', issueId)
  return { ok: true, total }
}

/** ה-worker. נקרא כל דקה מ-instrumentation.ts. */
export async function runGilyonotSender(): Promise<{ sent: number; failed: number }> {
  const empty = { sent: 0, failed: 0 }
  // לא שולחים בשבת ובחג: הגיליון ממתין לטיק הבא ביום חול
  if (isBlockedForMail(new Date())) return empty
  const db = getServiceClient()
  if (!db) return empty
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return empty

  const { data: issues } = await db.from('gilyonot_issues').select('*').eq('status', 'sending').order('started_at')
  if (!issues?.length) return empty

  const { data: gotLock } = await db.rpc('try_worker_lock', { p_key: LOCK_KEY })
  if (gotLock === false) return empty

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
  const file = await checkIssueFile(db, issue)
  if (!file.ok) {
    console.error(`[gilyonot] ${issue.id}: ${file.error}`)
    return { sent, failed }
  }

  while (Date.now() < deadline) {
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
    if (!batch.length) { await finalize(db, issue.id); break }

    let hadFailure = false
    for (let i = 0; i < batch.length && Date.now() < deadline && !hadFailure; i += 2) {
      const results = await Promise.all(batch.slice(i, i + 2).map(async d => {
        const { html, unsubscribeUrl } = issueEmail(issue, {
          deliveryToken: d.token,
          subscriberToken: d.gilyonot_subscribers?.token ?? null,
        })
        try {
          const { data: res, error } = await resend.emails.send({
            from: from(), to: d.email, subject: issue.subject, html, text: htmlToPlainText(html), replyTo: GILYONOT_FROM_EMAIL,
            headers: unsubscribeUrl
              ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
              : undefined,
          })
          if (error) throw new Error(String(error.message ?? error))
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
      }))
      for (const ok of results) { if (ok) sent++; else { failed++; hadFailure = true } }
      await sleep(THROTTLE_MS)
    }
    if (hadFailure) break // לא יורים על קיר; ננסה שוב בטיק הבא
  }
  return { sent, failed }
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
