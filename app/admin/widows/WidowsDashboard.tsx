'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, MapPin, Baby, FolderOpen, Wallet, CalendarClock, ChevronLeft, Clock, Loader2 } from 'lucide-react'
import { Beneficiary, WidowRequest, WidowSupportPayment } from '@/types'
import SortButtons, { SortMode, applySortMode } from '@/components/ui/SortButtons'
import { useTablePagination } from '@/lib/useTablePagination'
import Pagination from '@/components/ui/Pagination'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'
import ApprovalLabelTag from '@/components/ui/ApprovalLabelTag'
import { approvalLabelOf } from '@/lib/approvalLabel'

const fullName = (b: Beneficiary) => [b.family_name, b.full_name].filter(Boolean).join(' ')
const fmtCur = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`

type ColKey = 'name' | 'id_number' | 'approval_label' | 'city' | 'children' | 'monthly' | 'total'

// ⚠️ headClassName נושא את הריפוד: <th> נבנה בתוך TableHeadMenu, וריפוד
// שנכתב בצרכן לא היה מגיע אליו.
const HEAD = 'px-4 py-3'

// 🔴 value() חובה בכל עמודה שמרנדרת JSX — בלעדיה המיון עובד על אובייקט
// React ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
// ⚠️ שם/ת.ז. — מיון בלבד (ערך ייחודי לכל שורה). עיר וסיבת אישור הן
// קבוצות ערכים סגורות ← גם סינון.
//
// ⚠️ "סך תמיכות" מחושב מ-payments ולכן ה-value שלו נבנה בתוך הרכיב
// (הוא תלוי ב-prop), ולא כאן. ראו COLUMNS_WITH_TOTALS למטה.
const COLUMNS: ColDef<ColKey, Beneficiary>[] = [
  { key: 'name', label: 'שם המשפחה', def: true, headClassName: HEAD, value: w => fullName(w) },
  { key: 'id_number', label: 'ת.ז.', def: true, kind: 'number', headClassName: HEAD, value: w => w.id_number || null },
  // ⚠️ עמודה משלה בנוסף לתג שליד השם — ריקה אצל הרוב המוחלט, וזו הכוונה.
  { key: 'approval_label', label: 'סיבת אישור', def: true, kind: 'enum', filterable: true, headClassName: HEAD,
    value: w => approvalLabelOf(w) || null },
  { key: 'city', label: 'עיר', def: true, kind: 'enum', filterable: true, headClassName: HEAD, value: w => w.city || null },
  { key: 'children', label: 'ילדים', def: true, align: 'center', kind: 'number', headClassName: HEAD,
    value: w => w.children_count ?? 0 },
  // ⚠️ null (ולא 0) כשאין תמיכה — אחרת "—" היה ממוין כאפס שקלים.
  { key: 'monthly', label: 'תמיכה חודשית', def: true, kind: 'number', headClassName: HEAD,
    value: w => w.monthly_support ? Number(w.monthly_support) : null },
  { key: 'total', label: 'סך תמיכות', def: true, kind: 'number', headClassName: HEAD },
]

export default function WidowsDashboard({
  widows, requests, payments,
}: { widows: Beneficiary[]; requests: WidowRequest[]; payments: WidowSupportPayment[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('newest')

  // סכומים לפי תיק
  const totalsByFamily = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of payments) m[p.beneficiary_id] = (m[p.beneficiary_id] ?? 0) + Number(p.amount || 0)
    return m
  }, [payments])

  const pendingByFamily = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of requests) if (r.status === 'pending') m[r.beneficiary_id] = (m[r.beneficiary_id] ?? 0) + 1
    return m
  }, [requests])

  // שלוש סטטיסטיקות עליונות
  const totalSupport = useMemo(() => payments.reduce((s, p) => s + Number(p.amount || 0), 0), [payments])
  const monthlySupport = useMemo(() => widows.reduce((s, w) => s + Number(w.monthly_support || 0), 0), [widows])
  const pendingTotal = useMemo(() => requests.filter(r => r.status === 'pending').length, [requests])

  const tiles = [
    { label: 'תיקי משפחות', value: String(widows.length), icon: FolderOpen, color: 'bg-purple-50 text-purple-600' },
    { label: 'סך תמיכות כללי', value: fmtCur(totalSupport), icon: Wallet, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'סך תמיכות חודשי', value: fmtCur(monthlySupport), icon: CalendarClock, color: 'bg-blue-50 text-blue-600' },
  ]

  const filtered = useMemo(() => widows.filter(w => {
    if (!query.trim()) return true
    return [fullName(w), w.id_number, w.city].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase())
  }), [widows, query])

  const visible = useMemo(() =>
    applySortMode(filtered, sort,
      w => fullName(w),
      w => w.created_at,
    ), [filtered, sort])

  // ⚡ גלילה אינסופית — במקום לרנדר את כל תיקי המשפחות בבת אחת. שום תיק לא
  // נחתך: המנה הבאה נטענת בגלילה, והמונה למטה מראה כמה מוצגים מתוך הכל.
  // ⚠️ הסטטיסטיקות למעלה נספרות מ-widows/payments המלאים ולא מ-visibleRows —
  // הן חייבות להישאר סכום כללי ולא להשתנות עם הגלילה.
  // דפדוף אחיד: 50 בברירת מחדל, בורר עד 200. החיפוש רץ על כל הרשימה
  // ורק אז נחתך לעמוד — ראו lib/useTablePagination.
  // 🔴 "סך תמיכות" נגזר מ-payments ולכן ה-value שלו נבנה כאן ולא בקבוע:
  // בלעדיו המיון על העמודה הזאת היה עובד על אובייקט React.
  const columns = useMemo(
    () => COLUMNS.map(c => c.key === 'total'
      ? { ...c, value: (w: Beneficiary) => totalsByFamily[w.id] ?? null }
      : c),
    [totalsByFamily],
  )

  // ⚠️ extraCols=1 — עמודת החץ בקצה אינה בבורר אך נספרת לגרירה. היא האחרונה,
  // ולכן האינדקסים של העמודות שבבורר נשארים 0..n-1.
  //
  // 🔴 סדר השרשרת: visible (חיפוש ומיון המסך) → tc.rows (מיון וסינון
  // מהכותרת) → pg.rows (חיתוך לעמוד). אילו ה-hook היה מקבל את pg.rows,
  // הסינון מהכותרת היה חל על 50 השורות שכבר על המסך בלבד.
  // ⚠️ mode:'client' — כל התיקים מגיעים כ-prop, אין דפדוף בשרת.
  const tc = useTableColumns<ColKey, Beneficiary>('widows', columns, {
    extraCols: 1,
    sortFilter: { mode: 'client', rows: visible },
  })

  // ⚠️ החיתוך אחרון — אחרי המיון והסינון מהכותרת.
  const pg = useTablePagination(tc.rows)
  const visibleRows = pg.rows

  const cell = (c: ColDef<ColKey>, w: Beneficiary) => {
    switch (c.key) {
      case 'name': {
        const pend = pendingByFamily[w.id] ?? 0
        return (
          <span className="flex items-center gap-2 flex-wrap font-medium text-slate-800">
            {fullName(w)}
            {pend > 0 && <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">{pend} בקשות</span>}
            {/* ⚠️ גם ליד השם וגם בעמודה: מי שכיבה את העמודה עדיין צריך לדעת
                שהמשפחה אינה צאצא רגיל. */}
            <ApprovalLabelTag label={approvalLabelOf(w)} size="xs" />
          </span>
        )
      }
      case 'id_number': return <span className="font-mono text-xs text-slate-500 ltr-num">{w.id_number}</span>
      case 'approval_label': {
        const lbl = approvalLabelOf(w)
        return lbl ? <ApprovalLabelTag label={lbl} size="xs" /> : <span className="text-slate-300">—</span>
      }
      case 'city': return w.city ? <span className="flex items-center gap-1 text-slate-600"><MapPin size={12} className="shrink-0" />{w.city}</span> : <span className="text-slate-600">—</span>
      case 'children': return <span className="inline-flex items-center gap-1 text-slate-600"><Baby size={13} className="shrink-0" />{w.children_count ?? 0}</span>
      case 'monthly': return <span className="text-blue-700 font-medium ltr-num">{w.monthly_support ? fmtCur(Number(w.monthly_support)) : '—'}</span>
      case 'total': return <span className="text-emerald-700 font-bold ltr-num">{totalsByFamily[w.id] ? fmtCur(totalsByFamily[w.id]) : '—'}</span>
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* שלוש סטטיסטיקות */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiles.map(t => (
          <div key={t.label} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${t.color}`}>
              <t.icon size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 ltr-num">{t.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t.label}</p>
            </div>
          </div>
        ))}
      </div>

      {pendingTotal > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800">
          <Clock size={15} /> {pendingTotal} בקשות ממתינות לטיפול — מסומנות בתיקים הרלוונטיים למטה.
        </div>
      )}

      {/* רשימת תיקי המשפחות */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-slate-900">תיקי משפחות</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <SortButtons value={sort} onChange={setSort} />
            <div className="relative w-full sm:w-56">
              <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש לפי שם / ת.ז / עיר…"
                className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 px-5 pt-3">{tc.picker}{tc.activeFilters}</div>
        {/* ⚠️ בלי overflow-x — הכלל: אין גלילה לרוחב בשום טבלה. */}
        <div className="w-full px-1 pt-2">
          <table className="w-full text-sm text-right" style={tc.rt.tableStyle}>
            <colgroup>{tc.rt.cols}</colgroup>
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                {/* כותרת אחידה לכל המערכת — מיון, סינון וגרירת רוחב. */}
                {tc.shown.map((c, i) => tc.th(c, i))}
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* 🔴 נמדד מול tc.rows — הסינון מהכותרת יכול לרוקן את הטבלה
                  גם כשהחיפוש שמעליה החזיר שורות. */}
              {tc.rows.length === 0 && (
                <tr><td colSpan={tc.shown.length + 1} className="text-center py-10 text-slate-400">אין תיקים</td></tr>
              )}
              {visibleRows.map(w => (
                <tr key={w.id} onClick={() => router.push(`/admin/widows/${w.id}`)} className="hover:bg-purple-50/40 cursor-pointer transition-colors">
                  {tc.shown.map(c => (
                    <td key={c.key} className={`px-4 py-3 ${tc.cellClass(c)}`}>{cell(c, w)}</td>
                  ))}
                  <td className="px-4 py-3 text-slate-300 align-top"><ChevronLeft size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* דפדוף + בורר גודל עמוד (20/50/100/200) — זהה לכל טבלאות המערכת */}
        <div className="px-4 py-3 border-t border-slate-100">
          <Pagination page={pg.page} size={pg.size} total={pg.total} onPage={pg.setPage} onSize={pg.setSize} />
        </div>
      </div>
    </div>
  )
}
