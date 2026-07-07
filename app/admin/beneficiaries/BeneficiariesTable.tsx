'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, Eye, Phone, Mail, MapPin, Clock, Check, X, Users, FileText } from 'lucide-react'
import DataTable, { Column } from '@/components/ui/DataTable'
import SortButtons, { SortMode } from '@/components/ui/SortButtons'
import Pagination from '@/components/ui/Pagination'
import QuickEmailModal from '@/components/QuickEmailModal'
import { useListParams } from '@/lib/useListParams'
import { Beneficiary, ELIGIBILITY_LABELS } from '@/types'

// תווית סטטוס מלאה לטבלה
const STATUS_CHIP: Record<string, string> = {
  pending:      'bg-amber-100 text-amber-800 ring-amber-200',
  review:       'bg-violet-100 text-violet-800 ring-violet-200',
  docs_pending: 'bg-blue-100 text-blue-800 ring-blue-200',
  approved:     'bg-green-100 text-green-800 ring-green-200',
  rejected:     'bg-red-100 text-red-800 ring-red-200',
}
const StatusChip = ({ status }: { status: string }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${STATUS_CHIP[status] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
    {ELIGIBILITY_LABELS[status as keyof typeof ELIGIBILITY_LABELS] ?? status}
  </span>
)

const fullName = (row: Beneficiary) =>
  [row.family_name, row.full_name].filter(Boolean).join(' ') || row.full_name

const initials = (row: Beneficiary) => {
  const name = fullName(row).trim()
  return name ? name.charAt(0) : '?'
}

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
]
const avatarColor = (id: string) => {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

const MARITAL_TINT: Record<string, string> = {
  'נישואים': 'bg-emerald-50 text-emerald-700',
  'גרוש': 'bg-slate-100 text-slate-600',
  'גרושה': 'bg-slate-100 text-slate-600',
  'אלמן': 'bg-amber-50 text-amber-700',
  'אלמנה': 'bg-amber-50 text-amber-700',
}

const buildColumns = (onEmail: (row: Beneficiary) => void): Column<Beneficiary>[] => [
  {
    key: 'full_name',
    header: 'שם מלא',
    sortable: true,
    className: 'min-w-[160px]',
    render: (row) => (
      <Link
        href={`/admin/beneficiaries/${row.id}`}
        className="flex items-center gap-2.5 group/name"
      >
        <div className="relative flex-shrink-0">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${avatarColor(row.id)}`}>
            {initials(row)}
          </span>
          {row.is_active !== false && (
            <span className="absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-white" />
          )}
        </div>
        <span className="font-medium text-slate-800 group-hover/name:text-indigo-600 truncate max-w-[130px]">
          {fullName(row)}
        </span>
      </Link>
    ),
  },
  {
    key: 'id_number',
    header: 'מספר ת.ז.',
    sortable: true,
    className: 'min-w-[100px]',
    render: (row) =>
      row.id_number ? (
        <span dir="ltr" className="font-mono text-xs text-slate-600 tabular-nums">{row.id_number}</span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    key: 'spouse_name',
    header: 'בן/בת זוג',
    sortable: true,
    className: 'min-w-[140px]',
    render: (row) =>
      row.spouse_name ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-slate-700 font-medium truncate max-w-[130px]">{row.spouse_name}</span>
          {row.spouse_id_number && (
            <span dir="ltr" className="font-mono text-[11px] text-slate-400 tabular-nums">{row.spouse_id_number}</span>
          )}
        </div>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    key: 'phone',
    header: 'טלפון',
    sortable: false,
    className: 'min-w-[120px]',
    render: (row) =>
      row.phone ? (
        <div dir="ltr" className="flex items-center gap-1.5 text-xs text-slate-600 tabular-nums w-fit">
          <Phone size={11} className="text-slate-400 flex-shrink-0" />
          <span>{row.phone}</span>
        </div>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    key: 'email',
    header: 'מייל',
    sortable: false,
    className: 'min-w-[150px]',
    render: (row) =>
      row.email ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEmail(row) }}
          dir="ltr"
          title="שליחת מייל מתוך המערכת"
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 hover:underline text-left w-fit"
        >
          <Mail size={11} className="text-slate-400 flex-shrink-0" />
          <span className="truncate max-w-[160px]">{row.email}</span>
        </button>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    key: 'city',
    header: 'עיר',
    sortable: true,
    className: 'min-w-[90px]',
    render: (row) =>
      row.city ? (
        <span className="inline-flex items-center gap-1 text-xs text-slate-600">
          <MapPin size={11} className="text-slate-400 flex-shrink-0" />
          <span className="truncate max-w-[90px]">{row.city}</span>
        </span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    key: 'marital_status',
    header: 'מצב משפחתי',
    sortable: true,
    className: 'min-w-[100px]',
    render: (row) =>
      row.marital_status ? (
        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
          MARITAL_TINT[row.marital_status] ?? 'bg-slate-100 text-slate-600'
        }`}>
          {row.marital_status}
        </span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    key: 'children_count',
    header: 'ילדים',
    className: 'text-center min-w-[60px]',
    sortable: true,
    render: (row) => (
      <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium tabular-nums">
        {row.children_count ?? 0}
      </span>
    ),
  },
  {
    key: 'eligibility_status',
    header: 'סטטוס',
    sortable: true,
    className: 'min-w-[120px]',
    render: (row) => <StatusChip status={row.eligibility_status} />,
  },
]

// Status filter buckets
type Filter = 'all' | 'pending' | 'review' | 'approved' | 'rejected' | 'docs_pending'
const matchesFilter = (row: Beneficiary, f: Filter) => {
  if (f === 'all') return true
  if (f === 'pending') return row.eligibility_status === 'pending'
  if (f === 'review') return row.eligibility_status === 'review'
  if (f === 'docs_pending') return row.eligibility_status === 'docs_pending'
  return row.eligibility_status === f
}

interface CardDef {
  key: Filter
  label: string
  icon: typeof Users
  base: string
  active: string
  iconCls: string
}
const CARD_DEFS: CardDef[] = [
  { key: 'all', label: 'הכל', icon: Users, base: 'border-slate-200 hover:border-slate-300', active: 'border-slate-400 ring-2 ring-slate-200 bg-slate-50', iconCls: 'bg-slate-100 text-slate-600' },
  { key: 'pending', label: 'ממתין לאישור ראשוני', icon: Clock, base: 'border-amber-200 hover:border-amber-300', active: 'border-amber-400 ring-2 ring-amber-200 bg-amber-50', iconCls: 'bg-amber-100 text-amber-700' },
  { key: 'docs_pending', label: 'השלמת מסמכים', icon: FileText, base: 'border-blue-200 hover:border-blue-300', active: 'border-blue-400 ring-2 ring-blue-200 bg-blue-50', iconCls: 'bg-blue-100 text-blue-700' },
  { key: 'approved', label: 'מאושר', icon: Check, base: 'border-green-200 hover:border-green-300', active: 'border-green-400 ring-2 ring-green-200 bg-green-50', iconCls: 'bg-green-100 text-green-700' },
  { key: 'rejected', label: 'לא מאושר', icon: X, base: 'border-red-200 hover:border-red-300', active: 'border-red-400 ring-2 ring-red-200 bg-red-50', iconCls: 'bg-red-100 text-red-700' },
]

interface Props {
  data: Beneficiary[]
  counts: Record<string, number>
  total: number
  page: number
  size: number
  status: string
  sort: string
}

export default function BeneficiariesTable({ data, counts, total, page, size, status, sort }: Props) {
  const [emailTarget, setEmailTarget] = useState<{ email: string; name: string } | null>(null)
  const { qInput, setSearch, setStatus, setSort, setSize, setPage } = useListParams()

  const columns = useMemo(
    () => buildColumns((row) => setEmailTarget({ email: row.email!, name: fullName(row) })),
    []
  )

  const activeFilter = (status || 'all') as Filter

  return (
    <div className="flex flex-col gap-5">
      {/* Status filter cards — ה-counts מגיעים מ-DB (מדויקים על כל הרשומות) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {CARD_DEFS.map((c) => {
          const Icon = c.icon
          const isActive = activeFilter === c.key
          return (
            <button
              key={c.key}
              onClick={() => setStatus(isActive && c.key !== 'all' ? 'all' : c.key)}
              className={`flex items-center gap-3 rounded-xl border bg-white p-3.5 text-right transition-all ${isActive ? c.active : c.base}`}
            >
              <span className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${c.iconCls}`}>
                <Icon size={18} />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{(counts[c.key] ?? 0).toLocaleString('he-IL')}</span>
                <span className="text-xs text-slate-500 mt-1 truncate">{c.label}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* חיפוש (רץ על כל הרשומות ב-DB) + מיון */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={qInput}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש חופשי בכל הרשומות..."
            className="w-full pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">מיון:</span>
          <SortButtons value={sort as SortMode} onChange={(m) => setSort(m)} />
        </div>
      </div>

      <DataTable
        data={data}
        columns={columns}
        rowHref={(row) => `/admin/beneficiaries/${row.id}`}
        serverMode
        emptyMessage={qInput ? 'לא נמצאו תוצאות לחיפוש.' : "לא נמצאו צאצאים. לחץ על 'רישום צאצא חדש' להוספה."}
        actions={(row) => (
          <Link href={`/admin/beneficiaries/${row.id}`}>
            <button className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50">
              <Eye size={14} />
              צפייה
            </button>
          </Link>
        )}
      />

      <Pagination page={page} size={size} total={total} onPage={setPage} onSize={setSize} />

      {emailTarget && (
        <QuickEmailModal
          to={emailTarget.email}
          toName={emailTarget.name}
          onClose={() => setEmailTarget(null)}
        />
      )}
    </div>
  )
}
