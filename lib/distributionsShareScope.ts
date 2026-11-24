import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// היקף דף השיתוף /shared/distributions: "חלוקות חגים בלבד" או כל המחלקות.
//
// 🔴 זמני ולכן מתג ולא מחיקה: כשההגדרה פעילה השרת לא מחזיר נתוני עזר
// יולדות, ספירת צאצאים או עץ הדורות, והדף מציג רק את חלוקות החגים.
// ⚠️ ברירת המחדל (אין שורה במסד) היא "חגים בלבד".
// ─────────────────────────────────────────────────────────────────────────────

export const HOLIDAYS_ONLY_KEY = 'distributions_share_holidays_only'

export function parseHolidaysOnly(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase() !== 'false'
}

export async function getHolidaysOnly(admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin.from('app_settings').select('value').eq('key', HOLIDAYS_ONLY_KEY).maybeSingle()
  return parseHolidaysOnly(data?.value)
}

export async function setHolidaysOnly(admin: SupabaseClient, on: boolean): Promise<void> {
  const { error } = await admin.from('app_settings').upsert(
    { key: HOLIDAYS_ONLY_KEY, value: on ? 'true' : 'false', updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) throw new Error(error.message)
}
