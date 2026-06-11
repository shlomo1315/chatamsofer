import Link from 'next/link'
import { Plus, CreditCard } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Loan } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import LoansTable from './LoansTable'

async function getLoans(): Promise<Loan[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('loans')
    .select('*, beneficiary:beneficiaries(full_name, family_name, id_number, spouse_name, spouse_id_number)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export default async function LoansPage() {
  const loans = await getLoans()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="הלוואות" subtitle={`${loans.length} הלוואות`}>
        <Link href="/admin/loans/new">
          <Button>
            <Plus size={16} />
            הלוואה חדשה
          </Button>
        </Link>
      </PageHeader>

      {loans.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CreditCard size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">לא נמצאו הלוואות</p>
          <p className="text-slate-400 text-sm mt-1">הוסף הלוואה חדשה להתחלה</p>
        </div>
      ) : (
        <LoansTable data={loans} />
      )}
    </div>
  )
}
