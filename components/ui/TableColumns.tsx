'use client'
import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Columns3, Check, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Pin, PinOff, MoveHorizontal, EyeOff, GripVertical, X, RotateCcw } from 'lucide-react'
import { useResizableColumns, type ResizableColumns, type FixedWidths } from './ResizableTable'
import TableHeadMenu, { ActiveFilters } from './TableHeadMenu'
import { sortRows, filterRows, distinctValues, type ColKind, type SortDir, type DistinctValue } from '@/lib/tableSort'
import { mergeSavedVisibility, toSavedVisibility, type SavedVisibility } from '@/lib/tableColumnVisibility'
import { mergeSavedOrder, moveTo, arrangeKeys, fitMask } from '@/lib/tableColumnLayout'

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
// סידור עמודות (opts.arrange) — הסדר וההצמדה נשמרים בנפרד מהנראות.
const ORD_PREFIX = 'tblord:'
const PIN_PREFIX = 'tblpin:'

const MENU_ITEM = 'flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent'
const ICON_BTN = 'flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-navy disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent'

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
  /**
   * משקל יחסי לרוחב העמודה, לפני שהמשתמש גורר. ברירת מחדל 1.
   *
   * 🔴 בלעדיו table-layout:fixed מחלק שווה בשווה: "שם מלא" מקבל
   * בדיוק כמו "ילדים", השם מתכווץ לשתי שורות והעמודות נדחסות.
   * ⚠️ יחסי ולא פיקסלים — סכום פיקסלים גדול מהמסך מחזיר את הבעיה.
   */
  weight?: number
  /** רוחב ברירת המחדל בפיקסלים — רק במצב סידור עמודות (opts.arrange). */
  width?: number
  /** רוחב מינימלי לגרירה בפיקסלים — רק במצב סידור עמודות. ברירת מחדל 96. */
  minWidth?: number
  /** מחלקות נוספות ל-<th> (ריפוד, רקע) — מגיעות מהצרכן דרך tc.th. */
  headClassName?: string
  /**
   * תרגום הערך הגולמי לתצוגה ברשימת הסינון.
   *
   * 🔴 בלי זה התפריט מציג את מה שכתוב במסד: "pending", "deep_review",
   * "nedarim". המזכירה רואה אנגלית בממשק עברי ואינה יודעת מה לסמן.
   * ⚠️ הסינון עצמו ממשיך לעבוד על הערך הגולמי — רק התצוגה משתנה.
   */
  formatValue?: (raw: string) => string
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
  th: (c: ColDef<K, R>, i: number, extra?: { style?: React.CSSProperties; className?: string }) => ReactNode
  /** מצב סידור עמודות פעיל (opts.arrange). */
  arranged: boolean
  /** העמודות המוצמדות — הן תמיד בראש shown. */
  pinned: ReadonlySet<K>
  /**
   * השורות אחרי מיון וסינון.
   * ⚠️ במצב 'server' מוחזרות כפי שהתקבלו — המסד כבר עשה את העבודה.
   */
  rows: R[]
  /** שורת המסננים הפעילים. ריקה כשאין — ראו ההערה ב-ActiveFilters. */
  activeFilters: ReactNode
  /** סינוני העמודות הפעילים על רשימה כלשהי (בלי מיון) — למוני כרטיסים. */
  applyFilters: (list: readonly R[]) => R[]
  /** מפתח מצב המיון והסינון מהכותרת — לאיפוס דפדוף רק כשהם משתנים (useTablePagination.resetKey). */
  viewKey: string
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
    /** משקל כל עמודה נוספת (ברירת מחדל 0.8). */
    extraWeight?: number
    /** עמודה צרה בתחילת השורה (leadHead/leadCell ב-ListTable) — בלי זה היא מקבלת את משקל העמודה הראשונה. */
    leadCol?: boolean
    /** תוספת למזהה כשאותה טבלה מוצגת בשני מצבים (עריכה מול צפייה). */
    idSuffix?: string
    /** מיון וסינון מהכותרת. ⚠️ חובה לציין mode — ראו SortFilterOpts. */
    sortFilter?: SortFilterOpts<K, R>
    /**
     * סידור עמודות: גרירה לשינוי סדר, הצמדה לימין, רוחב בפיקסלים שנשמר
     * לפי מפתח, וחלונית עמודות.
     *
     * 🔴 בלי גלילה לרוחב: העמודות מתכווצות עד minWidth, ומה שעדיין לא
     * נכנס מוסתר מסוף הסדר (squeezed) — כך הן לא עולות זו על זו.
     */
    arrange?: {
      /** מוצמדות כברירת מחדל. */
      pinned?: K[]
      /** רוחב כל עמודה נוספת (פעולות) בפיקסלים. ברירת מחדל 120. */
      extraWidth?: number
      /** רוחב הטבלה בפועל בפיקסלים. 0 = טרם נמדד / כרטיסים — בלי התאמה. */
      boxWidth?: number
    }
  },
): TableColumns<K, R> {
  const { filter, extraCols = 0, extraWeight = 0.8, leadCol = false, idSuffix = '', sortFilter, arrange } = opts ?? {}
  const arranged = !!arrange
  const extraWidth = arrange?.extraWidth ?? 120

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
      const parsed = JSON.parse(raw)
      // 🔴 ממוזג ולא נדרס: בחירה שמורה אינה מכירה עמודה שנוספה לקוד
      // אחריה, והשמה ישירה הייתה מסתירה כל עמודה חדשה מכל מי שאי פעם
      // נגע בבורר — כלומר מהמשתמשים הוותיקים דווקא. ראו lib/tableColumnVisibility.
      if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) {
        setVisible(mergeSavedVisibility(columns, parsed as SavedVisibility))
      }
    } catch { /* אחסון חסום — ברירות המחדל */ }
    // ⚠️ columns אינו בתלויות בכוונה: הוא מערך חדש בכל רינדור, וכל שינוי
    // בו היה טוען מחדש מהאחסון ומבטל בחירה שהמשתמש הרגע עשה.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId])

  const persist = useCallback((next: Set<K>) => {
    // ⚠️ נשמרים גם המפתחות הקיימים כעת (known) — בלעדיהם אי אפשר להבחין
    // בטעינה הבאה בין עמודה שהמשתמש הסתיר לבין עמודה שנוספה מאז.
    try {
      localStorage.setItem(VIS_PREFIX + tableId, JSON.stringify(toSavedVisibility(columns, next)))
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId])

  // ── סידור עמודות (רק ב-opts.arrange) ────────────────────────────────────
  // order = null: סדר הקוד. ⚠️ נטען אחרי הרינדור הראשון — כמו הנראות.
  const [order, setOrder] = useState<string[] | null>(null)
  const [pinned, setPinned] = useState<Set<K>>(() => new Set(arrange?.pinned ?? []))
  useEffect(() => {
    if (!arranged) return
    try {
      const o = localStorage.getItem(ORD_PREFIX + tableId)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינה אחרי hydration, כמו הנראות
      if (o) setOrder(JSON.parse(o))
      const p = localStorage.getItem(PIN_PREFIX + tableId)
      if (p) setPinned(new Set(JSON.parse(p) as K[]))
    } catch { /* אחסון חסום — ברירות המחדל */ }
  }, [tableId, arranged])

  const byKey = useMemo(() => new Map(available.map(c => [c.key, c])), [available])

  // הסדר המלא (כולל מוסתרות): הסדר השמור ממוזג עם הקוד, והמוצמדות קודם.
  const sequence = useMemo<K[]>(() => {
    const keys = available.map(c => c.key)
    if (!arranged) return keys
    return arrangeKeys(mergeSavedOrder(keys, order), pinned)
  }, [available, arranged, order, pinned])

  // chosen = מה שהמשתמש בחר להציג; shown = מה שנכנס בפועל ברוחב הטבלה.
  const chosen = useMemo(
    () => sequence.filter(k => visible.has(k)).map(k => byKey.get(k)!),
    [sequence, visible, byKey],
  )
  // 🔴 אין גלילה לרוחב (docs/no-horizontal-scroll.md): מה שלא נכנס גם
  // במינימום שלו מוסתר מסוף הסדר — כך עמודות אף פעם לא עולות זו על זו.
  // המוצמדות והעמודה הראשונה נשארות תמיד.
  const boxWidth = arrange?.boxWidth ?? 0
  const shown = useMemo(() => {
    if (!arranged || !boxWidth) return chosen
    const first = available[0]?.key
    const mask = fitMask(
      chosen.map(c => c.minWidth ?? 96),
      chosen.map(c => pinned.has(c.key) || c.key === first),
      (leadCol ? 40 : 0) + extraCols * extraWidth,
      boxWidth,
    )
    return chosen.filter((_, i) => mask[i])
  }, [arranged, boxWidth, chosen, available, pinned, leadCol, extraCols, extraWidth])
  const squeezed = useMemo(
    () => (shown.length === chosen.length ? [] : chosen.filter(c => !shown.includes(c))),
    [shown, chosen],
  )

  // 🔴 המזהה כולל את מספר העמודות הנראות — ראו ההערה בראש הקובץ.
  // ⚠️ משקלי העמודות המוצגות + משקל לכל עמודה נוספת (פעולות/צ׳קבוקס).
  // עמודת הפעולות צרה יחסית ולכן 0.8 ולא 1.
  const weights = useMemo(
    () => [...(leadCol ? [0.3] : []), ...shown.map(c => c.weight ?? 1), ...Array(extraCols).fill(extraWeight)],
    [shown, extraCols, extraWeight, leadCol],
  )

  // ⚠️ במצב סידור הרוחב נשמר לפי מפתח העמודה, ולכן המזהה *אינו* כולל את
  // מספר העמודות: הסתרה או הזזה לא מזיזות רוחב לעמודה אחרת.
  const fixed = useMemo<FixedWidths | undefined>(() => {
    if (!arranged) return undefined
    const extras = Array.from({ length: extraCols }, (_, i) => `__extra${i}`)
    return {
      keys: [...(leadCol ? ['__lead'] : []), ...shown.map(c => c.key), ...extras],
      px: [...(leadCol ? [40] : []), ...shown.map(c => c.width ?? 140), ...extras.map(() => extraWidth)],
      // עמודה נוספת (פעולות) לא מתכווצת מתחת לרוחב שלה — הכפתורים היו נחתכים.
      mins: [...(leadCol ? [40] : []), ...shown.map(c => c.minWidth ?? 96), ...extras.map(() => extraWidth)],
      box: boxWidth,
    }
  }, [arranged, shown, extraCols, extraWidth, leadCol, boxWidth])

  const rt = useResizableColumns(
    arranged ? `${tableId}${idSuffix}` : `${tableId}-${shown.length}${idSuffix}`,
    shown.length + extraCols + (leadCol ? 1 : 0),
    weights,
    fixed,
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

  // ── פעולות הסידור ───────────────────────────────────────────────────────
  // ⚠️ כל פעולה שומרת את sequence המלא (כולל מוסתרות): כך גם עמודה שהוסתרה
  // חוזרת בדיוק למקום שבו הייתה.
  const saveOrder = useCallback((next: K[]) => {
    setOrder(next)
    try { localStorage.setItem(ORD_PREFIX + tableId, JSON.stringify(next)) } catch { /* ignore */ }
  }, [tableId])

  const savePinned = useCallback((next: Set<K>) => {
    setPinned(next)
    try { localStorage.setItem(PIN_PREFIX + tableId, JSON.stringify([...next])) } catch { /* ignore */ }
  }, [tableId])

  /** הזזה בתוך אותה קבוצת הצמדה — עמודה לא חוצה את גבול המוצמדות. */
  const moveCol = useCallback((key: K, delta: -1 | 1) => {
    const inPin = pinned.has(key)
    const group = sequence.filter(k => pinned.has(k) === inPin && (k === key || visible.has(k)))
    const i = group.indexOf(key)
    const j = i + delta
    if (i < 0 || j < 0 || j >= group.length) return
    saveOrder(moveTo(sequence, key, group[j]))
  }, [pinned, sequence, visible, saveOrder])

  const canMove = useCallback((key: K, delta: -1 | 1) => {
    const inPin = pinned.has(key)
    const group = sequence.filter(k => pinned.has(k) === inPin && (k === key || visible.has(k)))
    const j = group.indexOf(key) + delta
    return j >= 0 && j < group.length
  }, [pinned, sequence, visible])

  const dropOn = useCallback((key: K, target: K) => {
    if (key === target || pinned.has(key) !== pinned.has(target)) return
    saveOrder(moveTo(sequence, key, target))
  }, [pinned, sequence, saveOrder])

  /** הצמדה: העמודה הופכת לאחרונה במוצמדות; ביטול: לראשונה בשאר. */
  const togglePin = useCallback((key: K) => {
    const next = new Set(pinned)
    if (next.has(key)) next.delete(key); else next.add(key)
    saveOrder(sequence)
    savePinned(next)
  }, [pinned, sequence, saveOrder, savePinned])

  // 🔴 העמודה הראשונה בקוד (בדרך כלל השם) לא מוסתרת — בלעדיה השורה לא מזוהה.
  const lockedKey = available[0]?.key

  const [undo, setUndo] = useState<{ key: K; label: string } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

  const hideCol = useCallback((key: K) => {
    if (key === lockedKey || !visible.has(key)) return
    const next = new Set(visible); next.delete(key)
    setVisible(next); persist(next)
    setUndo({ key, label: byKey.get(key)?.label ?? '' })
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndo(null), 6000)
  }, [lockedKey, visible, persist, byKey])

  const undoHide = useCallback(() => {
    if (!undo) return
    setVisible(prev => { const next = new Set(prev); next.add(undo.key); persist(next); return next })
    setUndo(null)
  }, [undo, persist])

  const resetLayout = useCallback(() => {
    try {
      localStorage.removeItem(ORD_PREFIX + tableId)
      localStorage.removeItem(PIN_PREFIX + tableId)
      localStorage.removeItem(VIS_PREFIX + tableId)
    } catch { /* ignore */ }
    setOrder(null)
    setPinned(new Set(arrange?.pinned ?? []))
    setVisible(new Set(columns.filter(c => c.def).map(c => c.key)))
    rt.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, rt])

  useEffect(() => {
    if (!picking || !arranged) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicking(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picking, arranged])

  const dragKey = useRef<K | null>(null)

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

  // 🔴 השדות נשלפים מהאובייקט ומשמשים כתלויות במקומו.
  //
  // sortFilter מגיע מכל קריאה כאובייקט-ליטרל inline ({ mode, rows }) — כלומר
  // *זהות חדשה בכל רינדור*. כשהוא היה תלות ישירה של ה-useMemo של rows, כל
  // רינדור ייצר מערך שורות חדש; useTablePagination משווה `prevAll !== all`
  // בזמן הרינדור (state נגזר מ-props), הזיהוי נכשל תמיד, setState רץ בכל
  // רינדור — ולולאה אינסופית הפילה את המסך ב-React #301.
  // ⚠️ לא לחזור ל-[sortFilter]: התיקון חייב להיות כאן ולא ב-23 אתרי הקריאה.
  const sfMode = sortFilter?.mode
  const sfRows = sortFilter?.rows
  const sfOptions = sortFilter?.mode === 'server' ? sortFilter.options : undefined

  // ⚠️ הקולבקים של מצב 'server' נקראים דרך ref ולא כתלות ישירה — מאותה סיבה
  // בדיוק: sortFilter הוא ליטרל חדש בכל רינדור, ותלות בו הייתה מייצרת
  // setSort/setFilters חדשים בכל רינדור ומחלחלת הלאה ל-th.
  const sfRef = useRef(sortFilter)
  useEffect(() => { sfRef.current = sortFilter })

  const setSort = useCallback((s: SortState<K>) => {
    const sf = sfRef.current
    if (sf?.mode === 'server') sf.onSortChange(s)
    else setCSort(s)
  }, [])

  const setFilters = useCallback((f: Record<string, string[]>) => {
    const sf = sfRef.current
    if (sf?.mode === 'server') sf.onFiltersChange(f)
    else setCFilters(f)
  }, [])

  /** חילוץ הערך של עמודה משורה — value() אם הוגדרה, אחרת השדה לפי key. */
  const valueOf = useCallback((c: ColDef<K, R>, row: R): unknown =>
    c.value ? c.value(row) : (row as Record<string, unknown>)?.[c.key],
  [])

  // אפשרויות הסינון לכל עמודה. ב-'client' נגזרות מהשורות; ב-'server'
  // מגיעות מוכנות (distinct על כל המאגר, לא על הדף).
  const optionsByCol = useMemo(() => {
    const out: Record<string, DistinctValue[]> = {}
    if (!sfMode || !sfRows) return out
    if (sfMode === 'server') return (sfOptions ?? {}) as Record<string, DistinctValue[]>
    for (const c of available) {
      if (!c.filterable) continue
      out[c.key] = distinctValues(sfRows, r => valueOf(c, r))
    }
    return out
  }, [sfMode, sfRows, sfOptions, available, valueOf])

  // 🔴 הסינון קודם למיון: מיון על שורות שממילא יוסתרו הוא עבודה מיותרת,
  // ועל 7,000 שורות ההבדל מורגש.
  const rows = useMemo<R[]>(() => {
    if (!sfMode || !sfRows) return []
    // ⚠️ ב-'server' השורות מוחזרות כפי שהתקבלו — המסד כבר מיין וסינן.
    // מיון נוסף כאן היה ממיין את הדף בתוך עצמו ומייצר סדר שגוי:
    // 50 שורות ממוינות בתוך רצף של 7,066 נראות ממוינות, ואינן.
    if (sfMode === 'server') return [...sfRows]

    let out = [...sfRows]
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
  }, [sfMode, sfRows, available, filters, sort, valueOf])

  /**
   * סינוני העמודות הפעילים, על רשימה כלשהי (בלי מיון).
   *
   * ⚠️ למוני כרטיסים מעל הטבלה: מונה שמתעלם מסינון העמודות מראה מספר
   * אחד בכרטיס ושורות אחרות בטבלה (הזמנות היריד, 08.10).
   */
  const applyFilters = useCallback((list: readonly R[]): R[] => {
    let out = [...list]
    if (sfMode !== 'client') return out
    for (const c of available) {
      const sel = filters[c.key]
      if (!sel?.length) continue
      out = filterRows(out, r => valueOf(c, r), new Set(sel))
    }
    return out
  }, [sfMode, available, filters, valueOf])

  const th = useCallback((c: ColDef<K, R>, i: number, extra?: { style?: React.CSSProperties; className?: string }): ReactNode => {
    const sel = new Set(filters[c.key] ?? [])
    const arrangeProps = arranged ? {
      floating: true,
      lead: (
        <span
          draggable
          onDragStart={e => { dragKey.current = c.key; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.key) }}
          onDragEnd={() => { dragKey.current = null }}
          title="גרירה לשינוי מיקום העמודה"
          className="hidden sm:inline-flex cursor-grab items-center text-slate-300 hover:text-slate-500 active:cursor-grabbing align-middle ms-[-4px] me-0.5"
        >
          <GripVertical size={13} />
        </span>
      ),
      thProps: {
        style: extra?.style,
        onDragOver: (e: React.DragEvent) => { if (dragKey.current) e.preventDefault() },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault()
          if (dragKey.current) dropOn(dragKey.current, c.key)
          dragKey.current = null
        },
      },
      extraItems: (close: () => void) => (
        <>
          <button type="button" className={MENU_ITEM} disabled={!canMove(c.key, -1)} onClick={() => { moveCol(c.key, -1); close() }}>
            <ArrowRight size={13} />הזזה ימינה
          </button>
          <button type="button" className={MENU_ITEM} disabled={!canMove(c.key, 1)} onClick={() => { moveCol(c.key, 1); close() }}>
            <ArrowLeft size={13} />הזזה שמאלה
          </button>
          <button type="button" className={MENU_ITEM} onClick={() => { togglePin(c.key); close() }}>
            {pinned.has(c.key) ? <><PinOff size={13} />ביטול הצמדה</> : <><Pin size={13} />הצמדה לימין</>}
          </button>
          <button type="button" className={MENU_ITEM} onClick={() => { rt.resetCol(i); close() }}>
            <MoveHorizontal size={13} />רוחב רגיל
          </button>
          <button type="button" className={MENU_ITEM} disabled={c.key === lockedKey} onClick={() => { hideCol(c.key); close() }}>
            <EyeOff size={13} />הסתרת העמודה
          </button>
        </>
      ),
    } : {}
    return (
      <TableHeadMenu
        {...arrangeProps}
        key={c.key}
        label={c.label}
        kind={c.kind ?? 'text'}
        // ⚠️ ברירת המחדל של sortable היא true, ושל filterable היא false.
        sortable={sfMode ? c.sortable !== false : false}
        filterable={!!sfMode && !!c.filterable}
        sortDir={sort.key === c.key ? sort.dir : null}
        onSort={dir => setSort({ key: c.key, dir })}
        options={optionsByCol[c.key] ?? []}
        formatValue={c.formatValue}
        selected={sel}
        onSelect={next => {
          const f = { ...filters }
          if (next.size === 0) delete f[c.key]
          else f[c.key] = [...next]
          setFilters(f)
        }}
        handle={rt.handle(i)}
        className={`${headClass(c)} ${c.headClassName ?? ''} ${extra?.className ?? ''}`}
      />
    )
  }, [filters, sort, optionsByCol, sfMode, rt, headClass, setSort, setFilters,
    arranged, dropOn, canMove, moveCol, togglePin, pinned, lockedKey, hideCol])

  const activeFilters = useMemo(() => {
    const items = available
      .filter(c => (filters[c.key]?.length ?? 0) > 0)
      .map(c => ({ key: c.key, label: c.label, values: filters[c.key], format: c.formatValue }))
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
  // ── מצב סידור: כפתור + חלונית באמצע המסך, ו-toast לביטול הסתרה ──────────
  const undoToast = undo && (
    <div role="status" className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full bg-navy px-4 py-2 text-xs text-white shadow-lg">
      <span>העמודה &quot;{undo.label}&quot; הוסתרה</span>
      <button type="button" onClick={undoHide} className="font-bold text-amber-300 hover:text-amber-200">ביטול</button>
    </div>
  )

  const arrangePicker = (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setPicking(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600">
          <Columns3 size={13} />
          עמודות ({chosen.length}/{available.length})
        </button>
        {squeezed.length > 0 && (
          <button type="button" onClick={() => setPicking(true)}
            title={`לא נכנסות ברוחב המסך: ${squeezed.map(c => c.label).join(', ')}`}
            className="text-[11px] font-medium text-amber-700 hover:underline">
            {squeezed.length === 1 ? 'עמודה אחת לא נכנסת ברוחב המסך' : `${squeezed.length} עמודות לא נכנסות ברוחב המסך`}
          </button>
        )}
      </div>

      {picking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onMouseDown={e => { if (e.target === e.currentTarget) setPicking(false) }}>
          <div role="dialog" aria-modal="true" aria-label="סידור עמודות"
            className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-navy">סידור עמודות</h2>
              <button type="button" onClick={() => setPicking(false)} className={ICON_BTN} aria-label="סגירה"><X size={16} /></button>
            </div>
            <p className="px-5 pt-3 text-[11px] text-slate-500">
              סימון מציג או מסתיר, החצים משנים מיקום, והנעץ מצמיד לימין ושומר שהעמודה תמיד מוצגת. אפשר גם לגרור כותרת בטבלה.
            </p>
            {squeezed.length > 0 && (
              <p className="mx-5 mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                ברוחב המסך הנוכחי לא נכנסות: {squeezed.map(c => c.label).join(', ')}. כדי להציג אותן, הסתירו עמודה אחרת או העבירו אותן למעלה.
              </p>
            )}
            <ul className="flex-1 overflow-y-auto px-3 py-2">
              {sequence.map(k => {
                const c = byKey.get(k)!
                const on = visible.has(k)
                const isPinned = pinned.has(k)
                return (
                  <li key={k} className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-50">
                    <label className="flex flex-1 cursor-pointer items-center gap-2 py-1 text-xs text-slate-700">
                      <input type="checkbox" checked={on} disabled={k === lockedKey}
                        onChange={() => toggle(k)} className="h-4 w-4 accent-navy" />
                      <span className={on ? '' : 'text-slate-400'}>{c.label}</span>
                      {isPinned && <span className="rounded bg-amber-50 px-1.5 text-[10px] font-bold text-amber-700">מוצמדת</span>}
                      {on && squeezed.some(s => s.key === k) && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">לא נכנסת</span>}
                    </label>
                    <button type="button" className={ICON_BTN} disabled={!on || !canMove(k, -1)} onClick={() => moveCol(k, -1)} aria-label={`הזזת ${c.label} למעלה`}><ArrowUp size={14} /></button>
                    <button type="button" className={ICON_BTN} disabled={!on || !canMove(k, 1)} onClick={() => moveCol(k, 1)} aria-label={`הזזת ${c.label} למטה`}><ArrowDown size={14} /></button>
                    <button type="button" className={`${ICON_BTN} ${isPinned ? 'text-amber-600' : ''}`} onClick={() => togglePin(k)}
                      aria-label={isPinned ? `ביטול הצמדת ${c.label}` : `הצמדת ${c.label}`}>
                      {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
              <button type="button" onClick={resetLayout}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-navy">
                <RotateCcw size={13} />איפוס לברירת המחדל
              </button>
              <button type="button" onClick={() => setPicking(false)}
                className="rounded-lg bg-navy px-4 py-1.5 text-xs font-bold text-white hover:opacity-90">סיום</button>
            </div>
          </div>
        </div>
      )}
      {undoToast}
    </>
  )

  const picker = arranged ? arrangePicker : (
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

  const viewKey = JSON.stringify([cSort, cFilters])

  return { shown, available, rt, picker, cellClass, headClass, th, rows, activeFilters, applyFilters, viewKey, arranged, pinned }
}
