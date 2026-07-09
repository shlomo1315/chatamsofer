import type { SupabaseClient } from '@supabase/supabase-js'

// זיהוי לקוח למייל היסטורי — אותו דפוס כמו resend-inbound (maybeAutoReplyIgud):
// ת"ז 9 ספרות בנושא (רשום או בן/בת זוג) → נפילה לכתובת השולח.
export async function resolveBeneficiaryId(
  admin: SupabaseClient,
  opts: { subject: string; fromEmail: string },
): Promise<string | null> {
  const idMatch = String(opts.subject ?? '').match(/\d{9}/)
  if (idMatch) {
    const id = idMatch[0]
    const { data } = await admin
      .from('beneficiaries')
      .select('id')
      .or(`id_number.eq.${id},spouse_id_number.eq.${id}`)
      .maybeSingle()
    if (data?.id) return data.id
  }
  const from = (opts.fromEmail || '').toLowerCase().trim()
  if (from && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
    const { data } = await admin.from('beneficiaries').select('id').ilike('email', from).maybeSingle()
    if (data?.id) return data.id
  }
  return null
}
