'use client'
import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react'
import { Columns3, Check } from 'lucide-react'
import { useResizableColumns, type ResizableColumns } from './ResizableTable'

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

export interface ColDef<K extends string = string> {
  key: K
  label: string
  /** מוצגת כברירת מחדל. ⚠️ לבחור כך שהסכום נכנס לרוחב מסך רגיל. */
  def: boolean
  align?: 'center'
}

export interface TableColumns<K extends string> {
  /** העמודות המוצגות בפועל, לפי הסדר. */
  shown: ColDef<K>[]
  /** כל העמודות הרלוונטיות להקשר (אחרי filter), בין אם מוצגות ובין אם לא. */
  available: ColDef<K>[]
  /** גרירת הרוחב — כבר מאותחלת עם המזהה והספירה הנכונים. */
  rt: ResizableColumns
  /** ה-UI של הבורר — שורת הכפתורים ולוח הצ׳יפים. */
  picker: ReactNode
  /** מחלקות התא: גלישה + יישור. להעביר לכל <td>. */
  cellClass: (c: ColDef<K>) => string
  /** מחלקות הכותרת: relative (לידית) + יישור. */
  headClass: (c: ColDef<K>) => string
}

export function useTableColumns<K extends string>(
  /** מזהה יציב לטבלה. ⚠️ שינוי שלו מאבד את הכיוונון של המשתמשים. */
  tableId: string,
  columns: ColDef<K>[],
  opts?: {
    /** סינון עמודות לפי הקשר (הרשאה, מצב). מה שיורד — יורד גם מהבורר. */
    filter?: (c: ColDef<K>) => boolean
    /** עמודות נוספות שאינן בבורר (צ׳קבוקס, פעולות) — נספרות לגרירה. */
    extraCols?: number
    /** תוספת למזהה כשאותה טבלה מוצגת בשני מצבים (עריכה מול צפייה). */
    idSuffix?: string
  },
): TableColumns<K> {
  const { filter, extraCols = 0, idSuffix = '' } = opts ?? {}

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
    (c: ColDef<K>) => `${rt.cellClass}${c.align === 'center' ? ' text-center' : ''}`,
    [rt.cellClass],
  )

  const headClass = useCallback(
    (c: ColDef<K>) => `relative${c.align === 'center' ? ' text-center' : ''}`,
    [],
  )

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

  return { shown, available, rt, picker, cellClass, headClass }
}
