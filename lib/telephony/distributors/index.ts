// שלוחת המפיצים בטכנוליין: טוענת את המפיץ לפי הטלפון ומבצעת את הפעולה, באותם כללים כמו בימות והאתר.
import { getServiceClient } from '@/lib/apiAuth'
import { normalizePhone } from '@/lib/kvitel'
import { isAgentAvailable } from '@/lib/gilyonotDistributors'
import { loadDistributorSettings, recordPhoneMessage, requestHilula, runDistributorAction } from '@/lib/gilyonotDistributorServer'
import { MAX_PICK, type PhoneDistributor } from '@/lib/gilyonotDistributorPhone'
import { goodbye } from '../modules'
import type { TlHandler } from '../types'
import { distributorTurn } from './turn'

const FAIL = (e: string) => goodbye(`${e}. נא להתקשר שוב מאוחר יותר`)

export const distributors: TlHandler = async ({ phone, params, callId }) => {
  const db = getServiceClient()
  if (!db) return goodbye('שגיאת שרת')
  const norm = normalizePhone(phone)
  let list: PhoneDistributor[] = []
  if (norm) {
    const { data } = await db.from('gilyonot_distributors').select('id, full_name, quantity, city, synagogue')
      .eq('status', 'active').or(`phone.eq.${norm},phone2.eq.${norm}`).order('created_at').limit(MAX_PICK)
    list = data ?? []
  }
  const settings = await loadDistributorSettings(db)
  const turn = distributorTurn(params, {
    distributors: list, hasPhone: !!norm, agentPhone: settings.agent_phone, agentOpen: isAgentAvailable(settings.agent_hours),
  })
  const a = turn.action
  if (!a) return turn.result

  let error: string | null = null
  if (a.kind === 'quantity') {
    const r = await runDistributorAction(db, a.distributorId, a.action, { quantity: a.quantity }, 'phone')
    if (!r.ok) error = r.error
  } else if (a.kind === 'leave') {
    const r = await runDistributorAction(db, a.distributorId, 'leave', { details: 'התנתקות בקו הטלפוני' }, 'phone')
    if (!r.ok) error = r.error
  } else if (a.kind === 'recording') {
    const r = await recordPhoneMessage(db, a.distributorId, a.purpose, a.path, a.transcript)
    if (!r.ok) error = r.error
  } else if (a.kind === 'hilula') {
    const r = await requestHilula(db, { distributorId: a.distributorId, phone: norm, guests: a.guests, channel: 'phone' })
    if (!r.ok) error = r.error
  }
  if (error) { console.error(`[telephony:distributors] ${a.kind} failed callId=${callId}:`, error); return FAIL(error) }
  return turn.result
}
