// נרמול מספר טלפון ישראלי ל-05XXXXXXXX ואיתור משפחה לפי טלפון.
import type { SupabaseClient } from '@supabase/supabase-js'

export function normalizePhone(raw: string): string {
  let p = String(raw ?? '').replace(/\D/g, '')
  if (p.startsWith('00972')) p = '0' + p.slice(5)
  else if (p.startsWith('972')) p = '0' + p.slice(3)
  return p
}

const phoneMatches = (stored: string | null | undefined, caller: string) =>
  !!stored && normalizePhone(stored) === caller

/**
 * מסננים ב-DB לפי 7 הספרות האחרונות ומאמתים בנרמול מלא. אם לא נמצא — סריקה מלאה,
 * כי הטלפונים נשמרים כפי שהוקלדו (מקפים, רווחים, 972) והסינון המהיר עלול לפספס.
 */
export async function findByPhone<T extends { phone: string | null; phone2: string | null; spouse_phone: string | null }>(
  admin: SupabaseClient, cols: string, callerPhone: string,
): Promise<{ row?: T; error?: string }> {
  const matches = (b: T) =>
    phoneMatches(b.phone, callerPhone) || phoneMatches(b.phone2, callerPhone) || phoneMatches(b.spouse_phone, callerPhone)
  const last7 = callerPhone.replace(/\D/g, '').slice(-7)
  if (last7.length === 7) {
    const { data, error } = await admin.from('beneficiaries').select(cols).eq('is_active', true)
      .or(`phone.ilike.%${last7}%,phone2.ilike.%${last7}%,spouse_phone.ilike.%${last7}%`)
    if (error) return { error: error.message }
    const hit = ((data ?? []) as unknown as T[]).find(matches)
    if (hit) return { row: hit }
  }
  const { data, error } = await admin.from('beneficiaries').select(cols).eq('is_active', true)
  if (error) return { error: error.message }
  return { row: ((data ?? []) as unknown as T[]).find(matches) }
}
