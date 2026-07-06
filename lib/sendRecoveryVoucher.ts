import type { SupabaseClient } from '@supabase/supabase-js'
import { buildRecoveryVoucherOnly } from './maternityVoucher'
import { recoveryDaysOf } from './maternity'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { shell } from './emailTemplates'

// שליחה מחדש של שובר ההבראה המעודכן ליולדת — לאחר עדכון ידני של ימי הזכאות.
// פועל רק אם הלידה מאושרת (active), לידה רגילה (לא שקטה), ויש כתובת מייל.
// לא חוסם / לא זורק — מחזיר תוצאה, ובכישלון מדלג בשקט.
export async function sendRecoveryVoucherUpdate(
  admin: SupabaseClient,
  aidId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, status, birth_type, birth_date, recovery_home, is_twins, recovery_eligibility_days, voucher_serial, beneficiary:beneficiaries(email, full_name, family_name, spouse_name, spouse_id_number, id_number, address, city, phone, spouse_phone)')
    .eq('id', aidId)
    .maybeSingle()

  if (!aid) return { sent: false, reason: 'not-found' }
  if (aid.status !== 'active') return { sent: false, reason: 'not-approved' }
  if ((aid.birth_type ?? 'live') === 'silent') return { sent: false, reason: 'silent' }

  const ben = aid.beneficiary as {
    email?: string | null; full_name?: string | null; family_name?: string | null
    spouse_name?: string | null; spouse_id_number?: string | null; id_number?: string | null
    address?: string | null; city?: string | null; phone?: string | null; spouse_phone?: string | null
  } | null
  if (!ben?.email) return { sent: false, reason: 'no-email' }

  const motherName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || (ben.full_name ?? '')
  const motherId = ben.spouse_id_number || ben.id_number
  const days = recoveryDaysOf({ recovery_eligibility_days: aid.recovery_eligibility_days, is_twins: aid.is_twins })

  const attachments = await buildRecoveryVoucherOnly({
    motherName, motherId, address: ben.address, city: ben.city, phone: ben.phone, spousePhone: ben.spouse_phone,
    birthDate: aid.birth_date, recoveryHome: aid.recovery_home, recoveryDays: days, serial: aid.voucher_serial,
  })

  const body = `
    <p style="margin:0 0 14px;color:#0f172a;font-size:18px;font-weight:800;">שלום ${motherName},</p>
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">
      ימי הזכאות שלכם בבית ההחלמה עודכנו. מצורף שובר הבראה <strong>מעודכן</strong>.
    </p>
    <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:14px 16px;margin:0 0 16px;">
      <p style="margin:0;color:#3730a3;font-size:15px;font-weight:700;">🏥 ימי זכאות בבית ההחלמה: ${days} ימים</p>
      ${aid.recovery_home ? `<p style="margin:6px 0 0;color:#4338ca;font-size:13px;">בית החלמה: ${aid.recovery_home}</p>` : ''}
    </div>
    <p style="margin:0;color:#64748b;font-size:13px;">נא להציג את השובר המעודכן בעת ההגעה לבית ההחלמה. לבירורים ניתן לפנות למזכירות היכל החתם סופר.</p>
  `
  const html = shell({
    preheader: `שובר ההבראה עודכן — ${days} ימי זכאות`,
    accent: '#4f46e5', title: 'שובר הבראה מעודכן', subtitle: 'אגף עזר ליולדות · היכל החתם סופר', body,
  })

  await deliverMail(ben.email, 'עדכון שובר הבראה ליולדת — היכל החתם סופר', html, attachments, mailFor('maternity'))
  return { sent: true }
}
