'use client'

import { useEffect, useMemo, useRef } from 'react'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, ListFilter } from 'lucide-react'
import {
  clearColumn, distinctValues, EMPTY_VALUE, isColumnActive, isNumericColumn, isTextColumn,
  type ColumnKey, type ColumnRow, type ColumnView, type SortDir, type ValueColumn,
} from '@/lib/gilyonotColumnView'
import { input } from './ui'

// כותרת עמודה בטבלת המפיצים: לחיצה פותחת תפריט מיון וסינון. הלוגיקה ב-lib/gilyonotColumnView.ts

const EMPTY_LABEL: Record<ValueColumn, string> = { city: 'ללא עיר', route: 'בלי מסלול', quantity: '—' }
const fmt = (n: number) => n.toLocaleString('he-IL')

export function ColumnHeader({ col, label, rows, view, onChange, open, onOpen, className = '', align = 'start' }: {
  col: ColumnKey
  label: string
  /** השורות אחרי שאר הסינונים, כדי שהרשימה תציג רק ערכים רלוונטיים. */
  rows: ColumnRow[]
  view: ColumnView
  onChange: (v: ColumnView) => void
  open: boolean
  onOpen: (open: boolean) => void
  className?: string
  align?: 'start' | 'end'
}) {
  const ref = useRef<HTMLTableCellElement>(null)
  const active = isColumnActive(view, col)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, onOpen])

  const numeric = isNumericColumn(col) || col === 'phone'
  const sortBtn = (dir: SortDir) => {
    const on = view.sort?.col === col && view.sort.dir === dir
    const Icon = dir === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow
    const text = numeric ? (dir === 'asc' ? 'מהקטן לגדול' : 'מהגדול לקטן') : (dir === 'asc' ? 'מיון א-ב' : 'מיון ב-א')
    return (
      <button type="button" aria-pressed={on}
        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm ${on ? 'bg-[#1B3256]/10 font-semibold text-[#1B3256]' : 'text-slate-700 hover:bg-slate-50'}`}
        onClick={() => onChange({ ...view, sort: on ? null : { col, dir } })}>
        <Icon className="h-4 w-4" aria-hidden />{text}
      </button>
    )
  }

  return (
    <th ref={ref} className={`relative p-0 text-start ${className}`} aria-sort={view.sort?.col === col ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" aria-haspopup="dialog" aria-expanded={open}
        className={`flex w-full items-center gap-1 px-4 py-3 text-xs font-semibold hover:text-[#1B3256] ${active ? 'text-[#1B3256]' : 'text-slate-500'}`}
        onClick={() => onOpen(!open)}>
        {label}
        {active
          ? <ListFilter className="h-3.5 w-3.5" aria-label="מסונן או ממוין" />
          : <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />}
      </button>
      {open && (
        <div role="dialog" aria-label={`מיון וסינון: ${label}`}
          className={`absolute top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-2 text-xs font-normal shadow-lg ring-1 ring-slate-900/10 ${align === 'end' ? 'end-0' : 'start-0'}`}>
          {sortBtn('asc')}
          {sortBtn('desc')}
          <div className="my-2 border-t border-slate-100" />
          {isTextColumn(col)
            ? <TextFilter col={col} view={view} onChange={onChange} />
            : <ValueFilter col={col} rows={rows} view={view} onChange={onChange} />}
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <button type="button" className="rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              disabled={!active} onClick={() => onChange(clearColumn(view, col))}>נקה</button>
            <button type="button" className="rounded-lg bg-[#1B3256] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1B3256]/90"
              onClick={() => onOpen(false)}>סגור</button>
          </div>
        </div>
      )}
    </th>
  )
}

function TextFilter({ col, view, onChange }: { col: 'name' | 'phone'; view: ColumnView; onChange: (v: ColumnView) => void }) {
  const value = view.text[col] ?? ''
  const set = (t: string) => onChange({ ...view, text: { ...view.text, [col]: t } })
  return (
    <div className="space-y-2 px-1">
      <label className="block">
        <span className="sr-only">סינון</span>
        <input autoFocus className={`${input} py-2`} value={value === '+' || value === '-' ? '' : value} onChange={e => set(e.target.value)}
          placeholder={col === 'name' ? 'חלק מהשם' : 'ספרות מהמספר'} inputMode={col === 'phone' ? 'tel' : undefined} dir={col === 'phone' ? 'ltr' : undefined} />
      </label>
      {col === 'phone' && (
        <div className="flex gap-1.5">
          {([['+', 'יש טלפון'], ['-', 'בלי טלפון']] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={value === k}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-sm ${value === k ? 'border-[#1B3256] bg-[#1B3256]/10 font-semibold text-[#1B3256]' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
              onClick={() => set(value === k ? '' : k)}>{l}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function ValueFilter({ col, rows, view, onChange }: { col: ValueColumn; rows: ColumnRow[]; view: ColumnView; onChange: (v: ColumnView) => void }) {
  const options = useMemo(() => distinctValues(rows, col), [rows, col])
  const selected = view.values[col]
  const all = options.map(o => o.value)
  const isOn = (v: string) => !selected || selected.includes(v)
  const set = (next: string[] | undefined) => {
    const values = { ...view.values }
    // כל הערכים מסומנים = אין סינון
    if (!next || all.every(v => next.includes(v))) delete values[col]
    else values[col] = next
    onChange({ ...view, values })
  }
  const toggle = (v: string) => set(isOn(v) ? (selected ?? all).filter(x => x !== v) : [...(selected ?? []), v])

  return (
    <div>
      <div className="flex gap-3 px-2.5 pb-1.5 text-xs">
        <button type="button" className="text-[#1B3256] hover:underline" onClick={() => set(undefined)}>סמן הכול</button>
        <button type="button" className="text-[#1B3256] hover:underline" onClick={() => set([])}>בטל הכול</button>
      </div>
      <ul className="max-h-60 overflow-y-auto overscroll-contain">
        {options.map(o => (
          <li key={o.value}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              <input type="checkbox" checked={isOn(o.value)} onChange={() => toggle(o.value)} className="h-4 w-4 accent-[#1B3256]" />
              <span className="flex-1 truncate">{o.value === EMPTY_VALUE ? EMPTY_LABEL[col] : col === 'city' ? o.value : fmt(Number(o.value))}</span>
              <span className="tabular-nums text-xs text-slate-400">{fmt(o.count)}</span>
            </label>
          </li>
        ))}
        {!options.length && <li className="px-2.5 py-2 text-sm text-slate-400">אין ערכים</li>}
      </ul>
    </div>
  )
}
