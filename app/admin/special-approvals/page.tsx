import { guardPage } from '@/lib/pageGuard'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import BeneficiariesTable from '@/app/admin/beneficiaries/BeneficiariesTable'
import { readListParams } from '@/lib/listParams'
import { getBeneficiaries } from '@/lib/beneficiariesList'
import AddToDistributionPanel from './AddToDistributionPanel'
import ApprovalLabelsPanel from './ApprovalLabelsPanel'
import AssignLabelPanel from './AssignLabelPanel'
import ImportExcelPanel from './ImportExcelPanel'
import { approvalLabelOf } from '@/lib/approvalLabel'

// דף "אישורים חריגים" — אנשים שאינם צאצאים (נכדים) שהמנהל אישר להם להגיש
// בקשות. משתמש חוזר באותה טבלה ובאותם מסכי פרטים כמו הצאצאים, מסונן
// is_special=true.
//
// הגישה לפי המחלקה 'special_approvals' במסך ההרשאות (מנהל — תמיד). עד אז
// המסך היה למנהל הראשי בלבד, בלי דרך לפתוח אותו לאיש צוות מסוים.

export default async function SpecialApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await guardPage('special_approvals')
  const rawParams = await searchParams
  const p = readListParams({ get: (k) => rawParams[k] ?? null })
  const { rows, total, counts } = await getBeneficiaries(p, true)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="אישורים חריגים"
        subtitle={`${(counts.all ?? total).toLocaleString('he-IL')} רשומות · אנשים שאושרו ידנית (אינם צאצאים)`}
      />

      {/* ייבוא מאקסל — מעל הטבלה, פותח את עצמו בלחיצה כדי לא לתפוס מקום
          במסך שרוב הזמן משמש לעיון ולא לייבוא. */}
      <ImportExcelPanel />

      {/* ⚠️ פאנל נפרד מעל הטבלה ולא בתוכה: BeneficiariesTable משותפת עם
          מסך הצאצאים, ושינוי בה היה נוגע גם שם. */}
      <ApprovalLabelsPanel />

      <AddToDistributionPanel
        people={rows.map(r => ({
          id: String(r.id),
          name: [r.family_name, r.full_name].filter(Boolean).join(' ') || (r.full_name ?? '—'),
          id_number: r.id_number ?? null,
          city: r.city ?? null,
          phone: r.phone ?? null,
        }))}
      />

      <AssignLabelPanel
        people={rows.map(r => ({
          id: String(r.id),
          name: [r.family_name, r.full_name].filter(Boolean).join(' ') || (r.full_name ?? '—'),
          id_number: r.id_number ?? null,
          city: r.city ?? null,
          phone: r.phone ?? null,
          approval_label: approvalLabelOf(r),
        }))}
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
