import type { SupabaseClient } from '@supabase/supabase-js'

// 🔴 PostgREST 13 (המסד העצמאי, מ-4.11.2026) מחיל מסנן or() של PATCH שוב גם על
// השורות שחוזרות מ-select. שם יש רק id, ולכן כל PATCH עם or() ו-select נדחה
// ב-400 ("column maternity_aids.card_load_status does not exist"). השגיאה נבלעה,
// הנעילה נראתה "תפוסה", ו-38 יולדות נשארו בתור עם 250 כרטיסים פנויים (7.11.2026).
// לכן בעדכון מותנה משתמשים רק במסננים פשוטים (eq/is/lt), שעוברים תקין.

export const CLAIMABLE_LOAD_STATUSES = ['idle', 'failed', 'unloaded']
const STALE_PENDING_MS = 10 * 60 * 1000

export type ClaimResult = { claimed: boolean; error?: string }

/**
 * נעילה אטומית של טעינת כרטיס: מעבירה את התיק ל-pending רק אם הוא עדיין במצב
 * שנקרא ממנו (current). התנאי בתוך ה-UPDATE עצמו, כך שמבין שתי קריאות מקבילות
 * רק אחת זוכה. בקשה אחת בלבד למסד, לפי המצב הנוכחי.
 */
export async function claimCardLoad(
  admin: SupabaseClient, aidId: string, current: string | null | undefined, patch: Record<string, unknown>,
): Promise<ClaimResult> {
  const st = current ?? null
  if (st !== null && st !== 'pending' && !CLAIMABLE_LOAD_STATUSES.includes(st)) return { claimed: false }
  let q = admin.from('maternity_aids').update({ ...patch, card_load_status: 'pending' }).eq('id', aidId)
  if (st === null) q = q.is('card_load_status', null)
  // pending ישן (קריסה באמצע) משתחרר אחרי 10 דקות, כדי שתיק לא ייתקע לנצח
  else if (st === 'pending') q = q.eq('card_load_status', 'pending').lt('updated_at', new Date(Date.now() - STALE_PENDING_MS).toISOString())
  else q = q.eq('card_load_status', st)
  const { data, error } = await q.select('id')
  // ⚠️ שגיאה אינה "תפוס": מחזירים אותה, כדי שהקורא ידווח כשל ולא ידלג בשקט
  if (error) return { claimed: false, error: error.message }
  return { claimed: !!data?.length }
}
