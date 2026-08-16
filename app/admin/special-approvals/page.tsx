import { guardAdminPage } from '@/lib/pageGuard'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import BeneficiariesTable from '@/app/admin/beneficiaries/BeneficiariesTable'
import { readListParams } from '@/lib/listParams'
import { getBeneficiaries } from '@/lib/beneficiariesList'

// דף "אישורים חריגים" — אנשים שאינם צאצאים (נכדים) שהמנהל אישר להם להגיש
// בקשות. משתמש חוזר באותה טבלה ובאותם מסכי פרטים כמו הצאצאים, מסונן
// is_special=true.

// מנהל הראשי בלבד — מזכירות אינה רשאית לגשת (גם לא ב-URL ישיר).
async function assertAdmin() {
  if (!isSupabaseConfigured()) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') redirect('/admin')
}

export default async function SpecialApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await guardAdminPage()
  await assertAdmin()
  const rawParams = await searchParams
  const p = readListParams({ get: (k) => rawParams[k] ?? null })
  const { rows, total, counts } = await getBeneficiaries(p, true)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="אישורים חריגים"
        subtitle={`${(counts.all ?? total).toLocaleString('he-IL')} רשומות · אנשים שאושרו ידנית (אינם צאצאים)`}
      />

      <BeneficiariesTable
        data={rows}
        counts={counts}
        total={total}
        page={p.page}
        size={p.size}
        status={p.status}
        sort={p.sort}
        marital={p.marital}
        cardKeys={['all', 'pending', 'approved']}
        headerAction={
          <Link href="/admin/beneficiaries/new?special=1">
            <Button>
              <Plus size={16} />
              רישום אדם חריג חדש
            </Button>
          </Link>
        }
      />
    </div>
  )
}
