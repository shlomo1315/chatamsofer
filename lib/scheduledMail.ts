import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isBlockedForMail, nextAllowedSendTime } from './jewishCalendar'

// ─────────────────────────────────────────────────────────────────────────────
// תור מיילים מתוזמנים.
// מי שרוצה "שלח מייל בעוד N ימים" קורא ל-scheduleEmail, וה-worker
// (runScheduledMail, נקרא כל שעה מ-instrumentation.ts) שולח כשמגיע הזמן.
// ─────────────────────────────────────────────────────────────────────────────

export type ScheduledKind =
  | 'gratitude_letter'          // בקשת מכתב ברכה — 10 ימים אחרי אישור הלידה
  | 'gratitude_reminder'        // תזכורת — יומיים אחרי, אם עדיין לא הגיע מכתב
  | 'recovery_survey'           // בקשת משוב — 5 ימים אחרי סימון ההגעה

export interface EntityKey {
  kind: ScheduledKind
  entityTable: string
  entityId: string
}

export interface ScheduleInput extends EntityKey {
  toEmail: string | null | undefined
  sendAfter: Date
  payload?: Record<string, unknown>
}

export interface ScheduledJob {
  id: string
  kind: string
  entity_table: string
  entity_id: string
  to_email: string
  attempts: number
  payload: Record<string, unknown>
}

const MAX_ATTEMPTS = 3
const BATCH_SIZE = 50
const LOCK_KEY = 918273645 // מזהה שרירותי, ייחודי ל-worker הזה

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * מתזמן מייל. אם כבר קיים מייל מאותו סוג לאותה ישות:
 *   • 'sent'      — לא נוגעים (לעולם לא שולחים פעמיים)
 *   • 'cancelled' — מוחזר ל-'pending' עם מועד חדש
 *   • 'pending'   — מעדכנים את המועד
 *
 * מוטבת ללא כתובת מייל — דילוג שקט. הפונקציה לעולם לא זורקת, כדי שלא
 * תשבור זרימות קיימות (אישור לידה, סימון הגעה) שקוראות לה.
 */
export async function scheduleEmail(input: ScheduleInput): Promise<void> {
  try {
    const email = (input.toEmail ?? '').trim()
    if (!email || !email.includes('@')) {
      console.warn(`[scheduled-mail] דילוג — אין כתובת מייל (${input.kind}/${input.entityId})`)
      return
    }
    const db = adminClient()
    if (!db) { console.error('[scheduled-mail] אין service-role client'); return }

    const sendAfter = nextAllowedSendTime(input.sendAfter)

    // לא דורסים מייל שכבר נשלח
    const { data: existing } = await db
      .from('scheduled_emails')
      .select('id, status')
      .eq('kind', input.kind)
      .eq('entity_table', input.entityTable)
      .eq('entity_id', input.entityId)
      .maybeSingle()

    if (existing?.status === 'sent') return

    const { error } = await db.from('scheduled_emails').upsert({
      kind: input.kind,
      entity_table: input.entityTable,
      entity_id: input.entityId,
      to_email: email,
      send_after: sendAfter.toISOString(),
      status: 'pending',
      attempts: 0,
      last_error: null,
      payload: input.payload ?? {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'kind,entity_table,entity_id' })

    if (error) console.error('[scheduled-mail] scheduleEmail:', error.message)
  } catch (err) {
    console.error('[scheduled-mail] scheduleEmail threw:', err)
  }
}

/**
 * מבטל את תזכורת מכתב הברכה — נקרא ברגע שהמכתב מתקבל,
 * מכל מסלול (טופס, מייל, סריקה).
 *
 * (התזכורת גם בודקת בעצמה לפני השליחה, אבל ביטול מיידי נקי יותר
 * ומונע תזכורת שנשלחת בטעות אם הבדיקה נכשלת.)
 */
export async function cancelGratitudeReminder(aidId: string): Promise<void> {
  await cancelScheduledEmail({
    kind: 'gratitude_reminder',
    entityTable: 'maternity_aids',
    entityId: aidId,
  })
}

/** מבטל מייל שטרם נשלח. מייל שכבר נשלח — לא מושפע. */
export async function cancelScheduledEmail(key: EntityKey): Promise<void> {
  try {
    const db = adminClient()
    if (!db) return
    const { error } = await db
      .from('scheduled_emails')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('kind', key.kind)
      .eq('entity_table', key.entityTable)
      .eq('entity_id', key.entityId)
      .eq('status', 'pending')
    if (error) console.error('[scheduled-mail] cancel:', error.message)
  } catch (err) {
    console.error('[scheduled-mail] cancel threw:', err)
  }
}

/**
 * ה-worker. נקרא כל שעה מ-instrumentation.ts.
 * מוגן ב-advisory lock — אם Railway מריץ שתי מכונות, רק אחת שולחת.
 */
export async function runScheduledMail(): Promise<{ sent: number; failed: number; skipped: number }> {
  const empty = { sent: 0, failed: 0, skipped: 0 }
  const db = adminClient()
  if (!db) return empty

  // בטיחות עליונה: לעולם לא שולחים בשבת/חג — גם אם השרת היה למטה
  // והתעורר בזמן אסור, ו-send_after כבר עבר.
  if (isBlockedForMail(new Date())) return empty

  const { data: gotLock } = await db.rpc('try_worker_lock', { p_key: LOCK_KEY })
  if (gotLock === false) return empty

  let sent = 0, failed = 0, skipped = 0
  try {
    const { data: due } = await db
      .from('scheduled_emails')
      .select('*')
      .eq('status', 'pending')
      .lte('send_after', new Date().toISOString())
      .limit(BATCH_SIZE)

    const { sendScheduled } = await import('./scheduledMailSenders')

    for (const job of (due ?? []) as ScheduledJob[]) {
      try {
        const result = await sendScheduled(db, job)

        if (result.outcome === 'sent') {
          await db.from('scheduled_emails').update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', job.id)
          sent++
        } else if (result.outcome === 'cancelled') {
          // הישות כבר לא רלוונטית (לידה בוטלה / סימון ההגעה בוטל / לידה שקטה)
          await db.from('scheduled_emails').update({
            status: 'cancelled',
            last_error: result.reason ?? null,
            updated_at: new Date().toISOString(),
          }).eq('id', job.id)
          skipped++
        } else {
          throw new Error(result.reason ?? 'שליחה נכשלה')
        }
      } catch (err) {
        const attempts = (job.attempts ?? 0) + 1
        await db.from('scheduled_emails').update({
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          last_error: String(err instanceof Error ? err.message : err).slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq('id', job.id)
        failed++
      }
    }
  } catch (err) {
    console.error('[scheduled-mail] worker failed', err)
  } finally {
    await db.rpc('release_worker_lock', { p_key: LOCK_KEY })
  }

  return { sent, failed, skipped }
}
