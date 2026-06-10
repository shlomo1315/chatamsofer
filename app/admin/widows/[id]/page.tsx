import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, HeartHandshake } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { Beneficiary, WidowRequest, WidowSupportPayment } from '@/types'
import FamilyFile from './FamilyFile'

async function getFamily(id: string) {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = await createClient()
    const [{ data: widow }, { data: requests }, { data: payments }] = await Promise.all([
      supabase.from('beneficiaries').select('*').eq('id', id).single(),
      supabase.from('widow_requests').select('*').eq('beneficiary_id', id).order('created_at', { ascending: false }),
      supabase.from('widow_support_payments').select('*').eq('beneficiary_id', id).order('paid_at', { ascending: false }),
    ])
    if (!widow) return null
    return {
      widow: widow as Beneficiary,
      requests: (requests as WidowRequest[]) ?? [],
      payments: (payments as WidowSupportPayment[]) ?? [],
    }
  } catch { return null }
}

export default async function FamilyFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getFamily(id)
  if (!data && isSupabaseConfigured()) notFound()
  if (!data) return <div className="max-w-2xl bg-white rounded-xl border p-8 text-center text-slate-400">הגדר Supabase לצפייה</div>

  const { widow, requests, payments } = data
  const name = [widow.family_name, widow.full_name].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/widows" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <HeartHandshake size={18} className="text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">תיק משפחת {name}</h1>
          <p className="text-sm text-slate-500 ltr-num">{widow.id_number}</p>
        </div>
      </div>

      <FamilyFile widow={widow} requests={requests} payments={payments} />
    </div>
  )
}
