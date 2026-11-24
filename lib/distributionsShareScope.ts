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

// ── מועד סגירת הרישום לשעון העצר בדף השיתוף ──
// ⚠️ תצוגה בלבד: המועד לא סוגר את הרישום בפועל. הסגירה עצמה היא עדיין
// המתג registration_open של החלוקה במסך הניהול.
export const CLOSES_AT_KEY = 'distributions_share_closes_at'

/** ISO תקין או null. */
export function parseClosesAt(value: unknown): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

export async function getClosesAt(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin.from('app_settings').select('value').eq('key', CLOSES_AT_KEY).maybeSingle()
  return parseClosesAt(data?.value)
}

export async function setClosesAt(admin: SupabaseClient, iso: string | null): Promise<void> {
  const { error } = await admin.from('app_settings').upsert(
    { key: CLOSES_AT_KEY, value: iso ?? '', updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) throw new Error(error.message)
}
