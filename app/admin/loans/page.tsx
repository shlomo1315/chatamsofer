import Link from 'next/link'
import { Plus, CreditCard, ExternalLink } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Loan } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import LoansTable from './LoansTable'
import ExportExcelButton from '@/components/admin/ExportExcelButton'
import LoansPortalEmailButton from './LoansPortalEmailButton'
import { AdminOnly } from '@/components/StaffPermissions'

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

/**
 * לכל בקשה שבבירור — האם המבקש כבר השיב.
 * ההודעה האחרונה בשרשור קובעת: 'staff' = ממתינים לתשובתו, 'applicant' = הוא
 * השיב וממתין לטיפולנו. זה מה שמפריד את שתי הקבוצות בקובייה "בתהליך בירור".
 */
async function getReplied(loanIds: string[]): Promise<string[]> {
  if (!loanIds.length || !isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('loan_messages')
    .select('loan_id, direction, created_at')
    .in('loan_id', loanIds)
    .order('created_at', { ascending: true })

  const last = new Map<string, string>()
  for (const m of data ?? []) last.set(String(m.loan_id), String(m.direction))
  return [...last.entries()].filter(([, dir]) => dir === 'applicant').map(([id]) => id)
}

export default async function LoansPage() {
  const loans = await getLoans()
  const replied = await getReplied(
    loans.filter(l => l.status === 'inquiry').map(l => String(l.id)),
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="הלוואות" subtitle={`${loans.length} הלוואות`}>
        <ExportExcelButton type="loans" />
        <Link href="/shared/loans" target="_blank" rel="noopener noreferrer">
          <Button variant="secondary">
            <ExternalLink size={16} />
            פורטל ביצוע
          </Button>
        </Link>
        <LoansPortalEmailButton />
        <AdminOnly>
          <Link href="/admin/loans/new">
            <Button>
              <Plus size={16} />
              הלוואה חדשה
            </Button>
          </Link>
        </AdminOnly>
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
        <LoansTable data={loans} repliedIds={replied} />
      )}
    </div>
  )
}
