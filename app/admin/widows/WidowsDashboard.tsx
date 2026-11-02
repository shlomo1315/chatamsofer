'use client'
import { useState, useMemo } from 'react'
import { FolderOpen, Clock } from 'lucide-react'
import { Beneficiary, WidowRequest, WidowSupportPayment } from '@/types'
import SortButtons, { SortMode, applySortMode } from '@/components/ui/SortButtons'
import { useTablePagination } from '@/lib/useTablePagination'
import StatStrip from '@/components/admin/system/StatStrip'
import { ListTable } from '@/components/admin/system/ListTable'
import { SearchBar } from '@/components/admin/system/SearchBar'
import WidowCardModal from './WidowCardModal'
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
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [onlyPending, setOnlyPending] = useState(false)
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

  const filtered = useMemo(() => widows.filter(w => {
    if (onlyPending && !pendingByFamily[w.id]) return false
    if (!query.trim()) return true
    return [fullName(w), w.id_number, w.city].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase())
  }), [widows, query, onlyPending, pendingByFamily])

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

  const cell = (c: ColDef<ColKey, Beneficiary>, w: Beneficiary) => {
    switch (c.key) {
      case 'name': {
        const pend = pendingByFamily[w.id] ?? 0
        return (
          <span className="flex items-center gap-2 flex-wrap font-semibold text-ink">
            {fullName(w)}
            {pend > 0 && <span className="text-[10px] font-semibold bg-gold-soft text-navy rounded-full px-2 py-0.5">{pend} בקשות</span>}
            {/* ⚠️ גם ליד השם וגם בעמודה: מי שכיבה את העמודה עדיין צריך לדעת
                שהמשפחה אינה צאצא רגיל. */}
            <ApprovalLabelTag label={approvalLabelOf(w)} size="xs" />
          </span>
        )
      }
      case 'id_number': return <span className="text-xs text-ink-soft ltr-num">{w.id_number}</span>
      case 'approval_label': {
        const lbl = approvalLabelOf(w)
        return lbl ? <ApprovalLabelTag label={lbl} size="xs" /> : <span className="text-ink-faint">—</span>
      }
      case 'city': return <span className="text-ink-soft">{w.city || '—'}</span>
      case 'children': return <span className="text-ink-soft tabular-nums">{w.children_count ?? 0}</span>
      case 'monthly': return <span className="text-ink font-medium ltr-num">{w.monthly_support ? fmtCur(Number(w.monthly_support)) : '—'}</span>
      case 'total': return <span className="text-navy font-bold ltr-num">{totalsByFamily[w.id] ? fmtCur(totalsByFamily[w.id]) : '—'}</span>
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <StatStrip active={onlyPending ? 'pending' : 'all'}
        onSelect={k => setOnlyPending(k === 'pending' && !onlyPending)}
        items={[
          { key: 'all', label: 'תיקי משפחות', count: widows.length, icon: FolderOpen },
          { key: 'pending', label: 'בקשות ממתינות', count: pendingTotal, icon: Clock },
        ]} />
      <p className="text-sm text-ink-soft">
        סך תמיכות כללי <b className="text-navy tabular-nums">{fmtCur(totalSupport)}</b>
        <span className="mx-2 text-ink-faint">·</span>
        סך תמיכות חודשי <b className="text-navy tabular-nums">{fmtCur(monthlySupport)}</b>
      </p>
      <ListTable tc={tc} rows={visibleRows} pg={pg} empty="אין תיקים"
        onOpen={w => setOpenIdx(tc.rows.findIndex(x => x.id === w.id))}
        renderCell={cell}
        toolbar={<>
          <h2 className="ml-auto font-bold text-navy">תיקי משפחות</h2>
          <SortButtons value={sort} onChange={setSort} />
          <SearchBar value={query} onChange={setQuery} placeholder="חיפוש לפי שם / ת.ז / עיר…" />
        </>} />
      {openIdx !== null && tc.rows[openIdx] && (
        <WidowCardModal rows={tc.rows} index={openIdx} onIndex={setOpenIdx} onClose={() => setOpenIdx(null)}
          payments={payments} requests={requests} />
      )}
    </div>
  )
}
