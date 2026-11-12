// תיקון שיוך כרטיס ליולדת: איתור הלקוח הנכון בנדרים לפי ת"ז, שיוך הכרטיס ואימות בכרטסת.
// ⚠️ ההצלחה נקבעת רק לפי הכרטסת (hasActiveCard), לא לפי ניסוח ההודעה של נדרים.
import type { SupabaseClient } from '@supabase/supabase-js'
import { findClientByZeout, setMagneticCard, getClientCardFull, type NedarimCreds } from '@/lib/nedarim'
import { logActivity } from '@/lib/activityLog'

export const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

type CardRow = { MagneticCard?: unknown; CardNumber?: unknown; RemovedDate?: unknown }

export function hasActiveCard(full: unknown, card: string): boolean {
  const cards = (full as { Cards?: unknown } | null)?.Cards
  if (!Array.isArray(cards) || !card) return false
  return (cards as CardRow[]).some(c => !c.RemovedDate && [c.MagneticCard, c.CardNumber].some(v => digits(v) === card))
}

export type RelinkResult =
  | { status: 'linked'; before: string | null; target: string; message: string }
  | { status: 'taken'; before: string | null; target: string; message: string }
  | { status: 'failed'; error: string; before?: string | null }

type Ben = { id: string; id_number: string | null; spouse_id_number: string | null; nedarim_id: string | null }

export async function relinkMaternityCard(db: SupabaseClient, creds: NedarimCreds, aidId: string, userId: string | null): Promise<RelinkResult> {
  const { data } = await db.from('maternity_aids')
    .select('id, card_number, card_picked_up_at, beneficiary:beneficiaries(id, id_number, spouse_id_number, nedarim_id)')
    .eq('id', aidId).maybeSingle()
  const aid = data as unknown as { id: string; card_number: string | null; card_picked_up_at: string | null; beneficiary: Ben | Ben[] | null } | null
  const b = Array.isArray(aid?.beneficiary) ? (aid?.beneficiary[0] ?? null) : (aid?.beneficiary ?? null)
  const card = digits(aid?.card_number)
  if (!aid || !b || !card) return { status: 'failed', error: 'לא נמצאו רשומה או מספר כרטיס' }
  const before = b.nedarim_id ? String(b.nedarim_id) : null

  let target: string | null = null
  for (const z of [b.id_number, b.spouse_id_number].filter(Boolean)) {
    if (target) break
    try { target = await findClientByZeout(creds, String(z)) } catch { /* הבא */ }
  }
  target = target ?? before
  if (!target) return { status: 'failed', error: 'לא נמצא לקוח בנדרים לפי ת"ז', before }

  let message = ''
  try { message = (await setMagneticCard(creds, target, card, { timeoutMs: 15_000 })).message } catch (e) { message = e instanceof Error ? e.message : String(e) }
  let verified = false
  try { verified = hasActiveCard(await getClientCardFull(creds, target), card) } catch { /* verified=false */ }

  const last4 = card.slice(-4)
  if (!verified) {
    await logActivity(db, { userId, action: 'maternity_card_relink_failed', entityType: 'maternity_aid', entityId: aid.id, details: { target, card_last4: last4, nedarimMessage: message } })
    return { status: 'taken', before, target, message }
  }
  if (target !== before) await db.from('beneficiaries').update({ nedarim_id: target }).eq('id', b.id)
  await db.from('maternity_aids').update({ card_load_error: null, ...(aid.card_picked_up_at ? {} : { card_picked_up_at: new Date().toISOString() }) }).eq('id', aid.id)
  await logActivity(db, { userId, action: 'maternity_card_relinked', entityType: 'maternity_aid', entityId: aid.id, details: { old_nedarim_id: before, new_nedarim_id: target, card_last4: last4, nedarimMessage: message } })
  return { status: 'linked', before, target, message }
}
