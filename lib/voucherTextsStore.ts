import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// מאגר טקסטים עריכים לשוברי היולדות (כרטיס מזון / בית החלמה / דף הנחיות).
//
// גישת overrides: כל טקסט קבוע נשאר כברירת מחדל *בקוד*, ועובר דרך vtext(key,
// default). אם קיים override ב-DB (app_settings.voucher_texts) — הוא גובר.
// כך אף literal לא נמחק, הלייאאוט לא נשבר, והמנהל יכול לערוך כל טקסט.
//
// המבנה שטוח: Record<key, string>. הטקסטים הם plain-text (הולכים ל-pdf-lib),
// ולכן — בשונה מטקסטי המייל — *אין* להסיר תגי HTML בשמירה.
// ─────────────────────────────────────────────────────────────────────────────

export const VOUCHER_TEXTS_KEY = 'voucher_texts'

let cache: Record<string, string> = {}
let loaded = false
let fetchedAt = 0
let loading: Promise<void> | null = null
const TTL_MS = 10_000

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** טוען את הטקסטים למטמון (בטוח לקריאה מרובה). */
export async function loadVoucherTexts(): Promise<void> {
  if (loaded && Date.now() - fetchedAt < TTL_MS) return
  if (loading) return loading
  loading = (async () => {
    try {
      const db = admin()
      if (!db) return
      const { data } = await db.from('app_settings').select('value').eq('key', VOUCHER_TEXTS_KEY).maybeSingle()
      cache = data?.value ? JSON.parse(String(data.value)) : {}
      loaded = true
      fetchedAt = Date.now()
    } catch (e) {
      console.error('[voucherTexts] טעינה נכשלה — נעשה שימוש בברירות המחדל:', e)
    } finally { loading = null }
  })()
  return loading
}

/** מחזיר את הטקסט הערוך אם קיים ולא-ריק, אחרת את ברירת המחדל שבקוד. */
export function vtext(key: string, fallback: string): string {
  const v = cache[key]
  return typeof v === 'string' && v.trim() ? v : fallback
}

/** המפה הגולמית — לצורכי תצוגה/עריכה בממשק. */
export function getVoucherTextsCache(): Record<string, string> {
  return { ...cache }
}

/** רענון מיידי של המטמון אחרי שמירה (באותו תהליך). */
export function setVoucherTextsCache(next: Record<string, string>): void {
  cache = { ...next }
  loaded = true
  fetchedAt = Date.now()
}

/** קריאה מה-DB של המפה הגולמית (למסך העריכה). */
export async function fetchVoucherTexts(): Promise<Record<string, string>> {
  const db = admin()
  if (!db) return {}
  const { data } = await db.from('app_settings').select('value').eq('key', VOUCHER_TEXTS_KEY).maybeSingle()
  return data?.value ? JSON.parse(String(data.value)) : {}
}

/** שמירה + רענון מטמון. */
export async function saveVoucherTexts(next: Record<string, string>): Promise<boolean> {
  const db = admin()
  if (!db) return false
  const { error } = await db.from('app_settings').upsert(
    { key: VOUCHER_TEXTS_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) { console.error('[voucherTexts] שמירה נכשלה:', error); return false }
  setVoucherTextsCache(next)
  return true
}
