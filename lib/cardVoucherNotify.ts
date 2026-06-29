// שליחת שובר כרטיס המזון ליולדות שהמתינו למלאי, ברגע שהמלאי במוקד התחדש.
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { cardStockReplenishedEmail } from './emailTemplates'
import { buildCardVoucherOnly } from './maternityVoucher'

type Ben = {
  full_name: string | null; family_name: string | null; spouse_name: string | null
  id_number: string | null; spouse_id_number: string | null; phone: string | null; address: string | null; city: string | null; email: string | null
}
type Aid = {
  id: string; birth_date: string | null; voucher_serial: string | null
  beneficiary: Ben | Ben[] | null
}

// כשהמלאי במוקד מתחדש — שולחים שובר כרטיס לכל הלידות שממתינות (card_voucher_status='awaiting_stock')
// באותו מוקד, מסמנים 'issued' ומעדכנים את מונה הממתינים. best-effort, לא זורק.
export async function notifyCenterStockReplenished(admin: SupabaseClient, centerId: string): Promise<number> {
  try {
    const { data: center } = await admin
      .from('card_centers')
      .select('id, name, city, address, pickup_days, pickup_hours, stock')
      .eq('id', centerId)
      .maybeSingle()
    if (!center || (center.stock ?? 0) <= 0) return 0

    const { data: aids } = await admin
      .from('maternity_aids')
      .select('id, birth_date, voucher_serial, beneficiary:beneficiaries(full_name, family_name, spouse_name, id_number, spouse_id_number, phone, address, city, email)')
      .eq('card_center_id', centerId)
      .eq('card_voucher_status', 'awaiting_stock')
      .eq('status', 'active')
      .neq('birth_type', 'silent')

    let sent = 0
    for (const aid of (aids ?? []) as Aid[]) {
      const ben = Array.isArray(aid.beneficiary) ? aid.beneficiary[0] : aid.beneficiary
      if (!ben?.email) continue
      const motherName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || (ben.full_name ?? '')
      try {
        const att = await buildCardVoucherOnly({
          motherName, motherId: ben.spouse_id_number || ben.id_number, address: ben.address, city: ben.city, phone: ben.phone,
          birthDate: aid.birth_date, serial: aid.voucher_serial, centers: [center],
        })
        const mail = cardStockReplenishedEmail(motherName, center.name)
        await deliverMail(ben.email, mail.subject, mail.html, att, mailFor('maternity'))
        await admin.from('maternity_aids').update({ card_voucher_status: 'issued' }).eq('id', aid.id)
        await admin.rpc('bump_center_pending_pickups', { p_center_id: centerId, p_delta: 1 })
        sent++
      } catch (e) {
        console.error('[cardVoucherNotify] failed for aid', aid.id, e instanceof Error ? e.message : String(e))
      }
    }
    return sent
  } catch (e) {
    console.error('[cardVoucherNotify] error', e instanceof Error ? e.message : String(e))
    return 0
  }
}
