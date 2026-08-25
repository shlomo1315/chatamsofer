'use client'
import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react'
import { Columns3, Check } from 'lucide-react'
import { useResizableColumns, type ResizableColumns } from './ResizableTable'
import TableHeadMenu, { ActiveFilters } from './TableHeadMenu'
import { sortRows, filterRows, distinctValues, type ColKind, type SortDir, type DistinctValue } from '@/lib/tableSort'

// ─────────────────────────────────────────────────────────────────────────────
// בורר עמודות + גרירת רוחב — hook מערכתי אחד לכל טבלאות המערכת.
//
// שלושת הכללים שהוא אוכף יחד:
//   1. בורר עמודות — המשתמש בוחר מה מוצג
//   2. גרירת רוחב — כמו באקסל
//   3. גלישת טקסט — עמודה צרה שוברת שורה, לא מסתירה תוכן
//
// השימוש:
//   const COLS: ColDef<'name' | 'city'>[] = [
//     { key: 'name', label: 'שם', def: true },
//     { key: 'city', label: 'עיר', def: true },
//   ]
//   const tc = useTableColumns('widows', COLS)
//   ...
//   {tc.picker}
//   <div className="w-full">
//     <table style={tc.rt.tableStyle}>
//       <colgroup>{tc.rt.cols}</colgroup>
//       <thead><tr>{tc.shown.map((c, i) => (
//         <th key={c.key} className="relative">{c.label}{tc.rt.handle(i)}</th>
//       ))}</tr></thead>
//       <tbody>{rows.map(r => <tr key={r.id}>{tc.shown.map(c => (
//         <td key={c.key} className={tc.cellClass(c)}>{cell(c, r)}</td>
//       ))}</tr>)}</tbody>
//     </table>
//   </div>
//
// 🔴 למה hook ולא העתקה: המזהה שנשמר ב-localStorage **חייב** לכלול את מספר
// העמודות הנראות. הסתרת עמודה מזיזה את כל האינדקסים, ורוחב שנשמר למצב אחר
// נדבק לעמודה הלא נכונה. זו מלכודת שקטה — טבלה נראית תקינה עד שמסתירים
// עמודה — ולסמוך על כך שכל מימוש יזכור אותה לבדו זה לבקש את הבאג.
//
// ⚠️ בחירת העמודות נשמרת גם היא (בנפרד מהרוחב). בשתי הטבלאות הראשונות
// נשמר רק הרוחב, כך שהמשתמש כיוונן עמודות והכול חזר ברענון.
// ─────────────────────────────────────────────────────────────────────────────

const VIS_PREFIX = 'tblvis:'

export interface ColDef<K extends string = string, R = never> {
  key: K
  label: string
  /** מוצגת כברירת מחדל. ⚠️ לבחור כך שהסכום נכנס לרוחב מסך רגיל. */
  def: boolean
  align?: 'center'

  // ── מיון וסינון (ראו lib/tableSort) ─────────────────────────────────────
  /** סוג הערך למיון. ברירת מחדל 'text'. */
  kind?: ColKind
  /** ניתנת למיון בלחיצה על הכותרת. ברירת מחדל: true. */
  sortable?: boolean
  /**
   * ניתנת לסינון לפי ערך.
   *
   * 🔴 ברירת המחדל false בכוונה: רשימת ערכים על עמודת שם או טלפון
   * פותחת 7,000 ערכים ייחודיים — כבד וחסר תועלת. סינון לפי ערך שייך
   * לעמודות עם קבוצת ערכים סגורה (מצב משפחתי, סטטוס, עיר, קהילה).
   */
  filterable?: boolean
  /**
   * חילוץ הערך הגולמי למיון ולסינון.
   *
   * 🔴 חובה בכל עמודה שמרנדרת JSX. בלעדיה המיון עובד על אובייקט React
   * ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
   */
  value?: (row: R) => unknown
  /** מחלקות נוספות ל-<th> (ריפוד, רקע) — מגיעות מהצרכן דרך tc.th. */
  headClassName?: string
}

/** מצב המיון: איזו עמודה ובאיזה כיוון. */
export interface SortState<K extends string = string> {
  key: K | null
  dir: SortDir
}

/**
 * מיון וסינון — שני מצבים, והבחירה ביניהם אינה אופציונלית.
 *
 * 🔴 'client': כל השורות בזיכרון, ה-hook ממיין ומסנן בעצמו.
 * 🔴 'server': רק עמוד אחד בזיכרון — המיון והסינון חייבים לרוץ במסד.
 *
 * ⚠️ טבלה שמדפדפת בשרת ומקבלת 'client' תסנן 50 שורות מתוך 7,066
 * ותציג תוצאה שנראית תקינה לחלוטין. זה בדיוק הבאג ששרף את המערכת
 * פעמיים — תקרת 1,000 השורות, וירושלים שהוצגה 75 במקום 1,695.
 * אין ברירת מחדל בכוונה.
 */
export type SortFilterOpts<K extends string, R> =
  | {
      mode: 'client'
      /** כל השורות — לא רק הדף הנוכחי. */
      rows: readonly R[]
    }
  | {
      mode: 'server'
      /** שורות הדף הנוכחי — מוחזרות כפי שהן, המסד כבר מיין וסינן. */
      rows: readonly R[]
      /** מצב המיון הנוכחי (מה-URL). */
      sort: SortState<K>
      onSortChange: (s: SortState<K>) => void
      /** הערכים הנבחרים לכל עמודה (מה-URL). */
      filters: Readonly<Record<string, string[]>>
      onFiltersChange: (f: Record<string, string[]>) => void
      /**
       * אפשרויות הסינון — נשלפות בשרת (distinct על כל המאגר).
       * ⚠️ לא מהשורות שבדף: הן מייצגות 50 מתוך אלפים.
       */
      options: Readonly<Record<string, DistinctValue[]>>
    }

export interface TableColumns<K extends string, R = never> {
  /** העמודות המוצגות בפועל, לפי הסדר. */
  shown: ColDef<K, R>[]
  /** כל העמודות הרלוונטיות להקשר (אחרי filter), בין אם מוצגות ובין אם לא. */
  available: ColDef<K, R>[]
  /** גרירת הרוחב — כבר מאותחלת עם המזהה והספירה הנכונים. */
  rt: ResizableColumns
  /** ה-UI של הבורר — שורת הכפתורים ולוח הצ׳יפים. */
  picker: ReactNode
  /** מחלקות התא: גלישה + יישור. להעביר לכל <td>. */
  cellClass: (c: ColDef<K, R>) => string
  /** מחלקות הכותרת: relative (לידית) + יישור. */
  headClass: (c: ColDef<K, R>) => string

  // ── מיון וסינון ─────────────────────────────────────────────────────────
  /**
   * כותרת מוכנה — מיון, סינון וידית הגרירה. שורת ה-thead כולה:
   *   <tr>{tc.shown.map((c, i) => tc.th(c, i))}</tr>
   */
  th: (c: ColDef<K, R>, i: number) => ReactNode
  /**
   * השורות אחרי מיון וסינון.
   * ⚠️ במצב 'server' מוחזרות כפי שהתקבלו — המסד כבר עשה את העבודה.
   */
  rows: R[]
  /** שורת המסננים הפעילים. ריקה כשאין — ראו ההערה ב-ActiveFilters. */
  activeFilters: ReactNode
}

export function useTableColumns<K extends string, R = never>(
  /** מזהה יציב לטבלה. ⚠️ שינוי שלו מאבד את הכיוונון של המשתמשים. */
  tableId: string,
  columns: ColDef<K, R>[],
  opts?: {
    /** סינון עמודות לפי הקשר (הרשאה, מצב). מה שיורד — יורד גם מהבורר. */
    filter?: (c: ColDef<K, R>) => boolean
    /** עמודות נוספות שאינן בבורר (צ׳קבוקס, פעולות) — נספרות לגרירה. */
    extraCols?: number
    /** תוספת למזהה כשאותה טבלה מוצגת בשני מצבים (עריכה מול צפייה). */
    idSuffix?: string
    /** מיון וסינון מהכותרת. ⚠️ חובה לציין mode — ראו SortFilterOpts. */
    sortFilter?: SortFilterOpts<K, R>
  },
): TableColumns<K, R> {
  const { filter, extraCols = 0, idSuffix = '', sortFilter } = opts ?? {}

  const available = useMemo(
    () => (filter ? columns.filter(filter) : columns),
    [columns, filter],
  )

  const [visible, setVisible] = useState<Set<K>>(
    () => new Set(columns.filter(c => c.def).map(c => c.key)),
  )
  const [picking, setPicking] = useState(false)

  // ⚠️ נטען אחרי הרינדור הראשון ולא ב-useState: קריאה מ-localStorage בזמן
  // הרינדור מייצרת אי-התאמה בין השרת ללקוח (hydration mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIS_PREFIX + tableId)
      if (!raw) return
      const keys = JSON.parse(raw)
      if (Array.isArray(keys)) setVisible(new Set(keys as K[]))
    } catch { /* אחסון חסום — ברירות המחדל */ }
  }, [tableId])

  const persist = useCallback((next: Set<K>) => {
    try { localStorage.setItem(VIS_PREFIX + tableId, JSON.stringify([...next])) } catch { /* ignore */ }
  }, [tableId])

  const shown = useMemo(
    () => available.filter(c => visible.has(c.key)),
    [available, visible],
  )

  // 🔴 המזהה כולל את מספר העמודות הנראות — ראו ההערה בראש הקובץ.
  const rt = useResizableColumns(
    `${tableId}-${shown.length}${idSuffix}`,
    shown.length + extraCols,
  )

  const toggle = useCallback((k: K) => {
    setVisible(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      persist(next)
      return next
    })
  }, [persist])

  const showAll = useCallback(() => {
    const next = new Set(available.map(c => c.key))
    setVisible(next); persist(next)
  }, [available, persist])

  const cellClass = useCallback(
    (c: ColDef<K, R>) => `${rt.cellClass}${c.align === 'center' ? ' text-center' : ''}`,
    [rt.cellClass],
  )

  const headClass = useCallback(
    (c: ColDef<K, R>) => `relative${c.align === 'center' ? ' text-center' : ''}`,
    [],
  )

  // ══ מיון וסינון ═════════════════════════════════════════════════════════
  //
  // ⚠️ המצב הפנימי קיים רק ב-'client'. ב-'server' הוא מגיע מה-URL דרך
  // ההורה — מצב כפול היה נותן לטבלה להציג מיון אחד ולמסד לבצע אחר.
  const [cSort, setCSort] = useState<SortState<K>>({ key: null, dir: 'asc' })
  const [cFilters, setCFilters] = useState<Record<string, string[]>>({})

  const isServer = sortFilter?.mode === 'server'
  const sort = isServer ? sortFilter.sort : cSort
  const filters = isServer ? sortFilter.filters : cFilters

  const setSort = useCallback((s: SortState<K>) => {
    if (sortFilter?.mode === 'server') sortFilter.onSortChange(s)
    else setCSort(s)
  }, [sortFilter])

  const setFilters = useCallback((f: Record<string, string[]>) => {
    if (sortFilter?.mode === 'server') sortFilter.onFiltersChange(f)
    else setCFilters(f)
  }, [sortFilter])

  /** חילוץ הערך של עמודה משורה — value() אם הוגדרה, אחרת השדה לפי key. */
  const valueOf = useCallback((c: ColDef<K, R>, row: R): unknown =>
    c.value ? c.value(row) : (row as Record<string, unknown>)?.[c.key],
  [])

  // אפשרויות הסינון לכל עמודה. ב-'client' נגזרות מהשורות; ב-'server'
  // מגיעות מוכנות (distinct על כל המאגר, לא על הדף).
  const optionsByCol = useMemo(() => {
    const out: Record<string, DistinctValue[]> = {}
    if (!sortFilter) return out
    if (sortFilter.mode === 'server') return sortFilter.options as Record<string, DistinctValue[]>
    for (const c of available) {
      if (!c.filterable) continue
      out[c.key] = distinctValues(sortFilter.rows, r => valueOf(c, r))
    }
    return out
  }, [sortFilter, available, valueOf])

  // 🔴 הסינון קודם למיון: מיון על שורות שממילא יוסתרו הוא עבודה מיותרת,
  // ועל 7,000 שורות ההבדל מורגש.
  const rows = useMemo<R[]>(() => {
    if (!sortFilter) return []
    // ⚠️ ב-'server' השורות מוחזרות כפי שהתקבלו — המסד כבר מיין וסינן.
    // מיון נוסף כאן היה ממיין את הדף בתוך עצמו ומייצר סדר שגוי:
    // 50 שורות ממוינות בתוך רצף של 7,066 נראות ממוינות, ואינן.
    if (sortFilter.mode === 'server') return [...sortFilter.rows]

    let out = [...sortFilter.rows]
    for (const c of available) {
      const sel = filters[c.key]
      if (!sel?.length) continue
      out = filterRows(out, r => valueOf(c, r), new Set(sel))
    }
    if (sort.key) {
      const col = available.find(c => c.key === sort.key)
      if (col) out = sortRows(out, r => valueOf(col, r), col.kind ?? 'text', sort.dir)
    }
    return out
  }, [sortFilter, available, filters, sort, valueOf])

  const th = useCallback((c: ColDef<K, R>, i: number): ReactNode => {
    const sel = new Set(filters[c.key] ?? [])
    return (
      <TableHeadMenu
        key={c.key}
        label={c.label}
        kind={c.kind ?? 'text'}
        // ⚠️ ברירת המחדל של sortable היא true, ושל filterable היא false.
        sortable={sortFilter ? c.sortable !== false : false}
        filterable={!!sortFilter && !!c.filterable}
        sortDir={sort.key === c.key ? sort.dir : null}
        onSort={dir => setSort({ key: c.key, dir })}
        options={optionsByCol[c.key] ?? []}
        selected={sel}
        onSelect={next => {
          const f = { ...filters }
          if (next.size === 0) delete f[c.key]
          else f[c.key] = [...next]
          setFilters(f)
        }}
        handle={rt.handle(i)}
        className={`${headClass(c)} ${c.headClassName ?? ''}`}
      />
    )
  }, [filters, sort, optionsByCol, sortFilter, rt, headClass, setSort, setFilters])

  const activeFilters = useMemo(() => {
    const items = available
      .filter(c => (filters[c.key]?.length ?? 0) > 0)
      .map(c => ({ key: c.key, label: c.label, values: filters[c.key] }))
    return (
      <ActiveFilters
        items={items}
        onClear={k => { const f = { ...filters }; delete f[k]; setFilters(f) }}
        onClearAll={() => setFilters({})}
      />
    )
  }, [available, filters, setFilters])

  // ⚠️ "הצגת הכל" ליד הבורר ולא בקצה הנגדי: היא פעולה *על* הבורר,
  // וריחוק ממנו נראה כפריט מנותק.
  const picker = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setPicking(o => !o)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600">
          <Columns3 size={13} />
          בחירת עמודות ({shown.length}/{available.length})
          <span className="text-slate-400">{picking ? '▲' : '▼'}</span>
        </button>
        {shown.length < available.length && (
          <button type="button" onClick={showAll}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600">
            הצגת כל העמודות
          </button>
        )}
        {rt.customized && (
          <button type="button" onClick={rt.reset}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600">
            איפוס רוחב העמודות
          </button>
        )}
      </div>

      {picking && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          {available.map(c => {
            const on = visible.has(c.key)
            return (
              <button key={c.key} type="button" onClick={() => toggle(c.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition ${
                  on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}>
                {on && <Check size={11} />}{c.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  return { shown, available, rt, picker, cellClass, headClass, th, rows, activeFilters }
}
