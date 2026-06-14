import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from '@/lib/sendMail'
import { maternityCardEmail } from '@/lib/emailTemplates'

// שולח ליולדת מייל "כרטיס מזון אושר / שובר" (best-effort)
export async function sendCardVoucher(admin: SupabaseClient, aidId: string, centerName?: string | null) {
  try {
    const { data: aid } = await admin
      .from('maternity_aids')
      .select('beneficiary:beneficiaries(full_name, family_name, spouse_name, email)')
      .eq('id', aidId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ben = (aid as any)?.beneficiary
    if (!ben?.email) return
    const mail = maternityCardEmail(ben, { centerName })
    await deliverMail(ben.email, mail.subject, mail.html)
  } catch (e) {
    console.error('[maternityCards] voucher mail failed:', e)
  }
}

// מחשב כמה מקומות פנויים בכל מוקד פעיל
async function centersAvailability(admin: SupabaseClient) {
  const { data: centers } = await admin.from('card_centers').select('id, name, stock, is_active')
  const { data: used } = await admin
    .from('maternity_aids')
    .select('card_center_id, card_status')
    .in('card_status', ['approved', 'loaded'])
  const usedBy: Record<string, number> = {}
  for (const a of used ?? []) if (a.card_center_id) usedBy[a.card_center_id] = (usedBy[a.card_center_id] ?? 0) + 1
  return (centers ?? [])
    .filter(c => c.is_active)
    .map(c => ({ id: c.id as string, name: c.name as string, free: (c.stock as number) - (usedBy[c.id] ?? 0) }))
    .filter(c => c.free > 0)
}

// מעבד את תור "ממתין למלאי": משייך יולדות (ותיקות קודם) למוקדים פנויים,
// מעדכן ל-approved ושולח להן שובר אוטומטית. מחזיר כמה טופלו.
export async function processAwaitingStock(admin: SupabaseClient): Promise<number> {
  const avail = await centersAvailability(admin)
  if (!avail.length) return 0
  const { data: waiting } = await admin
    .from('maternity_aids')
    .select('id')
    .eq('card_status', 'awaiting_stock')
    .order('updated_at', { ascending: true })
  if (!waiting?.length) return 0

  let processed = 0
  for (const w of waiting) {
    const center = avail.find(c => c.free > 0)
    if (!center) break
    const { error } = await admin
      .from('maternity_aids')
      .update({ card_status: 'approved', card_center_id: center.id, updated_at: new Date().toISOString() })
      .eq('id', w.id)
    if (error) continue
    center.free--
    await sendCardVoucher(admin, w.id, center.name)
    processed++
  }
  return processed
}
