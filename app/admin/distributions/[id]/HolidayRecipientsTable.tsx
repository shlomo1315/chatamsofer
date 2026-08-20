// ─────────────────────────────────────────────────────────────────────────────
// טבלת נרשמי חלוקת חגים — קומפוננטה *אחת* משותפת למסך הניהול ולדף השיתוף,
// כדי ששתיהן יהיו זהות בדיוק ולא יתפצלו.
//
// 🔴 כל נתון בעמודה נפרדת. איחוד עמודות ("שם ובן/בת זוג", "טלפון ומייל")
// נוסה ונפסל: הוא ערבב ערכים שונים בתא אחד והפך את הטבלה לקשה לסריקה.
//
// 🔴 ואין גלילה לרוחב. שתי הדרישות יחד נפתרות ב**בורר עמודות**: המשתמש
// בוחר מה להציג, וכל מה שמוצג נכנס לרוחב המסך. זו הדרך היחידה שמכבדת את
// שתיהן — 16 עמודות קבועות אינן יכולות להיכנס, ואיחוד פוגע בקריאוּת.
// ─────────────────────────────────────────────────────────────────────────────
'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Monitor, Phone, Mail, CreditCard, Pencil, Check, X, Loader2, Columns3 } from 'lucide-react'
import { SOURCE_LABEL, type RegisterSource } from '@/lib/distributionSources'
import { useIncrementalRows } from '@/lib/useIncrementalRows'
import { useResizableColumns } from '@/components/ui/ResizableTable'
import ApprovalLabelTag, { type ApprovalLabel } from '@/components/ui/ApprovalLabelTag'

export interface HolidayRow {
  id: string
  source: RegisterSource
  registered_at: string | null
  phone: string | null
  notified_at: string | null
  notify_error: string | null
  beneficiary_id: string | null
  approval_status: 'pending' | 'approved' | 'rejected'
  card_number: string | null
  card_linked_at: string | null
  card_link_error?: string | null
  name: string
  /** ⚠️ נשמרים בנפרד ולא מפוצלים מ-name: פיצול לפי רווח היה שובר שמות
   *  משפחה מורכבים ("בן דוד", "אבו חצירא"). */
  family_name?: string | null
  first_name?: string | null
  id_number: string | null
  /** תווית סיבת אישור — קיימת רק לאישורים חריגים; null אצל הרוב המוחלט. */
  approval_label?: ApprovalLabel | null
  spouse_name: string | null
  ben_phone: string | null
  email: string | null
  address: string | null
  city: string | null
  age: number | null
  children_count: number | null
  /** מוקד החלוקה שנבחר — בטלפון, בממשק או ידנית. */
  center_id?: string | null
  center_name?: string | null
  center_source?: string | null
  /** מצב טעינת ה-500₪. ⚠️ הטעינה רצה רק מכפתור מפורש. */
  load_status?: string | null
}

const APPROVAL_LABEL: Record<string, string> = { pending: 'ממתין לאישור', approved: 'מאושר', rejected: 'נדחה' }
const APPROVAL_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-green-50 text-green-800 border-green-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
}
const SOURCE_ICON: Record<RegisterSource, typeof Monitor> = {
  portal: Monitor, phone: Phone, email: Mail, nedarim: CreditCard, admin: Pencil,
}

export interface HolidayTableControls {
  canEdit?: boolean
  selected?: Set<string>
  toggleRow?: (id: string) => void
  allShownSelected?: boolean
  toggleAllShown?: () => void
  busyId?: string | null
  setApprovalFor?: (ids: string[], status: 'approved' | 'rejected') => void
  clearCard?: (id: string) => void
  showMessage?: boolean
  hideApproval?: boolean
  hideCard?: boolean
  hideSource?: boolean
}

// ── הגדרת העמודות ──
// ⚠️ מקור אמת יחיד: הכותרת, התא ומצב ברירת המחדל יושבים יחד. כשהם נפרדו
// לשלוש רשימות, הוספת עמודה במקום אחד ושכחה באחר הסיטה את כל השורה.
type ColKey =
  | 'family_name' | 'first_name' | 'id_number' | 'approval_label' | 'spouse_name'
  | 'approval' | 'card' | 'phone' | 'email' | 'address' | 'city'
  | 'age' | 'children' | 'source' | 'registered_at' | 'amount' | 'message'
  | 'center'

interface ColDef {
  key: ColKey
  label: string
  /** מוצגת כברירת מחדל. ⚠️ הברירה נבחרה כך שהסכום נכנס לרוחב מסך רגיל. */
  def: boolean
  align?: 'center'
}

const COLUMNS: ColDef[] = [
  { key: 'family_name', label: 'שם משפחה', def: true },
  { key: 'first_name', label: 'שם פרטי', def: true },
  { key: 'id_number', label: 'ת״ז', def: true },
  // ⚠️ עמודה משלה בנוסף לתג שליד שם המשפחה — ריקה אצל הרוב המוחלט.
  { key: 'approval_label', label: 'סיבת אישור', def: true },
  { key: 'spouse_name', label: 'בן/בת זוג', def: false },
  { key: 'approval', label: 'אישור הבקשה', def: true },
  { key: 'card', label: 'כרטיס', def: false },
  { key: 'phone', label: 'טלפון', def: true },
  { key: 'email', label: 'מייל', def: false },
  { key: 'address', label: 'כתובת', def: false },
  { key: 'city', label: 'עיר', def: true },
  // ⚠️ מוצגת כברירת מחדל: זו העמודה שכל עבודת החלוקה נשענת עליה.
  { key: 'center', label: 'מוקד חלוקה', def: true },
  { key: 'age', label: 'גיל', def: false, align: 'center' },
  { key: 'children', label: 'ילדים', def: true, align: 'center' },
  { key: 'source', label: 'ערוץ', def: true },
  { key: 'registered_at', label: 'תאריך רישום', def: true },
  { key: 'amount', label: 'סכום', def: true },
  { key: 'message', label: 'הודעה', def: false },
]

export default function HolidayRecipientsTable({
  rows, amountPerFamily, fmtDateTime, fmtCur, controls = {}, paginated = false,
}: {
  rows: HolidayRow[]
  amountPerFamily: number | null
  fmtDateTime: (d?: string | null) => string
  fmtCur: (n: number) => string
  controls?: HolidayTableControls
  /**
   * ⚠️ הקורא מדפדף בעצמו ומעביר עמוד מוכן — לכן הגלילה האינסופית מכובה.
   * בלי זה שתי המכניקות רצות יחד: העמוד מוגבל ל-50 שורות, והגלילה
   * האינסופית "טוענת עוד" מתוכן — כלומר כפתור שלא עושה כלום.
   * דף השיתוף ממשיך בגלילה אינסופית (ברירת המחדל).
   */
  paginated?: boolean
}) {
  const { canEdit = false, selected, toggleRow, allShownSelected, toggleAllShown,
    busyId, setApprovalFor, clearCard, showMessage = false,
    hideApproval = false, hideCard = false, hideSource = false } = controls

  const [picker, setPicker] = useState(false)
  const [visible, setVisible] = useState<Set<ColKey>>(
    () => new Set(COLUMNS.filter(c => c.def).map(c => c.key)),
  )

  // ⚠️ העמודות שהקורא הסתיר (dept השיתוף) יורדות מהבורר עצמו ולא רק
  // מהטבלה — אחרת המשתמש מסמן עמודה ושום דבר לא קורה.
  const available = useMemo(() => COLUMNS.filter(c => {
    if (c.key === 'approval' && hideApproval) return false
    if (c.key === 'card' && hideCard) return false
    if (c.key === 'source' && hideSource) return false
    if (c.key === 'message' && !showMessage) return false
    if (c.key === 'amount' && amountPerFamily == null) return false
    return true
  }), [hideApproval, hideCard, hideSource, showMessage, amountPerFamily])

  const shown = useMemo(
    () => available.filter(c => visible.has(c.key)),
    [available, visible],
  )

  // 🔴 גרירת רוחב עמודות (כמו באקסל) — רכיב מערכתי משותף לכל הטבלאות.
  // ⚠️ המזהה כולל את מספר העמודות הנראות: הסתרת עמודה מזיזה את כל
  // האינדקסים, ורוחב שנשמר למצב אחר היה נדבק לעמודה הלא נכונה.
  const rt = useResizableColumns(`holiday-recipients-${shown.length}${canEdit ? '-e' : ''}`, shown.length + (canEdit ? 1 : 0))

  // ⚠️ פירוק ישיר ולא גישה דרך אובייקט: האובייקט שה-hook מחזיר מכיל גם
  // sentinelRef, וכלל react-hooks/refs סימן *כל* גישה דרכו כקריאת ref
  // בזמן רינדור — כולל shown/total שהם מספרים רגילים. הפירוק מפריד ביניהם.
  const { rows: incRows, sentinelRef: incSentinel, hasMore: incHasMore, shown: incShown, total: incTotal } =
    useIncrementalRows(rows)
  // במצב מדופדף השורות כבר חתוכות לעמוד — מוצגות כולן, בלי sentinel.
  const visibleRows = paginated ? rows : incRows
  const sentinelRef = incSentinel
  const hasMore = paginated ? false : incHasMore
  const shownCount = incShown
  const total = incTotal

  if (!rows.length) {
    return <p className="px-4 py-10 text-center text-slate-400 text-sm font-medium">אין נרשמים לחלוקה זו</p>
  }

  const toggleCol = (k: ColKey) => {
    setVisible(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  const cell = (c: ColDef, r: HolidayRow) => {
    switch (c.key) {
      case 'family_name':
        return (
          <span className="inline-flex items-center gap-1.5 flex-wrap font-semibold text-slate-800">
            {r.beneficiary_id && canEdit
              ? <Link href={`/admin/beneficiaries/${r.beneficiary_id}`} className="hover:text-indigo-700 hover:underline">
                  {r.family_name || r.name}
                </Link>
              : (r.family_name || r.name)}
            {/* ⚠️ גם ליד השם וגם בעמודה: מי שכיבה את העמודה עדיין צריך לדעת
                שהנרשם אינו צאצא רגיל. */}
            <ApprovalLabelTag label={r.approval_label} size="xs" />
          </span>
        )
      case 'first_name': return <span className="text-slate-700">{r.first_name || '—'}</span>
      case 'id_number': return <span className="font-mono text-slate-600 ltr-num">{r.id_number ?? '—'}</span>
      case 'approval_label':
        return r.approval_label
          ? <ApprovalLabelTag label={r.approval_label} size="xs" />
          : <span className="text-[11px] text-slate-400">—</span>
      case 'spouse_name': return <span className="text-slate-600">{r.spouse_name ?? '—'}</span>
      case 'approval':
        return (
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${APPROVAL_STYLE[r.approval_status]}`}>
              {APPROVAL_LABEL[r.approval_status]}
            </span>
            {canEdit && (busyId === r.id
              ? <Loader2 size={13} className="animate-spin text-slate-400" />
              : <>
                  {r.approval_status !== 'approved' && (
                    <button type="button" title="אישור הבקשה" onClick={() => setApprovalFor?.([r.id], 'approved')}
                      className="rounded-lg p-1 text-green-700 hover:bg-green-50"><Check size={14} /></button>
                  )}
                  {r.approval_status !== 'rejected' && (
                    <button type="button" title="דחיית הבקשה" onClick={() => setApprovalFor?.([r.id], 'rejected')}
                      className="rounded-lg p-1 text-rose-600 hover:bg-rose-50"><X size={14} /></button>
                  )}
                </>
            )}
          </div>
        )
      case 'card':
        if (r.card_linked_at) return (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[12px] text-slate-700 ltr-num">{r.card_number}</span>
            <span className="text-[11px] font-bold text-green-700">✓</span>
            {canEdit && (busyId === r.id
              ? <Loader2 size={12} className="animate-spin text-slate-400" />
              : <button type="button" title="ניקוי השיוך" onClick={() => clearCard?.(r.id)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><X size={12} /></button>)}
          </div>
        )
        if (r.card_link_error) return <span className="text-[11px] font-bold text-rose-700" title={r.card_link_error}>נכשל</span>
        return <span className="text-[11px] text-slate-400">{r.approval_status === 'approved' ? 'ממתין לשיוך' : '—'}</span>
      case 'phone': return <span className="font-mono text-slate-600 ltr-num">{r.ben_phone ?? r.phone ?? '—'}</span>
      // ⚠️ text-right מפורש: dir="ltr" הופך את ברירת המחדל לשמאל, והמייל
      // היה נצמד לצד ההפוך מהכותרת.
      case 'email': return <span className="block truncate text-slate-600 text-right" dir="ltr" title={r.email ?? ''}>{r.email ?? '—'}</span>
      case 'address': return <span className="block truncate text-slate-600" title={r.address ?? ''}>{r.address ?? '—'}</span>
      case 'city': return <span className="text-slate-600">{r.city ?? '—'}</span>
      case 'center': return r.center_name
        ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="text-slate-700">{r.center_name}</span>
            {/* ⚠️ הערוץ מוצג: "בחרתי בטלפון ורשום אחרת" אינו ניתן לבירור בלעדיו. */}
            {r.center_source && (
              <span className="text-[10px] text-slate-400">
                {r.center_source === 'phone' ? 'טלפון' : r.center_source === 'portal' ? 'אתר' : 'ידני'}
              </span>
            )}
          </span>
        )
        : <span className="text-slate-300">טרם נבחר</span>
      case 'age': return <span className="text-slate-600 ltr-num">{r.age ?? '—'}</span>
      case 'children': return <span className="text-slate-600 ltr-num">{r.children_count ?? '—'}</span>
      case 'source': {
        const I = SOURCE_ICON[r.source] ?? Pencil
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
            <I size={11} /> {SOURCE_LABEL[r.source]}
          </span>
        )
      }
      case 'registered_at': return <span className="text-slate-500 ltr-num text-[11px]">{fmtDateTime(r.registered_at)}</span>
      case 'amount': return <span className="font-bold text-emerald-700 ltr-num">{amountPerFamily ? fmtCur(amountPerFamily) : '—'}</span>
      case 'message':
        if (r.notified_at) return (
          <span className="text-[11px] font-bold text-green-700" title={fmtDateTime(r.notified_at)}>
            ✓ נשלח{r.notify_error ? <span className="text-amber-700" title={r.notify_error}> ⚠</span> : null}
          </span>
        )
        if (r.notify_error) return <span className="text-[11px] font-bold text-rose-700" title={r.notify_error}>נכשל</span>
        return <span className="text-[11px] font-bold text-slate-400">—</span>
    }
  }

  // ⚠️ עמודות ארוכות-תוכן מוגבלות ברוחב + truncate; הקצרות nowrap. כך
  // הטבלה נשארת בתוך הרוחב בלי גלילה, גם כשמסומנות עמודות רבות.
  // 🔴 גלישה ולא חיתוך: הצרת עמודה שוברת את הטקסט לשורות ומגביהה את
  // השורה — כמו באקסל. truncate/nowrap היו מעלימים מידע במקום להציג
  // אותו אחרת, וזו בדיוק הנקודה של הגרירה.
  const cellClass = () => rt.cellClass

  return (
    <div className="flex flex-col gap-2">
      {/* ── בורר העמודות ── */}
      {/* ⚠️ "הצגת הכל" ליד הבורר ולא בקצה הנגדי: הוא פעולה *על* הבורר,
          וריחוק ממנו נראה כפריט מנותק. */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setPicker(o => !o)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600">
          <Columns3 size={13} />
          בחירת עמודות ({shown.length}/{available.length})
          <span className="text-slate-400">{picker ? '▲' : '▼'}</span>
        </button>
        {shown.length < available.length && (
          <button type="button" onClick={() => setVisible(new Set(available.map(c => c.key)))}
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

      {picker && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          {available.map(c => {
            const on = visible.has(c.key)
            return (
              <button key={c.key} type="button" onClick={() => toggleCol(c.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition ${
                  on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}>
                {on && <Check size={11} />}{c.label}
              </button>
            )
          })}
        </div>
      )}

      {/* ⚠️ בלי overflow-x — הכלל: אין גלילה לרוחב בשום טבלה. */}
      <div className="w-full">
        <table className="w-full text-[12px] border-collapse" style={rt.tableStyle}>
          <colgroup>{rt.cols}</colgroup>
          <thead className="bg-slate-50 text-slate-500">
            <tr className="[&>th]:px-2.5 [&>th]:py-2.5 [&>th]:font-bold [&>th]:text-right [&>th]:border-l [&>th]:border-slate-200 [&>th:last-child]:border-l-0">
              {canEdit && (
                <th className="w-8">
                  <input type="checkbox" checked={!!allShownSelected} onChange={() => toggleAllShown?.()}
                    className="h-4 w-4 accent-indigo-600" aria-label="סימון כל המוצגים" />
                </th>
              )}
              {shown.map((c, i) => (
                <th key={c.key} className={`relative ${c.align === 'center' ? 'text-center' : ''}`}>
                  {c.label}{rt.handle(canEdit ? i + 1 : i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map(r => (
              <tr key={r.id} className="hover:bg-indigo-50/40 align-middle [&>td]:px-2.5 [&>td]:py-2 [&>td]:border-l [&>td]:border-slate-100 [&>td:last-child]:border-l-0">
                {canEdit && (
                  <td className="w-8">
                    <input type="checkbox" checked={!!selected?.has(r.id)} onChange={() => toggleRow?.(r.id)}
                      className="h-4 w-4 accent-indigo-600" aria-label={`סימון ${r.name}`} />
                  </td>
                )}
                {shown.map(c => (
                  <td key={c.key} className={`${cellClass()} ${c.align === 'center' ? 'text-center' : ''}`}>
                    {cell(c, r)}
                  </td>
                ))}
              </tr>
            ))}
            {/* זקיף הגלילה — colSpan נדיב במכוון: מספר העמודות משתנה. */}
            {hasMore && (
              <tr ref={sentinelRef as React.Ref<HTMLTableRowElement>}>
                <td colSpan={20} className="px-3 py-4 text-center text-slate-400 text-[11px] font-medium">
                  <Loader2 size={14} className="inline animate-spin ml-1.5" />
                  טוען עוד… ({shownCount.toLocaleString()} מתוך {total.toLocaleString()})
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
