import { guardPage } from '@/lib/pageGuard'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { registrationSourceLabel } from '@/lib/distributionSources'
import BeneficiaryEditSheet from './BeneficiaryEditSheet'

async function getBeneficiary(id: string) {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data } = await supabase.from('beneficiaries').select('*').eq('id', id).single()
  return data
}

export default async function EditBeneficiaryPage({ params }: { params: Promise<{ id: string }> }) {
  await guardPage('beneficiaries')
  const { id } = await params
  const b = await getBeneficiary(id)
  if (!b && isSupabaseConfigured()) notFound()

  const defaultValues = b
    ? {
        family_name: b.family_name ?? '',
        id_number: b.id_number ?? '',
        id_doc_type: (b.id_doc_type === 'passport' ? 'passport' : 'id') as 'id' | 'passport',
        full_name: b.full_name ?? '',
        phone: b.phone ?? '',
        phone2: b.phone2 ?? '',
        email: b.email ?? '',
        address: b.address ?? '',
        city: b.city ?? '',
        birth_date: b.birth_date ?? '',
        gender: b.gender ?? '',
        marital_status: b.marital_status ?? '',
        spouse_name: b.spouse_name ?? '',
        spouse_id_number: b.spouse_id_number ?? '',
        spouse_doc_type: (b.spouse_doc_type === 'passport' ? 'passport' : 'id') as 'id' | 'passport',
        spouse_birth_date: b.spouse_birth_date ?? '',
        spouse_phone: b.spouse_phone ?? '',
        community_affiliation: b.community_affiliation ?? '',
        is_special: !!b.is_special,
        created_at: b.created_at ?? '',
        registration_source: registrationSourceLabel(b.registration_source) ?? '',
        notes: b.notes ?? '',
        lineage_node_id: b.lineage_node_id ?? '',
        lineage_manual: Array.isArray(b.lineage_manual) ? (b.lineage_manual as string[]) : [],
        eligibility_status: b.eligibility_status ?? 'pending',
        children: Array.isArray(b.children)
          ? (b.children as { name?: string; id_number?: string; doc_type?: string; id_doc_type?: string; gender?: string; birth_date?: string; marital_status?: string; birth_status?: 'pending' | 'approved'; maternity_aid_id?: string }[]).map(
              (c) => ({
                name: c.name ?? '',
                id_number: c.id_number ?? '',
                // 🔴 סוג המסמך נשמר תחת שני שמות: id_doc_type (27,549 רשומות,
                // מהן 279 בעלי דרכון) ו-doc_type (240). כפיית 'id' על
                // c.doc_type בלבד הציגה כל בעל דרכון ותיק כבעל ת"ז, ושמירה
                // הייתה מוחקת את הסימון. ראו lib/childrenEditor.
                doc_type: c.doc_type === 'passport' ? 'passport' as const
                  : c.doc_type === 'id' ? 'id' as const : undefined,
                id_doc_type: c.id_doc_type === 'passport' ? 'passport' as const
                  : c.id_doc_type === 'id' ? 'id' as const : undefined,
                gender: c.gender ?? '',
                birth_date: c.birth_date ?? '',
                marital_status: c.marital_status ?? '',
                birth_status: c.birth_status,
                maternity_aid_id: c.maternity_aid_id,
              })
            )
          : [],
      }
    : undefined

  if (!defaultValues) notFound()
  return <BeneficiaryEditSheet beneficiaryId={id} defaults={defaultValues} />
}
