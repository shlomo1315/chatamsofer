// גישה לנתונים של שלוחת החגים — מופרד מהשיחה כדי שאפשר יהיה לבדוק את כל המסלולים.
// השאילתות זהות לשלוחה הקודמת, שהוסרה.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/apiAuth'
import { digitsOnly, idOrFilter, sameId } from '@/lib/idLookup'
import { isKnownPhone } from '@/lib/cardIdentity'
import { loadOpenCenters } from '@/lib/holidayCenterIvr'
import { ensureCenterOpening } from '@/lib/centerOpeningRow'
import { runLoadBatch, type LoadTarget, type LoadSummary } from '@/lib/holidayCardLoad'
import type { CenterRow } from '@/lib/holidayCenterPick'

export type Member = {
  id: string; family_name: string | null; full_name: string | null; spouse_name: string | null
  id_number: string | null; spouse_id_number: string | null
  is_active: boolean | null; eligibility_status: string | null
  nedarim_id_holiday?: string | null
}
export type Recipient = {
  id: string; center_id: string | null; approval_status: string | null
  card_number?: string | null; load_status?: string | null
  source?: string | null; deadline_extended?: boolean | null
}
export type OpeningRow = { pickup_open_at: string | null; pickup_ended_at: string | null }
export type SpokenCenter = { city: string | null; name: string | null; address: string | null; hours: string | null; audio_file: string | null }

const MEMBER_COLS = 'id, full_name, family_name, spouse_name, id_number, spouse_id_number, is_active, eligibility_status'

function db(): SupabaseClient {
  const admin = getServiceClient()
  if (!admin) throw new Error('Supabase אינו מוגדר')
  return admin
}

/** שם לקריאה: "משפחה פרטי", או מה שקיים מהשניים. */
export function readableName(m: Member): string {
  return [m.family_name, m.full_name].map(s => String(s ?? '').trim()).filter(Boolean).join(' ')
}

/** פעיל ולא נדחה — אותו תנאי כמו ברישום באתר. */
export const memberCanRegister = (m: Member) => m.is_active !== false && m.eligibility_status !== 'rejected'

export async function findMemberById(idNumber: string): Promise<Member | null> {
  const id = digitsOnly(idNumber)
  const { data } = await db().from('beneficiaries').select(MEMBER_COLS)
    .or(idOrFilter(id, ['id_number', 'spouse_id_number'])).limit(5)
  const exact = ((data ?? []) as Member[]).filter(m => sameId(m.id_number, id) || sameId(m.spouse_id_number, id))
  return exact.find(memberCanRegister) ?? exact[0] ?? null
}

/** כל המשפחות הפעילות שהמספר רשום אצלן (טלפון, טלפון 2, טלפון בן/בת זוג). */
export async function findMembersByPhone(callerPhone: string): Promise<Member[]> {
  const caller = digitsOnly(callerPhone)
  if (caller.length < 9) return []
  const last7 = caller.slice(-7)
  const { data } = await db().from('beneficiaries')
    .select(`${MEMBER_COLS}, phone, phone2, spouse_phone, nedarim_id_holiday`)
    .eq('is_active', true)
    .or(`phone.ilike.%${last7}%,phone2.ilike.%${last7}%,spouse_phone.ilike.%${last7}%`)
    .limit(50)
  type Row = Member & { phone: string | null; phone2: string | null; spouse_phone: string | null }
  return ((data ?? []) as Row[]).filter(m => isKnownPhone(caller, [m.phone, m.phone2, m.spouse_phone]))
}

/** החלוקה האחרונה (לפי תאריך יצירה), עם העמודות שהמסלול צריך. */
export async function latestDistribution<T>(cols: string): Promise<T | null> {
  const { data } = await db().from('distributions').select(cols)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return (data as T | null) ?? null
}

export async function getRecipient(distributionId: string, beneficiaryId: string, cols: string): Promise<Recipient | null> {
  const { data } = await db().from('distribution_recipients').select(cols)
    .eq('distribution_id', distributionId).eq('beneficiary_id', beneficiaryId).maybeSingle()
  return (data as Recipient | null) ?? null
}

/** האם מוקד כלשהו בחלוקה כבר החל לחלק (להודעת "טרם החל" מול "הסתיים"). */
export async function pickupEverStarted(distributionId: string): Promise<boolean> {
  const { count } = await db().from('holiday_center_openings').select('center_id', { count: 'exact', head: true })
    .eq('distribution_id', distributionId).not('pickup_open_at', 'is', null)
  return (count ?? 0) > 0
}

export async function centerOpening(distributionId: string, centerId: string): Promise<OpeningRow | null> {
  const { data } = await db().from('holiday_center_openings').select('pickup_open_at, pickup_ended_at')
    .eq('distribution_id', distributionId).eq('center_id', centerId).maybeSingle()
  return (data as OpeningRow | null) ?? null
}

export async function getCenter(centerId: string): Promise<CenterRow | null> {
  const { data } = await db().from('holiday_centers').select('id, city, name, region, sort_order').eq('id', centerId).maybeSingle()
  return (data as CenterRow | null) ?? null
}

export async function getSpokenCenter(centerId: string): Promise<SpokenCenter | null> {
  const { data } = await db().from('holiday_centers').select('city, name, address, hours, audio_file').eq('id', centerId).maybeSingle()
  return (data as SpokenCenter | null) ?? null
}

export async function centerCapacities(): Promise<Record<string, number | null>> {
  const { data } = await db().from('holiday_centers').select('id, capacity')
  const out: Record<string, number | null> = {}
  for (const r of (data ?? []) as { id: string; capacity: number | null }[]) out[r.id] = r.capacity
  return out
}

export const openCenters = (distributionId: string) => loadOpenCenters(db(), distributionId)

/** שמירת מוקד — רק אם עוד לא נבחר (לא דורסים בחירה שנשמרה בינתיים). */
export async function saveCenterChoice(distributionId: string, recipientId: string, centerId: string): Promise<string | null> {
  const admin = db()
  const { error } = await admin.from('distribution_recipients').update({
    center_id: centerId, center_chosen_at: new Date().toISOString(), center_source: 'phone',
  }).eq('id', recipientId).is('center_id', null)
  if (error) return error.message
  // אחרי השמירה ובכוונה: כשל כאן אינו כשל בבחירה.
  await ensureCenterOpening(admin, distributionId, centerId)
  return null
}

export const loadCard = (targets: LoadTarget[], amount: number, opts: { expiryIso?: string | null; testMode?: boolean }): Promise<LoadSummary> =>
  runLoadBatch(db(), targets, amount, opts)

/** טעינה שנכשלה: מנקים את מספר הכרטיס כדי לאפשר ניסיון חוזר. */
export async function clearFailedCard(recipientId: string, error: string): Promise<void> {
  await db().from('distribution_recipients')
    .update({ card_number: null, card_linked_at: null, card_link_error: error }).eq('id', recipientId)
}
