'use client'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { PAGE_SIZES } from '@/lib/useListParams'

// פייג'ר + בורר גודל עמוד (20/50/100/200). RTL: "הקודם" מימין, "הבא" משמאל.
export default function Pagination({
  page, size, total, onPage, onSize,
}: {
  page: number
  size: number
  total: number
  onPage: (p: number) => void
  onSize: (s: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / size))
  const from = total === 0 ? 0 : (page - 1) * size + 1
  const to = Math.min(page * size, total)

  // חלון עמודים עם קיצוץ: 1 … p-1 p p+1 … N
  const pages: (number | '…')[] = []
  const add = (n: number | '…') => pages.push(n)
  const window = 1
  const lo = Math.max(1, page - window)
  const hi = Math.min(totalPages, page + window)
  if (lo > 1) { add(1); if (lo > 2) add('…') }
  for (let p = lo; p <= hi; p++) add(p)
  if (hi < totalPages) { if (hi < totalPages - 1) add('…'); add(totalPages) }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>
          מציג <b className="text-slate-700 tabular-nums">{from}–{to}</b> מתוך{' '}
          <b className="text-slate-700 tabular-nums">{total.toLocaleString('he-IL')}</b>
        </span>
        <span className="text-slate-300">·</span>
        <label className="flex items-center gap-1.5">
          <span>בעמוד:</span>
          <select
            value={size}
            onChange={(e) => onSize(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 tabular-nums"
          >
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight size={14} /> הקודם
          </button>
          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="px-1.5 text-slate-400 text-xs">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p)}
                className={`min-w-[2rem] px-2 py-1.5 rounded-lg border text-xs tabular-nums transition-colors ${
                  p === page
                    ? 'border-indigo-500 bg-indigo-600 text-white font-semibold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            הבא <ChevronLeft size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
