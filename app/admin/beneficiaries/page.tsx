import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Beneficiary } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import BeneficiariesTable from './BeneficiariesTable'
import ExportExcelButton from '@/components/admin/ExportExcelButton'
import { AdminOnly } from '@/components/StaffPermissions'
import { readListParams } from '@/lib/useListParams'

// רק העמודות שטבלת הרשימה מציגה/ממיינת/מחפשת בהן — משמיט שדות כבדים (children JSON,
// lineage_chain, lineage_manual וכו') מה-payload. כרטיס המוטב וייצוא האקסל מושכים את הנתונים המלאים בנפרד.
const LIST_COLUMNS =
  'id, created_at, full_name, family_name, id_number, phone, phone2, email, address, city, ' +
  'marital_status, spouse_name, spouse_id_number, nedarim_id, notes, children_count, eligibility_status, is_active'

// כרטיסי הסטטוס שהטבלה מציגה — ה-counts נשלפים לכל אחד בנפרד מ-DB.
const STATUS_KEYS = ['pending', 'docs_pending', 'approved', 'rejected', 'review'] as const

// עמודות שהחיפוש החופשי מכסה (ilike). trigram indexes קיימים על שם/טלפון.
const SEARCH_COLUMNS = [
  'full_name', 'family_name', 'id_number', 'phone', 'phone2', 'email',
  'address', 'city', 'marital_status', 'spouse_name', 'spouse_id_number', 'nedarim_id',
]

function escapeOr(v: string) {
  // ב-.or() של PostgREST פסיק/סוגריים הם תוחמים — מנטרלים אותם מקלט המשתמש.
  return v.replace(/[,()]/g, ' ')
}

const searchOr = (term: string) =>
  SEARCH_COLUMNS.map((c) => `${c}.ilike.%${escapeOr(term)}%`).join(',')

interface ListResult {
  rows: Beneficiary[]
  total: number
  counts: Record<string, number>
}

async function getBeneficiaries(p: ReturnType<typeof readListParams>): Promise<ListResult> {
  if (!isSupabaseConfigured()) return { rows: [], total: 0, counts: { all: 0 } }
  const supabase = await createClient()

  const ascending = p.sort === 'oldest' || p.sort === 'alpha'
  const orderCol = p.sort === 'alpha' ? 'family_name' : 'created_at'
  const from = (p.page - 1) * p.size
  const to = from + p.size - 1

  // ── שאילתת הנתונים (עמוד אחד) + total התואם לפילטר ──
  let dataQ = supabase
    .from('beneficiaries')
    .select(LIST_COLUMNS, { count: 'exact' })
  if (p.status !== 'all') dataQ = dataQ.eq('eligibility_status', p.status)
  if (p.q) dataQ = dataQ.or(searchOr(p.q))
  const { data, error, count } = await dataQ.order(orderCol, { ascending }).range(from, to)
  if (error) throw error

  // ── ספירות לכרטיסים — count לכל סטטוס (מכבד חיפוש פעיל), במקביל ──
  const countFor = async (status: string): Promise<[string, number]> => {
    let q = supabase.from('beneficiaries').select('id', { count: 'exact', head: true })
    if (status !== 'all') q = q.eq('eligibility_status', status)
    if (p.q) q = q.or(searchOr(p.q))
    const { count: c } = await q
    return [status, c ?? 0]
  }
  const countPairs = await Promise.all(['all', ...STATUS_KEYS].map(countFor))
  const counts = Object.fromEntries(countPairs) as Record<string, number>

  return { rows: (data ?? []) as unknown as Beneficiary[], total: count ?? 0, counts }
}

export default async function BeneficiariesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const rawParams = await searchParams
  const p = readListParams({ get: (k) => rawParams[k] ?? null })
  const { rows, total, counts } = await getBeneficiaries(p)

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
      />
    </div>
  )
}
