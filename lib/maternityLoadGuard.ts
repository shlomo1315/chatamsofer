import type { SupabaseClient } from '@supabase/supabase-js'
import { getClientCardFull, type NedarimCreds } from '@/lib/nedarim'
import { alert } from '@/lib/nedarimGuard'

// ─────────────────────────────────────────────────────────────────────────────
// חסם בבסיס הנתונים: לכל תיק יולדת שורה פעילה אחת לכל היותר (אינדקס ייחודי
// חלקי). השורה נוצרת *לפני* הפנייה לנדרים, ולכן גם נעילה שנתקעה, ניסיון חוזר
// או באג בקוד לא יכולים לטעון פעמיים. משחררים רק בכישלון ודאי של AddTlush
// (נדרים דחו) או בפריקה. חריגה באמצע הפנייה היא מצב לא ודאי — השורה נשארת.
// ─────────────────────────────────────────────────────────────────────────────

export type GuardResult = 'acquired' | 'held' | 'error'

export async function acquireLoadGuard(admin: SupabaseClient, aidId: string): Promise<GuardResult> {
  const { error } = await admin.from('maternity_load_guard').insert({ aid_id: aidId })
  if (!error) return 'acquired'
  if (error.code === '23505') return 'held'
  console.error('[loadGuard] acquire failed:', error.message)
  return 'error' // נכשל-סגור: בלי חסם אין טעינה
}

export async function confirmLoadGuard(admin: SupabaseClient, aidId: string, tlushId: string | null) {
  await admin.from('maternity_load_guard').update({ tlush_id: tlushId }).eq('aid_id', aidId).is('released_at', null)
}

export async function releaseLoadGuard(admin: SupabaseClient, aidId: string) {
  await admin.from('maternity_load_guard').update({ released_at: new Date().toISOString() })
    .eq('aid_id', aidId).is('released_at', null)
}

export function tlushimOf(card: unknown): Record<string, unknown>[] {
  const raw = (card as { Tlushim?: unknown } | null)?.Tlushim
  return Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw as Record<string, unknown>] : []
}

/**
 * לפני טעינה מחדש של תיק שנפרק: האם הטעינה הקודמת עדיין פעילה בנדרים?
 * true/null (לא ניתן לקרוא) = לא טוענים. false = בטוח לטעון.
 */
export async function previousTlushStillActive(
  creds: NedarimCreds, clientId: string, tlushId: string,
): Promise<boolean | null> {
  try {
    const card = await getClientCardFull(creds, clientId)
    if (!card) return null
    return tlushimOf(card).some(t => String(t.Id ?? t.TlushId ?? '').trim() === String(tlushId).trim())
  } catch { return null }
}

/** חסם שמוחזק יותר מזה בלי טעינה מאושרת (tlush_id) נחשב תקוע. */
export const STUCK_GUARD_AFTER_MS = 10 * 60_000

/**
 * מתריע (במנגנון ההתראות של שומר נדרים, פעם בשעה) על חסמים פעילים שאין להם
 * tlush_id מעבר לסף. מחזיר את מזהי התיקים התקועים.
 */
export async function alertStuckLoadGuards(admin: SupabaseClient, now = Date.now()): Promise<string[]> {
  const cutoff = new Date(now - STUCK_GUARD_AFTER_MS).toISOString()
  const { data, error } = await admin.from('maternity_load_guard').select('aid_id, created_at')
    .is('released_at', null).is('tlush_id', null).lt('created_at', cutoff)
  if (error || !data?.length) return []
  const ids = data.map(r => String(r.aid_id))
  await alert('stuck-load-guard', `חסם טעינת יולדת תקוע (${ids.length})`, [
    `יש ${ids.length} חסמי טעינה שמוחזקים יותר מ-${STUCK_GUARD_AFTER_MS / 60_000} דקות בלי טעינה מאושרת בנדרים.`,
    `תיקים: ${ids.join(', ')}`,
    'הטעינה לא תנסה שוב עד שהחסם ישוחרר. יש לבדוק בנדרים אם נוצר תלוש לפני שמשחררים.',
  ])
  return ids
}
