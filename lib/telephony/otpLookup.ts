// שליפה חד-פעמית של קוד אימות ממתין להקראה בטלפון. זהה ללוגיקה של שלוחת הקוד הקודמת,
// בלי תלות בפרוטוקול של המרכזיה.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'

export type OtpResult =
  | { kind: 'ok'; code: string }
  | { kind: 'none' | 'expired' | 'badPhone' | 'error' }

let _admin: SupabaseClient | null = null
function adminClient(): SupabaseClient | null {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return _admin
}

async function readSignupCode(admin: SupabaseClient, caller: string): Promise<string | null> {
  const key = `verify:phone:${caller}`
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle()
  if (!data?.value) return null
  try {
    const rec = JSON.parse(String(data.value)) as Record<string, unknown> & { plain?: string; expires?: number }
    if (!rec.plain || (rec.expires && rec.expires < Date.now())) return null
    const code = String(rec.plain).replace(/\D/g, '')
    if (!code) return null
    delete rec.plain // הקראה חד-פעמית; ה-hash נשאר לאימות הטופס
    await admin.from('app_settings')
      .update({ value: JSON.stringify(rec), updated_at: new Date().toISOString() }).eq('key', key)
    return code
  } catch {
    return null
  }
}

export async function takePendingCode(rawPhone: string): Promise<OtpResult> {
  const caller = normalizePhone(rawPhone)
  const last7 = caller.replace(/\D/g, '').slice(-7)
  if (last7.length !== 7) return { kind: 'badPhone' }
  const admin = adminClient()
  if (!admin) return { kind: 'error' }

  const { data, error } = await admin.from('beneficiaries')
    .select('id, phone, phone2, spouse_phone, portal_phone_code_plain, portal_phone_code_expires')
    .or(`phone.ilike.%${last7}%,phone2.ilike.%${last7}%,spouse_phone.ilike.%${last7}%`)
    .not('portal_phone_code_plain', 'is', null)
  if (error) return { kind: 'error' }

  const row = (data ?? []).find((b) => {
    const m = (v: string | null) => !!v && normalizePhone(v) === caller
    return m(b.phone) || m(b.phone2) || m(b.spouse_phone)
  })
  if (!row?.portal_phone_code_plain) {
    const pending = await readSignupCode(admin, caller)
    return pending ? { kind: 'ok', code: pending } : { kind: 'none' }
  }
  const expired = row.portal_phone_code_expires
    ? new Date(row.portal_phone_code_expires).getTime() < Date.now() : true
  await admin.from('beneficiaries').update({ portal_phone_code_plain: null }).eq('id', row.id)
  if (expired) return { kind: 'expired' }
  const code = String(row.portal_phone_code_plain).replace(/\D/g, '')
  return code ? { kind: 'ok', code } : { kind: 'none' }
}
