import Link from 'next/link'
import { Plus, CreditCard } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Loan } from '@/types'
import Button from '@/components/ui/Button'
import LoansTable from './LoansTable'

async function getLoans(): Promise<Loan[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('loans')
      .select('*, beneficiary:beneficiaries(full_name, family_name, id_number, spouse_name, spouse_id_number)')
      .order('created_at', { ascending: false })
    return data ?? []
  } catch {
    return []
  }
}

export default async function LoansPage() {
  const loans = await getLoans()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">הלוואות</h1>
          <p className="text-sm text-slate-500 mt-0.5">{loans.length} הלוואות</p>
        </div>
        <Link href="/admin/loans/new">
          <Button>
            <Plus size={16} />
            הלוואה חדשה
          </Button>
        </Link>
      </div>

      {loans.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <CreditCard size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 text-sm">לא נמצאו הלוואות</p>
        </div>
      ) : (
        <LoansTable data={loans} />
      )}
    </div>
  )
}
