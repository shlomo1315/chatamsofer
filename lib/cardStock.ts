import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/apiAuth'

// ─── מלאי כרטיסי מזון גלובלי ───────────────────────────────────────────────
// מלאי אחד לכל המערכת (לא לפי מוקד). המלאי = SUM(delta) ביומן card_stock_ledger.
// אישור לידה מנכה כרטיס אחד (אטומי); הוספת מלאי / הורדה ידנית = תנועות מפורשות.

const ALERT_KEY = 'card_stock_alert'
export const DEFAULT_ALERT_THRESHOLD = 30

// ספי התראה מרובים — נשלחת התראה בכל פעם שהמלאי חוצה כלפי מטה אחד מהספים.
export type StockAlertSettings = { thresholds: number[]; emails: string[] }

// המלאי הנוכחי (סכום כל התנועות). null אם אין חיבור.
export async function getStockBalance(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from('card_stock_balance').select('balance').maybeSingle()
  return Number(data?.balance ?? 0)
}

// ניכוי אטומי של כרטיס אחד. מחזיר את המלאי שנותר, או null אם אין מלאי (לא נוכה).
export async function consumeOneCard(
  admin: SupabaseClient,
  opts: { reason: 'birth_approval' | 'auto_assign'; aidId?: string | null; note?: string; by?: string | null },
): Promise<number | null> {
  const { data, error } = await admin.rpc('consume_card_stock', {
    p_reason: opts.reason,
    p_aid_id: opts.aidId ?? null,
    p_note: opts.note ?? null,
    p_by: opts.by ?? null,
  })
  if (error) throw new Error(error.message)
  return data == null ? null : Number(data)
}

// תנועת מלאי מפורשת (הוספה / הורדה ידנית / התאמה). delta חיובי=הוספה, שלילי=הורדה.
export async function addStockMovement(
  admin: SupabaseClient,
  opts: { delta: number; reason: 'restock' | 'manual_out' | 'adjust'; aidId?: string | null; note?: string; by?: string | null },
): Promise<number> {
  const { error } = await admin.from('card_stock_ledger').insert({
    delta: opts.delta, reason: opts.reason, aid_id: opts.aidId ?? null,
    note: opts.note ?? null, created_by: opts.by ?? null,
  })
  if (error) throw new Error(error.message)
  return getStockBalance(admin)
}

// ─── הגדרות התראה (סף + מיילים) ─────────────────────────────────────────────
export async function getAlertSettings(admin?: SupabaseClient): Promise<StockAlertSettings> {
  const client = admin ?? getServiceClient()
  if (!client) return { thresholds: [DEFAULT_ALERT_THRESHOLD], emails: [] }
  const { data } = await client.from('app_settings').select('value').eq('key', ALERT_KEY).maybeSingle()
  if (data?.value) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = JSON.parse(data.value) as any
      // תמיכה אחורה: פורמט ישן { threshold: number } → מומר לרשימה
      let thresholds: number[] = []
      if (Array.isArray(v.thresholds)) thresholds = v.thresholds.map(Number).filter((n: number) => Number.isFinite(n) && n >= 0)
      else if (Number.isFinite(Number(v.threshold))) thresholds = [Number(v.threshold)]
      if (!thresholds.length) thresholds = [DEFAULT_ALERT_THRESHOLD]
      // ייחודי + ממוין יורד (הסף הגבוה מתריע קודם)
      thresholds = [...new Set(thresholds)].sort((a, b) => b - a)
      return {
        thresholds,
        emails: Array.isArray(v.emails) ? v.emails.filter((e: unknown) => typeof e === 'string' && e.trim()) : [],
      }
    } catch { /* value אינו JSON */ }
  }
  return { thresholds: [DEFAULT_ALERT_THRESHOLD], emails: [] }
}

export async function saveAlertSettings(admin: SupabaseClient, s: StockAlertSettings): Promise<boolean> {
  const { error } = await admin.from('app_settings').upsert(
    { key: ALERT_KEY, value: JSON.stringify(s), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return !error
}
