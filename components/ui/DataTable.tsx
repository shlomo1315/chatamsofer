'use client'
import { ReactNode, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, Search, Inbox } from 'lucide-react'
import { useTableColumns, type ColDef, type SortState, type SortFilterOpts } from './TableColumns'
import type { ColKind, DistinctValue } from '@/lib/tableSort'

export interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => ReactNode
  sortable?: boolean
  className?: string
  // ── מיון וסינון מהכותרת (ראו lib/tableSort) ─────────────────────────────
  /** סוג הערך למיון. ברירת מחדל 'text'. */
  kind?: ColKind
  /**
   * ניתנת לסינון לפי ערך. ברירת מחדל false — רשימת ערכים על עמודת
   * שם/טלפון/מייל פותחת ערך ייחודי לכל שורה.
   */
  filterable?: boolean
  /** 🔴 חובה בעמודה שמרנדרת JSX — אחרת המיון עובד על אובייקט React. */
  value?: (row: T) => unknown
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
  // serverMode: הנתונים כבר מסוננים/ממוינים/מפויינים בצד השרת. DataTable רק מרנדר
  // אותם כמו שהם — בלי חיפוש/מיון/pagination פנימיים (אלה מנוהלים ע"י ההורה דרך ה-URL).
  serverMode?: boolean
  /**
   * מזהה יציב לטבלה. כשהוא ניתן — הטבלה מקבלת בורר עמודות, גרירת רוחב
   * וגלישת טקסט, והכיוונון נשמר למשתמש.
   *
   * ⚠️ בלעדיו נשמרת ההתנהגות הישנה (כל העמודות, בלי גרירה) — כדי שצרכן
   * שטרם הוסב לא ישבר.
   */
  tableId?: string
  /**
   * מיון וסינון מהכותרת.
   *
   * ⚠️ ב-serverMode חובה להעביר את המצב והאפשרויות מההורה: סינון בצד
   * הלקוח היה מסנן את הדף הנוכחי בלבד ומציג תוצאה שנראית תקינה.
   */
  sortFilter?: {
    sort: SortState
    onSortChange: (s: SortState) => void
    filters: Readonly<Record<string, string[]>>
    onFiltersChange: (f: Record<string, string[]>) => void
    /** נדרש ב-serverMode: distinct על כל המאגר, לא על הדף. */
    options?: Readonly<Record<string, DistinctValue[]>>
  }
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
  serverMode,
  tableId,
  sortFilter,
}: DataTableProps<T>) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // 🔴 בורר עמודות + גרירת רוחב + גלישה — הכלל המערכתי לכל הטבלאות.
  // ⚠️ ה-Column הקיים אינו יודע על `def`, ולכן כל העמודות מוצגות כברירת
  //    מחדל: הסבה של צרכן קיים לא אמורה להעלים ממנו עמודות בלי שביקש.
  const colDefs = useMemo<ColDef<string, T>[]>(
    () => columns.map(c => ({
      key: String(c.key),
      label: c.header,
      def: true,
      kind: c.kind,
      // ⚠️ sortable כאן משמר את הכוונה המקורית של הצרכן (שם/טלפון/מייל
      // סומנו sortable:false), אבל ב-serverMode המיון עובר למסד ולכן
      // מותר גם על עמודות שהמיון הפנימי לא תמך בהן.
      sortable: c.sortable !== false,
      filterable: c.filterable,
      value: c.value,
      // ⚠️ הריפוד והרקע של הכותרת מגיעים מכאן: tc.th מרנדר את ה-<th>
      // בעצמו, ובלי זה הכותרות היו מאבדות את עיצוב הטבלה.
      headClassName: `bg-slate-50 px-3 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${c.className ?? ''}`,
    })),
    [columns],
  )

  // 🔴 שני המצבים: 'server' כשהדף מגיע מהמסד, 'client' כשכל השורות כאן.
  // בחירה שגויה כאן היא בדיוק הבאג ששרף את המערכת פעמיים — ראו
  // SortFilterOpts ב-TableColumns.
  const sfOpts = useMemo<SortFilterOpts<string, T> | undefined>(() => {
    if (!sortFilter) return undefined
    if (serverMode) {
      return {
        mode: 'server', rows: data,
        sort: sortFilter.sort, onSortChange: sortFilter.onSortChange,
        filters: sortFilter.filters, onFiltersChange: sortFilter.onFiltersChange,
        options: sortFilter.options ?? {},
      }
    }
    return { mode: 'client', rows: data }
  }, [sortFilter, serverMode, data])

  const tc = useTableColumns<string, T>(tableId ?? "", colDefs, {
    extraCols: actions ? 1 : 0,
    sortFilter: sfOpts,
  })
  const view = tableId
    ? tc.shown.map(c => columns.find(x => String(x.key) === c.key)!).filter(Boolean)
    : columns

  // השורות שעליהן עובדים: כשיש sortFilter הן עוברות דרך ה-hook (ממוינות
  // ומסוננות). ⚠️ ב-serverMode ה-hook מחזיר אותן כפי שהתקבלו — המסד כבר
  // מיין וסינן, ומיון נוסף כאן היה ממיין 50 שורות בתוך רצף של אלפים.
  const base = sortFilter ? tc.rows : data

  const q = search.trim().toLowerCase()
  const filtered = serverMode || q.length < 2
    ? base
    : base.filter((row) => {
        const keys = searchKeys.length ? searchKeys : (Object.keys(row) as (keyof T)[])
        return keys.some((k) => {
          const val = (row as Record<string, unknown>)[k as string]
          if (val == null || typeof val === 'object') return false
          return String(val).toLowerCase().includes(q)
        })
      })

  // ⚠️ המיון הפנימי הישן פועל רק כשאין sortFilter: משני מנגנוני מיון
  // על אותה טבלה היו נלחמים זה בזה.
  const sorted = (!serverMode && sortKey && !sortFilter)
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

  // ב-serverMode אין pagination פנימי — מציגים את כל מה שהתקבל (עמוד אחד מהשרת).
  const totalPages = serverMode ? 1 : Math.ceil(sorted.length / pageSize)
  const paged = serverMode ? sorted : sorted.slice((page - 1) * pageSize, page * pageSize)

  const toggleSort = (key: string) => {
    if (serverMode) return // המיון מנוהל בשרת
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

      {/* בורר העמודות — מוצג רק כשניתן tableId. */}
      {tableId && tc.picker}

      {/* 🔴 סינון שחבוי בתפריט הוא מלכודת: המשתמש רואה 12 שורות מתוך
          7,066 ואינו יודע למה. */}
      {sortFilter && tc.activeFilters}

      {/* 🔴 בלי overflow-x: הכלל במערכת הוא שאין גלילה לרוחב בשום טבלה.
          הגרירה מחלקת מחדש את הרוחב הקיים ואינה מרחיבה מעבר למסך. */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm text-right border-collapse"
          style={tableId ? tc.rt.tableStyle : undefined}>
          {tableId && <colgroup>{tc.rt.cols}</colgroup>}
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              {view.map((col, i) => {
                // ── התקן: כותרת עם מיון וסינון, זהה בכל טבלאות המערכת.
                // tc.th מרנדר <th> משלו (כולל ידית הגרירה), ולכן הוא
                // מוחזר כמו שהוא ולא נעטף.
                if (sortFilter) {
                  const def = tc.shown.find(c => c.key === String(col.key))
                  if (def) return tc.th(def, i)
                }
                return (
                <th
                  key={String(col.key)}
                  className={`bg-slate-50 px-3 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${tableId ? "relative" : "whitespace-nowrap"} ${col.className ?? ''} ${(col.sortable && !serverMode) ? 'cursor-pointer hover:text-indigo-600 select-none transition-colors' : ''}`}
                  onClick={() => col.sortable && toggleSort(String(col.key))}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.header}</span>
                    {!serverMode && col.sortable && sortKey === String(col.key) && (
                      sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                    )}
                  </div>
                  {tableId && tc.rt.handle(i)}
                </th>
                )
              })}
              {actions && <th className="w-px whitespace-nowrap bg-slate-50 px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">פעולות</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {view.map((col) => (
                    <td key={String(col.key)} className="px-5 py-4">
                      <div className="h-4 bg-slate-100 rounded-md animate-pulse" />
                    </td>
                  ))}
                  {actions && <td className="px-5 py-4"><div className="h-4 w-16 bg-slate-100 rounded-md animate-pulse mx-auto" /></td>}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={view.length + (actions ? 1 : 0)} className="px-5 py-16 text-center">
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
                  {view.map((col) => (
                    <td key={String(col.key)} className={`px-3 py-3.5 text-slate-700 align-middle ${tableId ? tc.rt.cellClass : "whitespace-nowrap"} ${col.className ?? ''}`}>
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[String(col.key)] ?? '—')}
                    </td>
                  ))}
                  {actions && (
                    // ⚠️ ה-sticky הוסר יחד עם הגלילה לרוחב: הוא נועד לשמור
                    // את עמודת הפעולות נראית בטבלה שגוללת, ובלי גלילה הוא רק
                    // הוסיף צל על עמודה שממילא במסך.
                    // ⚠️ flex ולא text-center: תוכן הפעולות הוא כמעט תמיד
                    // מכולת flex, ועליה text-center אינו משפיע — הכפתורים
                    // נצמדו לקצה התא ונחתכו. w-px מכווץ את העמודה לרוחב
                    // התוכן, ו-nowrap מונע שבירה של הכפתורים לשתי שורות.
                    <td className="w-px whitespace-nowrap px-3 py-3.5 align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center">{actions(row)}</div>
                    </td>
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
