import Link from 'next/link'
import { Plus, Baby } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { MaternityAid } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import MaternityTable from './MaternityTable'
import RecoveryAmountApprovals, { type PendingAmount } from './RecoveryAmountApprovals'

async function getMaternityAids(): Promise<MaternityAid[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maternity_aids')
    .select('*, beneficiary:beneficiaries(id, full_name, family_name, phone, spouse_name, spouse_id_number, children, children_count), card_center:card_centers(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// סכומי החלמה שהוזנו ע"י בתי ההחלמה וממתינים לאישור
async function getPendingRecoveryAmounts(): Promise<PendingAmount[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('maternity_aids')
      .select('id, recovery_amount, recovery_home, recovery_amount_at, baby_name, beneficiary:beneficiaries(full_name, family_name, spouse_name)')
      .eq('recovery_amount_status', 'pending')
      .order('recovery_amount_at', { ascending: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((a: any) => ({
      id: a.id,
      recovery_amount: a.recovery_amount,
      recovery_home: a.recovery_home,
      recovery_amount_at: a.recovery_amount_at,
      babyName: a.baby_name ?? null,
      motherName: [a.beneficiary?.family_name, a.beneficiary?.spouse_name || a.beneficiary?.full_name].filter(Boolean).join(' ') || '—',
    }))
  } catch { return [] }
}

export default async function MaternityPage() {
  const [aids, pendingAmounts] = await Promise.all([getMaternityAids(), getPendingRecoveryAmounts()])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="יולדות" subtitle={`כל הלידות · ${aids.length}`}>
        <Link href="/admin/maternity/new">
          <Button>
            <Plus size={16} />
            לידה חדשה
          </Button>
        </Link>
      </PageHeader>

      <RecoveryAmountApprovals items={pendingAmounts} />

      {aids.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Baby size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">לא נמצאו תיקי יולדות</p>
          <p className="text-slate-400 text-sm mt-1">הוסף תיק יולדת חדש להתחלה</p>
        </div>
      ) : (
        <MaternityTable data={aids} showCard />
      )}
    </div>
  )
}
