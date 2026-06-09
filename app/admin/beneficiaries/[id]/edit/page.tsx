import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import BeneficiaryForm from '../../BeneficiaryForm'
import DocumentsManager from '../DocumentsManager'

async function getBeneficiary(id: string) {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data } = await supabase.from('beneficiaries').select('*').eq('id', id).single()
  return data
}

export default async function EditBeneficiaryPage({ params }: { params: Promise<{ id: string }> }) {
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
        children_count: String(b.children_count ?? 0),
        notes: b.notes ?? '',
        lineage_node_id: b.lineage_node_id ?? '',
        lineage_manual: Array.isArray(b.lineage_manual) ? (b.lineage_manual as string[]) : [],
        eligibility_status: b.eligibility_status ?? 'pending',
        children: Array.isArray(b.children)
          ? (b.children as { name?: string; id_number?: string; doc_type?: string; gender?: string; birth_date?: string; marital_status?: string; birth_status?: 'pending' | 'approved'; maternity_aid_id?: string }[]).map(
              (c) => ({
                name: c.name ?? '',
                id_number: c.id_number ?? '',
                doc_type: (c.doc_type === 'passport' ? 'passport' : 'id') as 'id' | 'passport',
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

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href={`/admin/beneficiaries/${id}`} className="text-slate-400 hover:text-slate-600">
          <ArrowRight size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">עריכת נתמך</h1>
          {b && <p className="text-sm text-slate-500 mt-0.5">{b.full_name}</p>}
        </div>
      </div>
      <BeneficiaryForm beneficiaryId={id} defaultValues={defaultValues} />
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <DocumentsManager beneficiaryId={id} />
      </div>
    </div>
  )
}
