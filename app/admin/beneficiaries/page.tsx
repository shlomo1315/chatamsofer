import Link from 'next/link'
import { Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import BeneficiariesTable from './BeneficiariesTable'
import ExportExcelButton from '@/components/admin/ExportExcelButton'
import { AdminOnly } from '@/components/StaffPermissions'
import { readListParams } from '@/lib/listParams'
import { getBeneficiaries } from '@/lib/beneficiariesList'

export default async function BeneficiariesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const rawParams = await searchParams
  const p = readListParams({ get: (k) => rawParams[k] ?? null })
  // הרשימה הראשית — רק צאצאים רגילים (החריגים בדף נפרד: /admin/special-approvals)
  const { rows, total, counts } = await getBeneficiaries(p, false)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="צאצאים" subtitle={`${(counts.all ?? total).toLocaleString('he-IL')} רשומות`}>
        <ExportExcelButton type="beneficiaries" />
        <AdminOnly>
          <Link href="/admin/beneficiaries/new">
            <Button>
              <Plus size={16} />
              רישום צאצא חדש
            </Button>
          </Link>
        </AdminOnly>
      </PageHeader>

      <BeneficiariesTable
        data={rows}
        counts={counts}
        total={total}
        page={p.page}
        size={p.size}
        status={p.status}
        sort={p.sort}
        marital={p.marital}
      />
    </div>
  )
}
