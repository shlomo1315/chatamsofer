'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Eye, Phone, MapPin, Clock, Check, X, Users } from 'lucide-react'
import DataTable, { Column } from '@/components/ui/DataTable'
import StatusBadge from '@/components/ui/StatusBadge'
import { Beneficiary } from '@/types'

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

const columns: Column<Beneficiary>[] = [
  {
    key: 'full_name',
    header: 'שם מלא',
    sortable: true,
    render: (row) => (
      <Link
        href={`/admin/beneficiaries/${row.id}`}
        className="flex items-center gap-3 group/name"
      >
        <span className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${avatarColor(row.id)}`}>
          {initials(row)}
        </span>
        <span className="flex flex-col min-w-0">
          <span className="font-medium text-slate-800 group-hover/name:text-indigo-600 truncate">
            {fullName(row)}
          </span>
          {row.id_number ? (
            <span dir="ltr" className="font-mono text-[11px] text-slate-400 text-left tabular-nums">
              {row.id_number}
            </span>
          ) : null}
        </span>
      </Link>
    ),
  },
  {
    key: 'id_number',
    header: 'מספר זהות',
    sortable: true,
    render: (row) =>
      row.id_number ? (
        <span dir="ltr" className="font-mono text-xs text-slate-600 inline-block text-left tabular-nums">{row.id_number}</span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    key: 'spouse_name',
    header: 'שם האישה',
    sortable: true,
    render: (row) =>
      row.spouse_name ? (
        <span className="text-sm text-slate-700">{row.spouse_name}</span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    key: 'spouse_id_number',
    header: 'ת.ז. האישה',
    sortable: true,
    render: (row) =>
      row.spouse_id_number ? (
        <span dir="ltr" className="font-mono text-xs text-slate-600 inline-block text-left tabular-nums">{row.spouse_id_number}</span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    key: 'phone',
    header: 'טלפון',
    sortable: true,
    render: (row) =>
      row.phone ? (
        <div dir="ltr" className="flex items-center justify-end gap-1.5 text-xs text-slate-600 tabular-nums">
          <Phone size={12} className="text-slate-400 flex-shrink-0" />
          <span>{row.phone}</span>
        </div>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    key: 'city',
    header: 'עיר',
    sortable: true,
    render: (row) =>
      row.city ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <MapPin size={12} className="text-slate-400" />
          {row.city}
        </span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    key: 'marital_status',
    header: 'מצב משפחתי',
    sortable: true,
    render: (row) =>
      row.marital_status ? (
        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
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
    className: 'text-center',
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
    render: (row) => <StatusBadge status={row.eligibility_status} />,
  },
  {
    key: 'is_active',
    header: 'פעיל',
    className: 'text-center',
    sortable: true,
    render: (row) =>
      row.is_active ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          פעיל
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
          לא פעיל
        </span>
      ),
  },
]

// Status filter buckets
type Filter = 'all' | 'pending' | 'approved' | 'rejected'
const matchesFilter = (row: Beneficiary, f: Filter) => {
  if (f === 'all') return true
  if (f === 'pending') return row.eligibility_status === 'pending' || row.eligibility_status === 'review'
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
  { key: 'pending', label: 'ממתין לאישור', icon: Clock, base: 'border-amber-200 hover:border-amber-300', active: 'border-amber-400 ring-2 ring-amber-200 bg-amber-50', iconCls: 'bg-amber-100 text-amber-700' },
  { key: 'approved', label: 'מאושר', icon: Check, base: 'border-green-200 hover:border-green-300', active: 'border-green-400 ring-2 ring-green-200 bg-green-50', iconCls: 'bg-green-100 text-green-700' },
  { key: 'rejected', label: 'לא מאושר', icon: X, base: 'border-red-200 hover:border-red-300', active: 'border-red-400 ring-2 ring-red-200 bg-red-50', iconCls: 'bg-red-100 text-red-700' },
]

export default function BeneficiariesTable({ data, initialFilter = 'all' }: { data: Beneficiary[], initialFilter?: Filter }) {
  const [filter, setFilter] = useState<Filter>(initialFilter)

  const counts = useMemo(() => ({
    all: data.length,
    pending: data.filter((r) => matchesFilter(r, 'pending')).length,
    approved: data.filter((r) => matchesFilter(r, 'approved')).length,
    rejected: data.filter((r) => matchesFilter(r, 'rejected')).length,
  }), [data])

  const filtered = useMemo(() => data.filter((r) => matchesFilter(r, filter)), [data, filter])

  return (
    <div className="flex flex-col gap-5">
      {/* Status filter cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CARD_DEFS.map((c) => {
          const Icon = c.icon
          const isActive = filter === c.key
          return (
            <button
              key={c.key}
              onClick={() => setFilter(isActive && c.key !== 'all' ? 'all' : c.key)}
              className={`flex items-center gap-3 rounded-xl border bg-white p-3.5 text-right transition-all ${isActive ? c.active : c.base}`}
            >
              <span className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${c.iconCls}`}>
                <Icon size={18} />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{counts[c.key]}</span>
                <span className="text-xs text-slate-500 mt-1 truncate">{c.label}</span>
              </span>
            </button>
          )
        })}
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        rowHref={(row) => `/admin/beneficiaries/${row.id}`}
        searchable
        searchPlaceholder="חיפוש חופשי בכל השדות..."
        searchKeys={['full_name', 'family_name', 'id_number', 'phone', 'phone2', 'email', 'address', 'city', 'marital_status', 'spouse_name', 'spouse_id_number', 'nedarim_id', 'notes']}
        emptyMessage="לא נמצאו נתמכים. לחץ על 'רישום נתמך חדש' להוספה."
        actions={(row) => (
          <Link href={`/admin/beneficiaries/${row.id}`}>
            <button className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50">
              <Eye size={14} />
              צפייה
            </button>
          </Link>
        )}
      />
    </div>
  )
}
