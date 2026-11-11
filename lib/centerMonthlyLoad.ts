// טעינה חודשית למוקדי חלוקת הכרטיסים (שלוחת טלפון במרכזיה).
// כל מוקד: טלפון מורשה אחד, כרטיס משויך פעם אחת, וטעינה אחת לכל חודש קלנדרי.
// הטעינה מנכה כרטיס מהמלאי הגלובלי (אותה נעילה כמו consume_card_stock).
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getNedarimCreds, getCenterLimitedId, findClientByTsad3, getClientCard, getClientCardFull, getClientsTable, saveClientCard, setMagneticCard, addTlush,
} from '@/lib/nedarim'

export const CENTER_LOAD_AMOUNT_KEY = 'center_monthly_amount'
export const CENTER_LOAD_DEFAULT_AMOUNT = 600
/** תוקף הטעינה בחודשים מיום הטעינה. */
export const CENTER_LOAD_VALID_MONTHS = 2

/** תאריך התוקף (YYYY-MM-DD) לפי שעון ישראל: חודשיים מיום הטעינה, מקוצר ליום האחרון בחודש היעד. */
export function loadExpiry(now: Date = new Date(), months = CENTER_LOAD_VALID_MONTHS): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const total = get('year') * 12 + (get('month') - 1) + months
  const y = Math.floor(total / 12)
  const m = total % 12
  const day = Math.min(get('day'), new Date(Date.UTC(y, m + 1, 0)).getUTCDate())
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** YYYY-MM-DD → dd/MM/yyyy (הפורמט של נדרים). */
export const toNedarimDate = (iso: string): string => iso.split('-').reverse().join('/')

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
export async function ensureClient(
  admin: SupabaseClient, acc: CenterAccount, creds: NonNullable<Awaited<ReturnType<typeof getNedarimCreds>>>,
): Promise<string> {
  if (acc.nedarim_client_id) return acc.nedarim_client_id
  // מזהה צד ג' (Tsad3Id) קבוע למוקד: ריצה חוזרת (למשל אחרי קריסה לפני השמירה) מוצאת את הלקוח ולא מקימה כפילות
  const tsad3 = acc.id_number || `center-${acc.center_id}`
  let id: string | null = await findClientByTsad3(creds, tsad3).catch(() => null)
  if (!id) id = await saveClientCard(creds, { full_name: acc.center_name, family_name: 'מוקד', id_number: tsad3, id_type: 'passport', phone: acc.phone }, null, 'מוקדים')
  if (!id) throw new Error('לא הצלחנו להקים את המוקד בנדרים')
  await admin.from('center_monthly_cards').update({ nedarim_client_id: id, id_number: tsad3, updated_at: new Date().toISOString() }).eq('center_id', acc.center_id)
  return id
}

/** הכרטיס כבר משויך למוקד אחר? (בדיקה מקומית לפני כל פנייה לנדרים) */
export async function isCardTakenByOtherCenter(admin: SupabaseClient, centerId: string, card: string): Promise<boolean> {
  const { data } = await admin.from('center_monthly_cards').select('center_id').eq('card_number', card).neq('center_id', centerId).limit(1)
  return (data ?? []).length > 0
}

/** הכרטיס כבר מחובר ללקוח הזה בנדרים (קריאה בלבד)? מכסה ניתוק באמצע שיוך קודם: נדרים שמר והמסד לא. */
async function cardAlreadyOnClient(creds: NonNullable<Awaited<ReturnType<typeof getNedarimCreds>>>, clientId: string, card: string): Promise<boolean> {
  try {
    const full = await getClientCardFull(creds, clientId)
    const cards = Array.isArray((full as { Cards?: unknown } | null)?.Cards) ? ((full as { Cards: Record<string, unknown>[] }).Cards) : []
    return cards.some(c => !c.RemovedDate && [c.MagneticCard, c.CardNumber].some(v => String(v ?? '').replace(/\D/g, '') === card))
  } catch { return false }
}

/** שיוך הכרטיס פעם אחת: מחבר בנדרים ורק אז שומר. */
export async function linkCenterCard(admin: SupabaseClient, acc: CenterAccount, card: string): Promise<{ ok: true } | { ok: false; error: string; taken?: boolean }> {
  if (await isCardTakenByOtherCenter(admin, acc.center_id, card)) return { ok: false, error: 'הכרטיס כבר משויך למוקד אחר', taken: true }
  const creds = await getNedarimCreds()
  if (!creds) return { ok: false, error: 'נדרים לא מוגדר' }
  try {
    const clientId = await ensureClient(admin, acc, creds)
    const r = await setMagneticCard(creds, clientId, card)
    if (!r.ok && !(await cardAlreadyOnClient(creds, clientId, card))) return { ok: false, error: r.message || 'שיוך הכרטיס בנדרים נכשל' }
    const { error } = await admin.from('center_monthly_cards').update({
      card_number: card, nedarim_client_id: clientId, card_linked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('center_id', acc.center_id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'שגיאה' }
  }
}

/** יתרת הכרטיס בנדרים באגורות (קריאה בלבד). null כשאין כרטיס, נדרים לא מגיב או התשובה לא תקינה. */
export async function getCenterBalanceAgorot(acc: Pick<CenterAccount, 'nedarim_client_id'>, timeoutMs = 4000): Promise<number | null> {
  if (!acc.nedarim_client_id) return null
  try {
    const creds = await getNedarimCreds()
    if (!creds) return null
    const r = await Promise.race([
      getClientCard(creds, acc.nedarim_client_id),
      new Promise<null>(res => setTimeout(() => res(null), timeoutMs)),
    ])
    if (!r || r.totalFreeAmount == null || r.totalFreeAmount < 0) return null
    return Math.round(r.totalFreeAmount * 100)
  } catch { return null }
}

export type LoadResult = 'loaded' | 'already' | 'busy' | 'no_stock' | 'error'

/**
 * טעינה חודשית אטומית: שריון (בדיקת חודש + מלאי + ניכוי) → נדרים → סימון 'loaded'.
 * כשל בנדרים מחזיר את הכרטיס למלאי ומשחרר את החודש.
 */
export async function runMonthlyLoad(
  admin: SupabaseClient, acc: CenterAccount, now: Date = new Date(),
): Promise<{ result: LoadResult; error?: string; amount?: number; expiresAt?: string }> {
  const month = israelMonth(now)
  const amount = await getLoadAmount(admin)
  const { data: reserved, error: rErr } = await admin.rpc('reserve_center_monthly_load', { p_center: acc.center_id, p_month: month, p_amount: amount })
  if (rErr) return { result: 'error', error: rErr.message }
  if (reserved !== 'ok') return { result: reserved as LoadResult }

  const release = async () => { try { await admin.rpc('release_center_monthly_load', { p_center: acc.center_id, p_month: month }) } catch { /* best-effort */ } }
  let called = false
  try {
    const creds = await getNedarimCreds()
    if (!creds) { await release(); return { result: 'error', error: 'נדרים לא מוגדר' } }
    const clientId = await ensureClient(admin, acc, creds)
    // קבוצה נפרדת למוקדים: לא הקבוצה של היולדות, ובלי הגבלת חנויות. התוקף חודשיים.
    const limitedId = await getCenterLimitedId()
    const expiresAt = loadExpiry(now)
    called = true
    const r = await addTlush(creds, clientId, amount, toNedarimDate(expiresAt), `טעינה חודשית למוקד ${acc.center_name} · ${month}`, limitedId)
    if (!r.ok) { await release(); return { result: 'error', error: r.message } }
    // הכסף כבר נטען: אם הסימון נכשל, לא משחררים (היה מאפשר טעינה כפולה); נשאר pending ונראה לאדמין
    await admin.from('center_monthly_loads').update({ status: 'loaded', tlush_id: r.tlushId, expires_at: expiresAt, loaded_at: new Date().toISOString(), balance: amount, balance_at: new Date().toISOString() })
      .eq('center_id', acc.center_id).eq('month', month)
    return { result: 'loaded', amount, expiresAt }
  } catch (e) {
    // חריגה אחרי הפנייה לנדרים היא עמימה (אולי נטען): לא משחררים, כדי שלא תהיה טעינה כפולה
    if (!called) await release()
    return { result: 'error', error: e instanceof Error ? e.message : 'שגיאה' }
  }
}

/**
 * רענון יתרות מנדרים לחודש הנוכחי, לכל מוקד שנטען החודש ויש לו כרטיס בנדרים.
 * נדרים מחזירה יתרה כוללת לכרטיס; כיוון שיש טעינה אחת בחודש, זו היתרה של הטעינה.
 * בחודשים קודמים נשארת היתרה האחרונה שנרשמה לאותו חודש.
 */
export async function refreshMonthBalances(admin: SupabaseClient, month: string): Promise<void> {
  const creds = await getNedarimCreds()
  if (!creds) return
  const [{ data: cards }, { data: loads }] = await Promise.all([
    admin.from('center_monthly_cards').select('center_id, nedarim_client_id').not('nedarim_client_id', 'is', null),
    admin.from('center_monthly_loads').select('center_id').eq('month', month).eq('status', 'loaded'),
  ])
  const loaded = new Set((loads ?? []).map((l) => l.center_id))
  await Promise.all((cards ?? []).filter((c) => loaded.has(c.center_id)).map(async (c) => {
    try {
      const r = await getClientCard(creds, c.nedarim_client_id as string)
      if (!r) return
      await admin.from('center_monthly_loads').update({ balance: r.totalFreeAmount, balance_at: new Date().toISOString() })
        .eq('center_id', c.center_id).eq('month', month)
    } catch { /* היתרה הישנה נשארת */ }
  }))
}

export type NedarimLinkState = 'linked' | 'none' | 'multiple' | 'no_phone' | 'error'

/** כל ה-ClientId (ייחודיים) שבטבלת הלקוחות שאחד משדות הטלפון שלהם שווה לטלפון המוזן. */
export function findFamiliesByPhone(families: Record<string, unknown>[], phone: string): Record<string, unknown>[] {
  if (!phone) return []
  const seen = new Set<string>()
  return families.filter((row) => {
    const hit = Object.entries(row).some(([k, v]) => /phone|tel|mobile|cell/i.test(k) && normalizeCallerPhone(String(v ?? '')) === phone)
    const id = String(row.ClientId ?? '')
    if (!hit || !id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/**
 * משיכה אוטומטית מנדרים: לכל מוקד עם טלפון ובלי קישור, מחפש משפחה לפי הטלפון.
 * נמצאה אחת → נשמרים nedarim_client_id, מזהה צד ג' (id_number) והכרטיס המשויך.
 * כמה משפחות באותו טלפון → לא בוחרים בניחוש. לא מקימים משפחה חדשה.
 */
export async function syncCentersFromNedarim(admin: SupabaseClient): Promise<Record<string, NedarimLinkState>> {
  const out: Record<string, NedarimLinkState> = {}
  const { data: cards } = await admin.from('center_monthly_cards').select('center_id, phone, nedarim_client_id')
  const pending = (cards ?? []).filter((c) => !c.nedarim_client_id)
  for (const c of cards ?? []) out[c.center_id] = c.nedarim_client_id ? 'linked' : (c.phone ? 'none' : 'no_phone')
  const withPhone = pending.filter((c) => c.phone)
  if (withPhone.length === 0) return out
  const creds = await getNedarimCreds()
  if (!creds) { for (const c of withPhone) out[c.center_id] = 'error'; return out }
  let families: Record<string, unknown>[]
  try { families = (await getClientsTable(creds)).families } catch { for (const c of withPhone) out[c.center_id] = 'error'; return out }
  for (const c of withPhone) {
    const found = findFamiliesByPhone(families, c.phone as string)
    if (found.length === 0) continue
    if (found.length > 1) { out[c.center_id] = 'multiple'; continue }
    const row = found[0]
    const tsad3Key = Object.keys(row).find((k) => /tsad3/i.test(k))
    const tsad3 = tsad3Key ? String(row[tsad3Key] ?? '').trim() : ''
    let card: string | null = null
    try {
      const full = await getClientCardFull(creds, String(row.ClientId))
      const list = Array.isArray((full as { Cards?: unknown } | null)?.Cards) ? (full as { Cards: Record<string, unknown>[] }).Cards : []
      const live = list.find((x) => !x.RemovedDate)
      const num = live ? String(live.MagneticCard ?? live.CardNumber ?? '').replace(/\D/g, '') : ''
      card = num || null
    } catch { /* הכרטיס יושלם בשיחה */ }
    const { error } = await admin.from('center_monthly_cards').update({
      nedarim_client_id: String(row.ClientId), id_number: tsad3 || null, card_number: card,
      card_linked_at: card ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    }).eq('center_id', c.center_id)
    out[c.center_id] = error ? 'error' : 'linked'
  }
  return out
}
