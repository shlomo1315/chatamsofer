'use client'
import { ReactNode, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, Search, Inbox } from 'lucide-react'

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
    <div className="flex flex-col gap-4">
      {searchable && (
        <div className="relative">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-4 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-shadow"
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-max text-sm text-right border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={`bg-slate-50 px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap ${col.className ?? ''} ${col.sortable ? 'cursor-pointer hover:text-indigo-600 select-none transition-colors' : ''}`}
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
              {actions && <th className="sticky left-0 z-20 bg-slate-50 px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap text-center">פעולות</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={String(col.key)} className="px-5 py-4">
                      <div className="h-4 bg-slate-100 rounded-md animate-pulse" />
                    </td>
                  ))}
                  {actions && <td className="sticky left-0 z-10 bg-white px-5 py-4 border-r border-slate-100"><div className="h-4 w-16 bg-slate-100 rounded-md animate-pulse mx-auto" /></td>}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Inbox size={36} strokeWidth={1.5} className="text-slate-300" />
                    <p className="text-sm font-medium">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr key={row.id}
                  onClick={rowHref ? () => router.push(rowHref(row)) : undefined}
                  className={`hover:bg-indigo-50/40 transition-colors duration-100 ${rowHref ? 'cursor-pointer' : ''}`}>
                  {columns.map((col) => (
                    <td key={String(col.key)} className={`px-5 py-3.5 text-slate-700 align-middle whitespace-nowrap ${col.className ?? ''}`}>
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[String(col.key)] ?? '—')}
                    </td>
                  ))}
                  {actions && (
                    <td className="sticky left-0 z-10 bg-white px-5 py-3.5 align-middle text-center border-r border-slate-100" onClick={(e) => e.stopPropagation()}>{actions(row)}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span className="text-xs text-slate-400">
            מציג {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} מתוך {sorted.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              הקודם
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis')
                acc.push(p)
                return acc
              }, [])
              .map((p, idx) =>
                p === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 text-xs">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[32px] h-8 px-2.5 rounded-full text-xs font-medium transition-colors ${
                      page === p
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              הבא
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
