// גישה לנתונים של שלוחת היולדות — מופרד מהשיחה כדי שאפשר יהיה לבדוק את כל המסלולים.
// הלוגיקה זהה לשלוחה הקודמת, שהוסרה.
import { addDays } from 'date-fns'
import { getServiceClient } from '@/lib/apiAuth'
import { cardWindowEnd, CARD_WINDOW_DAYS } from '@/lib/maternity'
import { findByPhone } from '../shared/phone'

const BENEFICIARY_COLS = 'id, full_name, family_name, spouse_name, id_number, spouse_id_number, phone, phone2, spouse_phone, nedarim_id'

export type Family = {
  id: string; full_name: string | null; family_name: string | null; spouse_name: string | null
  id_number: string | null; spouse_id_number: string | null
  phone: string | null; phone2: string | null; spouse_phone: string | null; nedarim_id: string | null
}
export type Aid = {
  id: string; birth_date: string; six_weeks_end: string | null; card_number: string | null; status: string | null
  card_center_id: string | null; card_status: string | null; card_load_status: string | null; card_tlush_id: string | null
}
export type Lookup =
  | { kind: 'error'; error: string }
  | { kind: 'notFound' }
  | { kind: 'noBirth'; familyId: string; familyName: string }
  | { kind: 'active'; family: Family; aid: Aid; familyName: string }

function db() {
  const admin = getServiceClient()
  if (!admin) throw new Error('Supabase אינו מוגדר')
  return admin
}

export async function findActiveAid(callerPhone: string): Promise<Lookup> {
  const admin = db()
  const { row: family, error } = await findByPhone<Family>(admin, BENEFICIARY_COLS, callerPhone)
  if (error) return { kind: 'error', error }
  if (!family) return { kind: 'notFound' }
  const { data, error: aidErr } = await admin.from('maternity_aids')
    .select('id, birth_date, six_weeks_end, card_number, status, card_center_id, card_status, card_load_status, card_tlush_id')
    .eq('beneficiary_id', family.id).order('birth_date', { ascending: false }).limit(20)
  if (aidErr) return { kind: 'error', error: aidErr.message }
  const now = new Date()
  // ⚠️ החלון הוא 6 שבועות (תוקף הכרטיס), לא 5 השבועות של בית ההחלמה. לא "לתקן" ל-35.
  const aid = ((data ?? []) as Aid[]).filter((a) => a.status !== 'cancelled').find((a) =>
    (cardWindowEnd(a) ?? addDays(new Date(a.birth_date), CARD_WINDOW_DAYS)) >= now)
  const familyName = [family.family_name, family.spouse_name || family.full_name].filter(Boolean).join(' ')
  if (!aid) return { kind: 'noBirth', familyId: family.id, familyName }
  return { kind: 'active', family, aid, familyName }
}

/** חובר בפועל בנדרים (יש רישום phone_card_registered), ולא רק נשמר מספר בהקלדה שלא הושלמה. */
export async function isCardRegistered(aidId: string): Promise<boolean> {
  const { data } = await db().from('activity_log').select('id')
    .eq('action', 'phone_card_registered').eq('entity_id', aidId).limit(1)
  return Array.isArray(data) && data.length > 0
}

export async function setCardNumber(aidId: string, card: string | null) {
  await db().from('maternity_aids').update({ card_number: card }).eq('id', aidId)
}

export async function saveNedarimId(familyId: string, nedarimId: string) {
  await db().from('beneficiaries').update({ nedarim_id: nedarimId }).eq('id', familyId).then(undefined, () => {})
}

export async function saveLinkError(aidId: string, error: string) {
  await db().from('maternity_aids').update({ card_load_error: error }).eq('id', aidId).then(undefined, () => {})
}

/**
 * רישום איסוף אחרי שיוך מוצלח. אידמפוטנטי: אם האיסוף כבר נרשם (שיחה כפולה) — לא
 * מורידים שוב מהמונה. מחזיר את שם המוקד ואם זו הפעם הראשונה.
 */
export async function markPickedUp(aid: Aid, card: string): Promise<{ centerName: string; firstTime: boolean }> {
  const admin = db()
  const { data: cur } = await admin.from('maternity_aids').select('card_picked_up_at').eq('id', aid.id).maybeSingle()
  const firstTime = !cur?.card_picked_up_at
  let centerName = ''
  if (aid.card_center_id) {
    const { data: ctr } = await admin.from('card_centers').select('name').eq('id', aid.card_center_id).maybeSingle()
    centerName = ctr?.name ?? ''
    if (firstTime) {
      try { await admin.rpc('bump_center_pending_pickups', { p_center_id: aid.card_center_id, p_delta: -1 }) } catch { /* לא חוסם */ }
    }
  }
  if (firstTime) {
    await admin.from('maternity_aids').update({ card_picked_up_at: new Date().toISOString(), card_number: card, card_load_error: null }).eq('id', aid.id)
  }
  return { centerName, firstTime }
}

/** רישום ל-activity_log. best-effort — לא חוסם את השיחה. */
export async function logActivity(action: string, entityType: string, entityId: string | null, details: Record<string, unknown>) {
  try {
    await db().from('activity_log').insert({ user_id: null, action, entity_type: entityType, entity_id: entityId, details })
  } catch { /* לא חוסם */ }
}
