import { Resend } from 'resend'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mailFor, type DepartmentKey } from '../departments'
import { applyMerge } from './merge'
import { buildCampaignHtml, type Block } from './blocks'
import { unsubscribeUrl } from '../unsubscribe'
import { isBlockedForMail } from '../jewishCalendar'
import type { SegmentDef as SegmentDefType } from './segments'

// ─────────────────────────────────────────────────────────────────────────────
// מנוע השליחה.
//
// Resend מגביל 2 בקשות לשנייה, ו-Batch API שולח עד 100 מיילים בבקשה אחת.
// לולאה נאיבית של אלפי מיילים פשוט תיחסם — לכן: batch + throttle.
//
// חסינות: אם השרת נופל באמצע, ה-worker ממשיך מהשורות שנשארו 'pending'.
// אפס כפילויות (unique index על campaign_id+email), אפס אובדן.
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 100          // תקרת Resend Batch API
const REQUESTS_PER_SEC = 2      // תקרת Resend
const THROTTLE_MS = 1000 / REQUESTS_PER_SEC
const MAX_ATTEMPTS = 3
const MAX_BATCHES_PER_TICK = 20 // ~2,000 מיילים בריצה; השאר בטיק הבא
const LOCK_KEY = 771122334      // advisory lock — מונע ריצה כפולה
const REPLY_DOMAIN = 'chasamsofer.info'

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface CampaignRow {
  id: string
  subject: string
  preheader: string | null
  name: string
  from_department: string
  content: Block[]
  content_mode: 'blocks' | 'html'
  raw_html: string | null
  status: string
}

interface RecipientRow {
  id: string
  email: string
  merge_data: Record<string, string>
  attempts: number
}

/**
 * ה-worker. נקרא כל דקה מ-instrumentation.ts.
 * שולח את הקמפיינים שבסטטוס 'sending'.
 */
export async function runCampaignSender(): Promise<{ sent: number; failed: number }> {
  const empty = { sent: 0, failed: 0 }
  const db = adminClient()
  if (!db) return empty

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) { console.error('[newsletter] RESEND_API_KEY חסר'); return empty }

  // מנעול — אם Railway מריץ שתי מכונות, רק אחת שולחת
  const { data: gotLock } = await db.rpc('try_worker_lock', { p_key: LOCK_KEY })
  if (gotLock === false) return empty

  let sent = 0, failed = 0

  try {
    // קמפיינים מתוזמנים שהגיע מועדם → מעבירים ל-'sending'.
    // לא שולחים בשבת/חג — הקמפיין פשוט ימתין לטיק הבא ביום חול.
    if (!isBlockedForMail(new Date())) {
      const { data: due } = await db
        .from('campaigns')
        .select('id')
        .eq('status', 'scheduled')
        .lte('scheduled_at', new Date().toISOString())

      for (const c of due ?? []) {
        const started = await startScheduledCampaign(db, String(c.id))
        if (!started) continue
      }
    }

    const { data: campaigns } = await db
      .from('campaigns')
      .select('*')
      .eq('status', 'sending')
      .order('started_at')

    for (const campaign of (campaigns ?? []) as CampaignRow[]) {
      const res = await sendCampaignBatches(db, apiKey, campaign)
      sent += res.sent
      failed += res.failed
    }
  } catch (err) {
    console.error('[newsletter] worker failed', err)
  } finally {
    await db.rpc('release_worker_lock', { p_key: LOCK_KEY })
  }

  return { sent, failed }
}

/**
 * מפעיל קמפיין מתוזמן שהגיע מועדו.
 * מממש את הקהל (הקפאת הרשימה) ומעביר ל-'sending'.
 */
async function startScheduledCampaign(db: SupabaseClient, id: string): Promise<boolean> {
  try {
    const { data: campaign } = await db
      .from('campaigns')
      .select('id, segment, status')
      .eq('id', id)
      .maybeSingle()

    // מירוץ: ייתכן שמכונה אחרת כבר הרימה אותו
    if (!campaign || campaign.status !== 'scheduled') return false

    const { resolveSegment } = await import('./segments')
    const { recipients } = await resolveSegment(db, (campaign.segment ?? {}) as SegmentDefType)

    if (!recipients.length) {
      await db.from('campaigns').update({
        status: 'failed',
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      console.error(`[newsletter] קמפיין מתוזמן ${id} — אין נמענים`)
      return false
    }

    // מימוש הקהל — הרשימה מוקפאת ברגע השליחה
    await db.from('campaign_recipients').delete().eq('campaign_id', id)

    for (let i = 0; i < recipients.length; i += 500) {
      const chunk = recipients.slice(i, i + 500).map(r => ({
        campaign_id: id,
        beneficiary_id: r.beneficiaryId,
        email: r.email,
        merge_data: r.mergeData,
        status: 'pending',
      }))
      await db.from('campaign_recipients')
        .upsert(chunk, { onConflict: 'campaign_id,email', ignoreDuplicates: true })
    }

    await db.from('campaigns').update({
      status: 'sending',
      started_at: new Date().toISOString(),
      total_count: recipients.length,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    console.log(`[newsletter] קמפיין מתוזמן ${id} הופעל · ${recipients.length} נמענים`)
    return true
  } catch (err) {
    console.error(`[newsletter] הפעלת קמפיין מתוזמן ${id} נכשלה:`, err)
    return false
  }
}

async function sendCampaignBatches(
  db: SupabaseClient,
  apiKey: string,
  campaign: CampaignRow,
): Promise<{ sent: number; failed: number }> {
  const resend = new Resend(apiKey)
  const dept = mailFor((campaign.from_department as DepartmentKey) ?? 'main')

  let sent = 0, failed = 0

  for (let batchNum = 0; batchNum < MAX_BATCHES_PER_TICK; batchNum++) {
    // עצירה ידנית באמצע — מכבדים מיד
    const { data: fresh } = await db
      .from('campaigns').select('status').eq('id', campaign.id).maybeSingle()
    if (fresh?.status !== 'sending') break

    const { data: batch } = await db
      .from('campaign_recipients')
      .select('id, email, merge_data, attempts')
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending')
      .limit(BATCH_SIZE)

    const recipients = (batch ?? []) as RecipientRow[]

    // אין עוד נמענים — הקמפיין הושלם
    if (!recipients.length) {
      await finalizeCampaign(db, campaign.id)
      break
    }

    // בניית המיילים — כל אחד עם המשתנים שלו
    const payload = recipients.map(r => {
      const unsubUrl = unsubscribeUrl(r.email, campaign.id)
      const data = { ...r.merge_data, 'קישור_הסרה': unsubUrl }

      const html = buildCampaignHtml({
        preheader: applyMerge(campaign.preheader ?? '', data, true),
        blocks: campaign.content,
        rawHtml: campaign.raw_html ?? undefined,
        mode: campaign.content_mode,
        unsubscribeUrl: unsubUrl,
      })

      return {
        from: `${dept.fromName} <${dept.fromEmail}>`,
        to: r.email,
        // בנושא לא מנטרלים HTML — זה טקסט רגיל
        subject: applyMerge(campaign.subject, data, false),
        html: applyMerge(html, data, true),
        // plus-addressing עם 8 התווים הראשונים של מזהה הקמפיין —
        // כך תגובה חוזרת מזוהה ומקושרת לקמפיין. (כתובת קצרה; מזהה מלא
        // היה חורג מהאורך ש-Resend מקבל.)
        replyTo: `office+c${campaign.id.replace(/-/g, '').slice(0, 8)}@${REPLY_DOMAIN}`,
        // מעקב פתיחות וקליקים — בלי זה Resend לא מזריק פיקסל ולא עוטף
        // קישורים, ולכן לא נשלחים אירועי opened/clicked ל-webhook.
        tracking: { open: true, click: true },
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }
    })

    try {
      // Batch API — עד 100 מיילים בבקשה אחת
      const { data: result, error } = await resend.batch.send(payload)

      if (error) throw new Error(String(error.message ?? error))

      // שמירת resend_id לכל נמען — המפתח לכל המעקב
      const ids = (result?.data ?? []) as { id?: string }[]
      const nowIso = new Date().toISOString()

      await Promise.all(recipients.map((r, i) =>
        db.from('campaign_recipients').update({
          status: 'sent',
          resend_id: ids[i]?.id ?? null,
          sent_at: nowIso,
          attempts: r.attempts + 1,
        }).eq('id', r.id),
      ))

      sent += recipients.length
      await db.rpc('bump_campaign_sent', { p_campaign: campaign.id, p_delta: recipients.length })
        .then(() => {}, () => {}) // אם ה-RPC לא קיים — לא נופלים

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[newsletter] batch failed (${campaign.id}):`, msg)

      // כשל בבatch — כל נמען מקבל attempt, ומי שמיצה עובר ל-failed
      await Promise.all(recipients.map(r => {
        const attempts = r.attempts + 1
        return db.from('campaign_recipients').update({
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          error: msg.slice(0, 300),
        }).eq('id', r.id)
      }))

      failed += recipients.length
      // לא ממשיכים לירות על קיר — יוצאים ונחזור בטיק הבא
      break
    }

    // כיבוד תקרת הקצב של Resend
    await sleep(THROTTLE_MS)
  }

  return { sent, failed }
}

// סימון הקמפיין כהושלם + עדכון המונים מהמצב האמיתי ב-DB
async function finalizeCampaign(db: SupabaseClient, campaignId: string): Promise<void> {
  const [{ count: sentCount }, { count: failedCount }] = await Promise.all([
    db.from('campaign_recipients').select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId).eq('status', 'sent'),
    db.from('campaign_recipients').select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId).eq('status', 'failed'),
  ])

  await db.from('campaigns').update({
    status: 'sent',
    completed_at: new Date().toISOString(),
    sent_count: sentCount ?? 0,
    failed_count: failedCount ?? 0,
    updated_at: new Date().toISOString(),
  }).eq('id', campaignId)

  console.log(`[newsletter] קמפיין ${campaignId} הושלם · נשלחו ${sentCount} · נכשלו ${failedCount}`)
}
