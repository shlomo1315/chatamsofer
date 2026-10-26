// טעינה חודשית למוקדי חלוקת הכרטיסים (שלוחת טלפון בימות).
// כל מוקד: טלפון מורשה אחד, כרטיס משויך פעם אחת, וטעינה אחת לכל חודש קלנדרי.
// הטעינה מנכה כרטיס מהמלאי הגלובלי (אותה נעילה כמו consume_card_stock).
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getNedarimCreds, getMaternityLimitedId, findClientByZeout, saveClientCard, setMagneticCard, addTlush,
} from '@/lib/nedarim'

export const CENTER_LOAD_AMOUNT_KEY = 'center_monthly_amount'
export const CENTER_LOAD_DEFAULT_AMOUNT = 600

/** החודש הנוכחי לפי שעון ישראל, בפורמט YYYY-MM. */
export function israelMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return `${y}-${m}`
}

/** סכום הטעינה מההגדרות; ערך לא תקין = ברירת המחדל. */
export function parseAmount(v: unknown): number {
  const raw = typeof v === 'object' && v !== null && 'amount' in v ? (v as { amount: unknown }).amount : v
  const n = Math.round(Number(raw))
  return Number.isFinite(n) && n > 0 && n <= 5000 ? n : CENTER_LOAD_DEFAULT_AMOUNT
}

export async function getLoadAmount(admin: SupabaseClient): Promise<number> {
  try {
    const { data } = await admin.from('app_settings').select('value').eq('key', CENTER_LOAD_AMOUNT_KEY).maybeSingle()
    return parseAmount(data?.value)
  } catch {
    return CENTER_LOAD_DEFAULT_AMOUNT
  }
}

/** נרמול טלפון ישראלי ל-05XXXXXXXX. */
export function normalizeCallerPhone(raw: string): string {
  let p = String(raw ?? '').replace(/\D/g, '')
  if (p.startsWith('00972')) p = '0' + p.slice(5)
  else if (p.startsWith('972')) p = '0' + p.slice(3)
  return p
}

export type CenterAccount = {
  center_id: string
  phone: string | null
  card_number: string | null
  nedarim_client_id: string | null
  id_number: string | null
  center_name: string
}

export async function findCenterByPhone(admin: SupabaseClient, phone: string): Promise<CenterAccount | null> {
  if (!phone) return null
  const { data } = await admin
    .from('center_monthly_cards')
    .select('center_id, phone, card_number, nedarim_client_id, id_number, card_centers!inner(name, is_active)')
    .eq('phone', phone)
    .maybeSingle()
  if (!data) return null
  const c = (data as unknown as { card_centers: { name: string; is_active: boolean } | { name: string; is_active: boolean }[] }).card_centers
  const center = Array.isArray(c) ? c[0] : c
  if (!center?.is_active) return null
  const d = data as unknown as CenterAccount
  return { ...d, center_name: center.name }
}

/** הכרטיס כבר נטען החודש? */
export async function isLoadedThisMonth(admin: SupabaseClient, centerId: string, month: string): Promise<boolean> {
  const { data } = await admin.from('center_monthly_loads').select('status').eq('center_id', centerId).eq('month', month).maybeSingle()
  return data?.status === 'loaded'
}

/** מאתר/מקים את הלקוח של המוקד בנדרים. */
async function ensureClient(acc: CenterAccount, creds: NonNullable<Awaited<ReturnType<typeof getNedarimCreds>>>): Promise<string> {
  if (acc.nedarim_client_id) return acc.nedarim_client_id
  let id: string | null = null
  if (acc.id_number) id = await findClientByZeout(creds, acc.id_number).catch(() => null)
  if (!id) id = await saveClientCard(creds, { full_name: acc.center_name, family_name: 'מוקד', id_number: acc.id_number, phone: acc.phone }, null, 'מוקדים')
  if (!id) throw new Error('לא הצלחנו להקים את המוקד בנדרים')
  return id
}

/** שיוך הכרטיס פעם אחת: מחבר בנדרים ורק אז שומר. */
export async function linkCenterCard(admin: SupabaseClient, acc: CenterAccount, card: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const creds = await getNedarimCreds()
  if (!creds) return { ok: false, error: 'נדרים לא מוגדר' }
  try {
    const clientId = await ensureClient(acc, creds)
    const r = await setMagneticCard(creds, clientId, card)
    if (!r.ok) return { ok: false, error: r.message || 'שיוך הכרטיס בנדרים נכשל' }
    const { error } = await admin.from('center_monthly_cards').update({
      card_number: card, nedarim_client_id: clientId, card_linked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('center_id', acc.center_id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'שגיאה' }
  }
}

export type LoadResult = 'loaded' | 'already' | 'busy' | 'no_stock' | 'error'

/**
 * טעינה חודשית אטומית: שריון (בדיקת חודש + מלאי + ניכוי) → נדרים → סימון 'loaded'.
 * כשל בנדרים מחזיר את הכרטיס למלאי ומשחרר את החודש.
 */
export async function runMonthlyLoad(
  admin: SupabaseClient, acc: CenterAccount, now: Date = new Date(),
): Promise<{ result: LoadResult; error?: string }> {
  const month = israelMonth(now)
  const amount = await getLoadAmount(admin)
  const { data: reserved, error: rErr } = await admin.rpc('reserve_center_monthly_load', { p_center: acc.center_id, p_month: month, p_amount: amount })
  if (rErr) return { result: 'error', error: rErr.message }
  if (reserved !== 'ok') return { result: reserved as LoadResult }

  const release = async () => { try { await admin.rpc('release_center_monthly_load', { p_center: acc.center_id, p_month: month }) } catch { /* best-effort */ } }
  try {
    const creds = await getNedarimCreds()
    if (!creds) { await release(); return { result: 'error', error: 'נדרים לא מוגדר' } }
    const clientId = await ensureClient(acc, creds)
    const limitedId = await getMaternityLimitedId()
    const r = await addTlush(creds, clientId, amount, undefined, `טעינה חודשית למוקד ${acc.center_name} · ${month}`, limitedId)
    if (!r.ok) { await release(); return { result: 'error', error: r.message } }
    // הכסף כבר נטען: אם הסימון נכשל, לא משחררים (היה מאפשר טעינה כפולה); נשאר pending ונראה לאדמין
    await admin.from('center_monthly_loads').update({ status: 'loaded', tlush_id: r.tlushId, loaded_at: new Date().toISOString() })
      .eq('center_id', acc.center_id).eq('month', month)
    return { result: 'loaded' }
  } catch (e) {
    await release()
    return { result: 'error', error: e instanceof Error ? e.message : 'שגיאה' }
  }
}
