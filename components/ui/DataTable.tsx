'use client'
import { ReactNode, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, Search } from 'lucide-react'

export interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => ReactNode
  sortable?: boolean
  className?: string
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  searchable?: boolean
  searchPlaceholder?: string
  searchKeys?: (keyof T)[]
  emptyMessage?: string
  loading?: boolean
  actions?: (row: T) => ReactNode
  rowHref?: (row: T) => string
}

export default function DataTable<T extends { id: string }>({
  data,
  columns,
  searchable,
  searchPlaceholder = 'חיפוש...',
  searchKeys = [],
  emptyMessage = 'אין נתונים להצגה',
  loading,
  actions,
  rowHref,
}: DataTableProps<T>) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const q = search.trim().toLowerCase()
  const filtered = q.length >= 2
    ? data.filter((row) => {
        const keys = searchKeys.length ? searchKeys : (Object.keys(row) as (keyof T)[])
        return keys.some((k) => {
          const val = (row as Record<string, unknown>)[k as string]
          if (val == null || typeof val === 'object') return false
          return String(val).toLowerCase().includes(q)
        })
      })
    : data

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortKey]
        const bv = (b as Record<string, unknown>)[sortKey]
        let cmp: number
        if (typeof av === 'number' && typeof bv === 'number') {
          cmp = av - bv
        } else if (typeof av === 'boolean' && typeof bv === 'boolean') {
          cmp = (av === bv) ? 0 : av ? 1 : -1
        } else {
          cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'he', { numeric: true })
        }
        return sortDir === 'asc' ? cmp : -cmp
      })
    : filtered

  const totalPages = Math.ceil(sorted.length / pageSize)
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize)

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-3">
      {searchable && (
        <div className="relative">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
        <table className="w-full text-sm text-right border-collapse">
          <thead>
            <tr className="bg-gradient-to-b from-slate-50 to-slate-100/60 border-b border-slate-200">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={`px-4 py-3.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap ${col.className ?? ''} ${col.sortable ? 'cursor-pointer hover:text-indigo-600 select-none transition-colors' : ''}`}
                  onClick={() => col.sortable && toggleSort(String(col.key))}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.header}</span>
                    {col.sortable && sortKey === String(col.key) && (
                      sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                    )}
                  </div>
                </th>
              ))}
              {actions && <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap text-center">פעולות</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={String(col.key)} className="px-4 py-3.5">
                      <div className="h-4 bg-slate-100 rounded animate-pulse" />
                    </td>
                  ))}
                  {actions && <td className="px-4 py-3.5"><div className="h-4 w-16 bg-slate-100 rounded animate-pulse mx-auto" /></td>}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-12 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr key={row.id}
                  onClick={rowHref ? () => router.push(rowHref(row)) : undefined}
                  className={`even:bg-slate-50/50 hover:bg-indigo-50/50 transition-colors ${rowHref ? 'cursor-pointer' : ''}`}>
                  {columns.map((col) => (
                    <td key={String(col.key)} className={`px-4 py-3.5 text-slate-700 align-middle whitespace-nowrap ${col.className ?? ''}`}>
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[String(col.key)] ?? '—')}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3.5 align-middle text-center" onClick={(e) => e.stopPropagation()}>{actions(row)}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            מציג {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} מתוך {sorted.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              הקודם
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              הבא
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
