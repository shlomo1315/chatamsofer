import type { SupabaseClient } from '@supabase/supabase-js'
import { MM_CODE_MAX_ATTEMPTS, MM_CODE_MINUTES, codesEqual, generateCode, hashCode } from './crypto'
import { sendLoginCode } from './mail'

/** מנפיק קוד חדש (מבטל קודם) ושולח במייל. מחזיר false אם השליחה נכשלה. */
export async function issueLoginCode(db: SupabaseClient, m: { id: string; first_name: string; email: string }): Promise<boolean> {
  const now = new Date()
  await db.from('matchmaker_login_codes').update({ used_at: now.toISOString() }).eq('matchmaker_id', m.id).is('used_at', null)
  // ניקוי קודים ישנים
  await db.from('matchmaker_login_codes').delete().lt('created_at', new Date(now.getTime() - 86400000).toISOString())
  const code = generateCode()
  const { error } = await db.from('matchmaker_login_codes').insert({
    matchmaker_id: m.id, code_hash: hashCode(m.id, code),
    expires_at: new Date(now.getTime() + MM_CODE_MINUTES * 60_000).toISOString(),
  })
  if (error) return false
  const sent = await sendLoginCode(m.email, m.first_name, code)
  return sent.ok
}

/** בודק קוד: עד 5 ניסיונות, ואז הקוד נפסל. הקוד משמש פעם אחת. */
export async function consumeLoginCode(db: SupabaseClient, matchmakerId: string, code: string): Promise<boolean> {
  const { data: row } = await db.from('matchmaker_login_codes')
    .select('id, code_hash, attempts')
    .eq('matchmaker_id', matchmakerId).is('used_at', null).gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!row || row.attempts >= MM_CODE_MAX_ATTEMPTS) return false
  // מעלים את מונה הניסיונות לפני ההשוואה, כדי שגם בקשות מקבילות ייספרו
  await db.from('matchmaker_login_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id)
  if (!/^\d{6}$/.test(code) || !codesEqual(row.code_hash, hashCode(matchmakerId, code))) return false
  // סימון שימוש מותנה: רק בקשה אחת יכולה לנצל את הקוד
  const { data: used } = await db.from('matchmaker_login_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id).is('used_at', null).select('id')
  return !!used?.length
}
