'use client'
import { useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from 'react'
import { ArrowUp, ArrowDown, Check, Search, X, ListFilter } from 'lucide-react'
import { BLANK, type ColKind, type SortDir, type DistinctValue } from '@/lib/tableSort'

// ─────────────────────────────────────────────────────────────────────────────
// תפריט הכותרת — מיון וסינון. רכיב אחד לכל טבלאות המערכת.
//
// לחיצה על כותרת פותחת: מיון עולה/יורד, ובעמודות עם ערכים קבועים גם
// רשימת ערכים לבחירה — מה להציג ומה להסתיר.
//
// 🔴 שינוי כאן משנה את *כל* הטבלאות במערכת. זו כל הנקודה: 45 טבלאות
// שכל אחת מהן מממשת מיון בעצמה היו נראות אחרת ומתנהגות אחרת.
//
// ⚠️ אין overflow-x: התפריט הוא absolute מעל הטבלה ואינו מרחיב אותה.
// הכלל במערכת הוא שאין גלילה לרוחב בשום טבלה.
// ─────────────────────────────────────────────────────────────────────────────

/** תוויות המיון לפי סוג — "א׳→ת׳" על עמודת תאריך היא הוראה שגויה. */
const SORT_LABELS: Record<ColKind, [string, string]> = {
  text:   ['מיון מ-א׳ עד ת׳', 'מיון מ-ת׳ עד א׳'],
  enum:   ['מיון מ-א׳ עד ת׳', 'מיון מ-ת׳ עד א׳'],
  number: ['מהקטן לגדול', 'מהגדול לקטן'],
  date:   ['מהישן לחדש', 'מהחדש לישן'],
}

export interface HeadMenuProps {
  label: string
  kind: ColKind
  /** ניתנת למיון. */
  sortable: boolean
  /** ניתנת לסינון לפי ערך — נדרשת בחירה מפורשת בהגדרת העמודה. */
  filterable: boolean
  /** כיוון המיון הנוכחי, או null אם ממוין לפי עמודה אחרת. */
  sortDir: SortDir | null
  onSort: (dir: SortDir) => void
  /** הערכים האפשריים + מונה. ריק = אין מה לסנן. */
  options: DistinctValue[]
  selected: ReadonlySet<string>
  onSelect: (next: Set<string>) => void
  /** תרגום הערך הגולמי לתצוגה. ⚠️ הסינון עובד על הגולמי. */
  formatValue?: (raw: string) => string
  /** ידית גרירת הרוחב של ResizableTable. */
  handle?: ReactNode
  className?: string
}

export default function TableHeadMenu({
  label, kind, sortable, filterable, sortDir, onSort,
  options, selected, onSelect, formatValue, handle, className = '',
}: HeadMenuProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLTableCellElement>(null)

  // ⚠️ סגירה בלחיצה בחוץ וב-Escape. בלעדיהן התפריט נשאר פתוח מעל
  // הטבלה ומסתיר שורות — בדיוק מה שהמשתמש ניסה לראות.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // ⚠️ החיפוש רץ על *התווית המוצגת*: המשתמש מקליד "ממתין", לא "pending".
  const labelOf = useCallback((v: string) =>
    v === BLANK ? '' : (formatValue ? formatValue(v) : v), [formatValue])

  const shownOptions = useMemo(() => {
    const term = q.trim()
    if (!term) return options
    return options.filter(o => o.value !== BLANK && labelOf(o.value).includes(term))
  }, [options, q, labelOf])

  const canFilter = filterable && options.length > 0
  const isFiltered = selected.size > 0
  const interactive = sortable || canFilter

  const toggle = (v: string) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v); else next.add(v)
    onSelect(next)
  }

  return (
    <th ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={!interactive}
        onClick={() => interactive && setOpen(o => !o)}
        // ⚠️ w-full + justify-between כדי שכל רוחב הכותרת יהיה לחיץ.
        // אזור לחיצה בגודל הטקסט בלבד הוא מטרה שקשה לפגוע בה.
        className={`flex w-full items-center gap-1 text-right ${
          interactive ? 'cursor-pointer hover:text-indigo-600 transition-colors' : 'cursor-default'
        }`}
      >
        <span className="truncate">{label}</span>
        {/* חץ = עמודת המיון הפעילה · משפך = העמודה מסוננת */}
        {sortDir === 'asc' && <ArrowUp size={12} className="shrink-0 text-indigo-600" />}
        {sortDir === 'desc' && <ArrowDown size={12} className="shrink-0 text-indigo-600" />}
        {isFiltered && <ListFilter size={12} className="shrink-0 text-indigo-600" />}
      </button>

      {open && (
        // ⚠️ end-0 (ולא right-0): ב-RTL התפריט נצמד לקצה ההתחלתי של
        // הכותרת. right-0 היה מוציא אותו מהמסך בעמודה הימנית.
        <div className="absolute z-40 top-full mt-1 end-0 w-60 rounded-xl border border-slate-200 bg-white py-1 shadow-xl text-right normal-case tracking-normal">
          {sortable && (
            <>
              <button type="button" onClick={() => { onSort('asc'); setOpen(false) }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-indigo-50 ${sortDir === 'asc' ? 'font-bold text-indigo-700' : 'text-slate-700'}`}>
                <ArrowUp size={13} className="text-slate-400" /> {SORT_LABELS[kind][0]}
              </button>
              <button type="button" onClick={() => { onSort('desc'); setOpen(false) }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-indigo-50 ${sortDir === 'desc' ? 'font-bold text-indigo-700' : 'text-slate-700'}`}>
                <ArrowDown size={13} className="text-slate-400" /> {SORT_LABELS[kind][1]}
              </button>
            </>
          )}

          {sortable && canFilter && <div className="my-1 border-t border-slate-100" />}

          {canFilter && (
            <>
              {/* חיפוש מוצג רק כשיש הרבה ערכים — על 3 אפשרויות הוא רעש. */}
              {options.length > 8 && (
                <div className="relative px-2 py-1">
                  <Search size={12} className="absolute top-1/2 right-4 -translate-y-1/2 text-slate-400" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש בערכים…"
                    className="w-full rounded-lg border border-slate-200 py-1.5 pr-7 pl-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
                </div>
              )}

              <div className="max-h-56 overflow-y-auto py-0.5">
                {shownOptions.length === 0 ? (
                  <p className="px-3 py-3 text-center text-xs text-slate-400">אין ערכים תואמים</p>
                ) : shownOptions.map(o => {
                  const on = selected.has(o.value)
                  return (
                    <button key={o.value} type="button" onClick={() => toggle(o.value)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 transition-colors hover:bg-indigo-50">
                      <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${on ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'}`}>
                        {on && <Check size={10} className="text-white" strokeWidth={3} />}
                      </span>
                      <span className="flex-1 truncate text-right">
                        {o.value === BLANK ? <span className="text-slate-400">(ריק)</span> : labelOf(o.value)}
                      </span>
                      {/* 🔴 המונה אינו קישוט: המשתמש רואה כמה שורות
                          יסתתרו לפני שהוא מסנן. */}
                      <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                        {o.count.toLocaleString('he-IL')}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-1 flex items-center gap-2 border-t border-slate-100 px-3 py-1.5">
                <button type="button" onClick={() => onSelect(new Set(options.map(o => o.value)))}
                  className="text-[11px] text-indigo-600 hover:underline">בחר הכל</button>
                <span className="text-slate-300">·</span>
                <button type="button" onClick={() => onSelect(new Set())}
                  className="text-[11px] text-slate-500 hover:underline">נקה</button>
                {isFiltered && (
                  <span className="mr-auto text-[10px] font-medium text-indigo-600">
                    {selected.size} נבחרו
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {handle}
    </th>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// שורת המסננים הפעילים.
//
// 🔴 סינון שחבוי בתוך תפריט הוא מלכודת: המשתמש רואה 12 שורות מתוך
// 7,066 ואינו יודע למה. השורה הזו אומרת מה פעיל ומאפשרת לנקות בלחיצה.
// ─────────────────────────────────────────────────────────────────────────────
export function ActiveFilters({ items, onClear, onClearAll }: {
  items: { key: string; label: string; values: string[]; format?: (v: string) => string }[]
  onClear: (key: string) => void
  onClearAll: () => void
}) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2">
      <ListFilter size={13} className="text-indigo-500" />
      <span className="text-[11px] font-semibold text-indigo-900">מסננים פעילים:</span>
      {items.map(it => (
        <button key={it.key} type="button" onClick={() => onClear(it.key)}
          className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-white px-2 py-0.5 text-[11px] text-indigo-800 transition-colors hover:bg-indigo-100">
          <span className="font-medium">{it.label}:</span>
          <span className="max-w-40 truncate">
            {it.values.length <= 2
              ? it.values.map(v => v === BLANK ? '(ריק)' : (it.format ? it.format(v) : v)).join(', ')
              : `${it.values.length} ערכים`}
          </span>
          <X size={10} />
        </button>
      ))}
      <button type="button" onClick={onClearAll}
        className="mr-auto text-[11px] font-medium text-indigo-600 hover:underline">
        נקה הכול
      </button>
    </div>
  )
}
