// נעילה נגד הרצות כפולות בין כמה מכונות. נשמרת ב-app_settings (value = זמן התחלה ב-ISO).
// ההשגה אטומית: insert עם התנגשות על המפתח, ובנעילה ישנה — החלפה מותנית בערך הישן
// (compare-and-swap), כך ששתי מכונות במקביל לא יתחילו יחד.
import type { SupabaseClient } from '@supabase/supabase-js'

export const BACKUP_LOCK_KEY = 'backup_lock'
export const BACKUP_LOCK_TTL_MS = 2 * 60 * 60 * 1000

export async function acquireSettingsLock(admin: SupabaseClient, key: string, ttlMs: number, now = new Date()): Promise<boolean> {
  const stamp = now.toISOString()
  const ins = await admin.from('app_settings').insert({ key, value: stamp })
  if (!ins.error) return true

  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle()
  // אין שורה (שוחררה בינתיים) או שורה ריקה — מנסים שוב פעם אחת
  if (!data) {
    const retry = await admin.from('app_settings').insert({ key, value: stamp })
    return !retry.error
  }
  const startedAt = data.value ? Date.parse(String(data.value)) : NaN
  if (Number.isFinite(startedAt) && now.getTime() - startedAt < ttlMs) return false

  // נעילה ישנה/פגומה — תופסים אותה רק אם עדיין לא נתפסה ע"י מישהו אחר
  const { data: swapped } = await admin.from('app_settings')
    .update({ value: stamp }).eq('key', key).eq('value', data.value ?? '').select('key')
  return !!swapped && swapped.length > 0
}

export async function releaseSettingsLock(admin: SupabaseClient, key: string): Promise<void> {
  await admin.from('app_settings').delete().eq('key', key).then(undefined, () => {})
}

export const acquireBackupLock = (admin: SupabaseClient, now = new Date()) =>
  acquireSettingsLock(admin, BACKUP_LOCK_KEY, BACKUP_LOCK_TTL_MS, now)

export const releaseBackupLock = (admin: SupabaseClient) => releaseSettingsLock(admin, BACKUP_LOCK_KEY)
