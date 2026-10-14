import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from './apiAuth'
import { isBlockedForMail } from './jewishCalendar'
import { GILYONOT_FROM_EMAIL, GILYONOT_FROM_NAME } from './gilyonot'
import { buildGilyonHtml, gilyonotUrls } from './gilyonotMail'

// ─────────────────────────────────────────────────────────────────────────────
// שליחת הגיליון השבועי לרשימת התפוצה, באותה שיטה כמו מנוע הניוזלטר
// (lib/newsletter/sender.ts): Resend Batch של עד 100 מיילים, 2 בקשות בשנייה,
// נעילה נגד ריצה כפולה, והמשך מהשורות שנשארו pending אם השרת נפל באמצע.
//
// המעקב שלנו: פיקסל (/api/gilyonot/o) וקישור הורדה (/api/gilyonot/d) עם טוקן
// לכל נמען. המעקב של Resend כבוי, כדי שהקישורים לא ייעטפו ושהמונים יהיו שלנו.
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 100
const THROTTLE_MS = 500
const MAX_ATTEMPTS = 3
const MAX_BATCHES_PER_TICK = 20
const LOCK_KEY = 771122335 // שונה מהניוזלטר (771122334)
const PAGE = 1000

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const from = () => `${GILYONOT_FROM_NAME} <${GILYONOT_FROM_EMAIL}>`

export interface IssueRow {
  id: string
  title: string
  parasha: string
  subject: string
  intro: string | null
  file_path: string
  file_name: string
  status: 'draft' | 'sending' | 'sent'
}

interface DeliveryRow {
  id: string
  email: string
  token: string
  attempts: number
  gilyonot_subscribers: { full_name: string | null; token: string; status: string } | null
}

/** המייל עצמו לנמען אחד. גם התצוגה המקדימה משתמשת בזה (עם טוקנים לדוגמה). */
export function issueEmail(issue: Pick<IssueRow, 'title' | 'parasha' | 'intro'>, r: { name: string | null; deliveryToken: string; subscriberToken: string | null }) {
  const unsubscribeUrl = r.subscriberToken ? gilyonotUrls.unsubscribe(r.subscriberToken) : null
  return {
    html: buildGilyonHtml({
      title: issue.title, parasha: issue.parasha, intro: issue.intro, name: r.name,
      downloadUrl: gilyonotUrls.download(r.deliveryToken),
      unsubscribeUrl,
      pixelUrl: gilyonotUrls.pixel(r.deliveryToken),
    }),
    unsubscribeUrl,
  }
}

/** מייל ניסיון לכתובת אחת. קישור ההורדה הוא קישור חתום ישיר, בלי מעקב ובלי פיקסל. */
export async function sendGilyonTest(db: SupabaseClient, issue: IssueRow, to: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY לא מוגדר בשרת' }
  const { data: signed } = await db.storage.from('documents').createSignedUrl(issue.file_path, 60 * 60 * 24 * 7, { download: issue.file_name })
  if (!signed?.signedUrl) return { ok: false, error: 'הקובץ לא נמצא באחסון' }
  const html = buildGilyonHtml({ title: issue.title, parasha: issue.parasha, intro: issue.intro, name: null, downloadUrl: signed.signedUrl, unsubscribeUrl: null })
  const { error } = await new Resend(apiKey).emails.send({ from: from(), to, subject: `[ניסיון] ${issue.subject}`, html })
  if (error) return { ok: false, error: String(error.message ?? error) }
  return { ok: true }
}

/**
 * מקפיא את הרשימה: שורת משלוח לכל נרשם פעיל, ומעביר את הגיליון ל-'sending'.
 * ה-worker ישלח בטיק הקרוב. מחזיר את מספר הנמענים.
 */
export async function startIssueSend(db: SupabaseClient, issueId: string): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  // נעילה אופטימית: רק טיוטה עוברת לשליחה, כך שלחיצה כפולה לא מכפילה
  const { data: claimed, error: claimErr } = await db.from('gilyonot_issues')
    .update({ status: 'sending', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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
  for (let n = 0; n < MAX_BATCHES_PER_TICK; n++) {
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

    const payload = batch.map(d => {
      const { html, unsubscribeUrl } = issueEmail(issue, {
        name: d.gilyonot_subscribers?.full_name ?? null,
        deliveryToken: d.token,
        subscriberToken: d.gilyonot_subscribers?.token ?? null,
      })
      return {
        from: from(),
        to: d.email,
        subject: issue.subject,
        html,
        tracking: { open: false, click: false },
        headers: unsubscribeUrl
          ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
          : undefined,
      }
    })

    try {
      const { data: result, error } = await resend.batch.send(payload)
      if (error) throw new Error(String(error.message ?? error))
      const ids = (result?.data ?? []) as { id?: string }[]
      const now = new Date().toISOString()
      await Promise.all(batch.map((d, i) => db.from('gilyonot_deliveries')
        .update({ status: 'sent', resend_id: ids[i]?.id ?? null, sent_at: now, attempts: d.attempts + 1, error: null })
        .eq('id', d.id)))
      sent += batch.length
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[gilyonot] batch failed (${issue.id}):`, msg)
      await Promise.all(batch.map(d => {
        const attempts = d.attempts + 1
        return db.from('gilyonot_deliveries')
          .update({ attempts, status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', error: msg.slice(0, 300) })
          .eq('id', d.id)
      }))
      failed += batch.length
      break // לא ממשיכים לירות על קיר; ננסה שוב בטיק הבא
    }
    await sleep(THROTTLE_MS)
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
