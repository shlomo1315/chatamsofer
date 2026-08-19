'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, Check, X, Eye, Search, Layers, CheckCircle2, Minus, MessageSquare } from 'lucide-react'
import { LoanStatusControl, DeleteLoanButton } from './LoanControls'
import type { Loan } from '@/types'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import SortButtons, { SortMode, applySortMode } from '@/components/ui/SortButtons'
import { useTablePagination } from '@/lib/useTablePagination'
import Pagination from '@/components/ui/Pagination'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'
import ApprovalLabelTag from '@/components/ui/ApprovalLabelTag'
import { approvalLabelOf } from '@/lib/approvalLabel'
import {
  isApproved as isApprovedCat, isRejected as isRejectedCat,
  isFreshTodo as isFreshTodoCat, isReturned as isReturnedCat,
  isTodo as isTodoCat, isSentPending as isSentPendingCat,
  type LoanFilter as Filter, type LoanTodoSub as TodoSub,
} from '@/lib/loansListFilter'

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yy', { locale: he }) : '—'
// 🔴 ההלוואות נקובות בדולר: הסכום מוקלד בדולרים, וההחזר בשקלים לפי שער
// היום. הצגה ב-₪ הציגה מספר שאינו קיים — לא הסכום שהתבקש ולא זה שיוחזר.
const fmtCur = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('he-IL')}`

type BenRef = { full_name?: string; family_name?: string; id_number?: string; spouse_name?: string; spouse_id_number?: string }
// שם הלווה — שם הבעל (full_name); אם אין בעל, שם האישה (spouse_name)
const borrowerName = (b?: BenRef) =>
  b ? ([b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' ') || b.full_name || '—') : '—'

// 🔴 הלשוניות מאורגנות לפי *מי צריך לפעול עכשיו*, לא לפי סטטוס גולמי.
//
// ⚠️ קודם "ממתין לאישור" ו"בתהליך בירור" היו שתי קוביות נפרדות, ובקשה
// שהמבקש כבר ענה עליה נבלעה בתוך "בירור" — כלומר היא דרשה טיפול והמסך
// הציג אותה כאילו ממתינים לו. עכשיו:
//   ממתין לטיפול  = הכדור אצלנו (טרם טופל · חזר מבירור)
//   נשלח לבירור   = הכדור אצל המבקש (נשלח ולא הגיב)
// ⚠️ הקטגוריות מיובאות מ-lib/loansListFilter ולא מוגדרות כאן: אותה לוגיקה
// בדיוק משוכפלת ב-SQL (loans_list_counts) לצורך המונים בצד השרת, ויש טסט
// שנועל אותה. הגדרה כפולה כאן הייתה מחזירה את התקלה שהמונה מציג מספר אחד
// והרשימה מציגה אחר.
const isApproved = (l: Loan) => isApprovedCat({ status: l.status })
const isRejected = (l: Loan) => isRejectedCat({ status: l.status })

interface CardDef { key: Filter; label: string; icon: typeof Clock; base: string; active: string; iconCls: string }
const CARD_DEFS: CardDef[] = [
  { key: 'all', label: 'הכל', icon: Layers, base: 'border-slate-200 hover:border-slate-300', active: 'border-slate-400 ring-2 ring-slate-200 bg-slate-50', iconCls: 'bg-slate-100 text-slate-600' },
  { key: 'todo', label: 'ממתין לטיפול', icon: Clock, base: 'border-amber-200 hover:border-amber-300', active: 'border-amber-400 ring-2 ring-amber-200 bg-amber-50', iconCls: 'bg-amber-100 text-amber-700' },
  { key: 'sent', label: 'נשלח לבירור', icon: MessageSquare, base: 'border-sky-200 hover:border-sky-300', active: 'border-sky-400 ring-2 ring-sky-200 bg-sky-50', iconCls: 'bg-sky-100 text-sky-700' },
  { key: 'approved', label: 'מאושרות', icon: Check, base: 'border-green-200 hover:border-green-300', active: 'border-green-400 ring-2 ring-green-200 bg-green-50', iconCls: 'bg-green-100 text-green-700' },
  { key: 'rejected', label: 'לא מאושרות', icon: X, base: 'border-red-200 hover:border-red-300', active: 'border-red-400 ring-2 ring-red-200 bg-red-50', iconCls: 'bg-red-100 text-red-700' },
]

// ── הגדרת העמודות ──
// ⚠️ "פעולות" אינה בבורר: היא הדרך היחידה למחוק ולצפות, והסתרתה משאירה
// את השורה בלי מוצא. לכן extraCols: 1 והידיות מוסטות באחד.
type ColKey =
  | 'borrower' | 'id_number' | 'approval_label' | 'amount' | 'approved_amount'
  | 'installments' | 'purpose' | 'created_at' | 'disbursed' | 'status'

const COLUMNS: ColDef<ColKey>[] = [
  { key: 'borrower', label: 'שם הלווה', def: true },
  { key: 'id_number', label: 'ת.ז.', def: true },
  // ⚠️ עמודה משלה ולא רק תג ליד השם: כך אפשר למיין/לסרוק את הרשימה לפי
  // סיבת האישור. ריקה אצל הרוב המוחלט — זו בדיוק הכוונה.
  { key: 'approval_label', label: 'סיבת אישור', def: true },
  { key: 'amount', label: 'סכום מבוקש', def: true },
  { key: 'approved_amount', label: 'סכום מאושר', def: true },
  { key: 'installments', label: 'תשלומים', def: false, align: 'center' },
  { key: 'purpose', label: 'מטרה', def: false },
  { key: 'created_at', label: 'תאריך הגשה', def: true },
  { key: 'disbursed', label: 'ביצוע', def: true },
  { key: 'status', label: 'סטטוס', def: true },
]

const haystack = (l: Loan) => {
  const b = l.beneficiary as BenRef | undefined
  return [borrowerName(b), b?.id_number, b?.spouse_id_number, l.purpose, fmtCur(l.amount), String(l.installments)]
    .filter(Boolean).join(' ').toLowerCase()
}

export default function LoansTable({ data, repliedIds = [] }: { data: Loan[]; repliedIds?: string[] }) {
  const router = useRouter()
  // ⚠️ נפתח על "ממתין לטיפול" ולא על "הכל": זו העבודה שממתינה, ורשימת
  // הכל דורשת סינון ידני בכל כניסה כדי להגיע אליה.
  const [filter, setFilter] = useState<Filter>('todo')
  const [sub, setSub] = useState<TodoSub>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('newest')

  const replied = useMemo(() => new Set(repliedIds), [repliedIds])
  const hasReplied = (l: Loan) => replied.has(String(l.id))

  // ── שתי הקטגוריות שהלשוניות נשענות עליהן ──
  // ⚠️ ההבחנה היא *אצל מי הכדור*, ולא מה הסטטוס הגולמי:
  //   ראשוני   — הוגש וטרם טופל (pending)
  //   חזר מבירור — נשלח בירור והמבקש ענה. הסטטוס נשאר 'inquiry', אבל
  //                מבחינת העבודה זו בקשה שממתינה *לנו*.
  //
  // ⚠️ הכללים עצמם ב-lib/loansListFilter (מקור אמת יחיד, משוכפל ל-SQL עם
  // טסט שנועל). כאן רק הגישור: repliedIds → lastDir, כי בצד הלקוח "מי השיב"
  // מגיע כרשימת מזהים ולא ככיוון ההודעה האחרונה.
  const asCat = (l: Loan) => ({ status: l.status, lastDir: hasReplied(l) ? 'applicant' : 'staff' })
  const isFreshTodo = (l: Loan) => isFreshTodoCat(asCat(l))
  const isReturned = (l: Loan) => isReturnedCat(asCat(l))
  const isTodo = (l: Loan) => isTodoCat(asCat(l))
  // 🔴 "נשלח לבירור" = נשלח ועדיין לא הגיב. בקשה שהמבקש ענה עליה יוצאת
  // מכאן ועוברת ל"ממתין לטיפול" — אחרת היא נראית כאילו ממתינים לו, בזמן
  // שהיא בעצם דורשת טיפול מיידי.
  const isSentPending = (l: Loan) => isSentPendingCat(asCat(l))

  const matchesFilter = (l: Loan, f: Filter) => {
    if (f === 'all') return true
    if (f === 'todo') return isTodo(l)
    if (f === 'sent') return isSentPending(l)
    if (f === 'approved') return isApproved(l)
    return isRejected(l)
  }

  const counts = useMemo(() => ({
    all: data.length,
    todo: data.filter(isTodo).length,
    sent: data.filter(isSentPending).length,
    approved: data.filter(isApproved).length,
    rejected: data.filter(isRejected).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, replied])

  const todoCounts = useMemo(() => ({
    all: data.filter(isTodo).length,
    fresh: data.filter(isFreshTodo).length,
    returned: data.filter(isReturned).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, replied])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.filter(l => {
      if (!matchesFilter(l, filter)) return false
      if (filter === 'todo' && sub === 'fresh' && !isFreshTodo(l)) return false
      if (filter === 'todo' && sub === 'returned' && !isReturned(l)) return false
      return q === '' || haystack(l).includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter, sub, query, replied])

  const visible = useMemo(() =>
    applySortMode(filtered, sort,
      l => borrowerName(l.beneficiary as BenRef | undefined),
      l => l.created_at,
    ), [filtered, sort])

  // ⚡ גלילה אינסופית — הטבלה רינדרה את *כל* ההלוואות המסוננות בבת אחת (10
  // עמודות לשורה, כולל LoanStatusControl שהוא קומפוננטת state מלאה לכל שורה),
  // וכל הקלדה בחיפוש/מיון בנתה הכל מחדש. שום שורה לא נעלמת — היא רק נטענת
  // כשמגיעים אליה בגלילה, והמונה למטה מראה כמה מוצגות מתוך הכל.
  // בורר עמודות + גרירת רוחב — רכיב מערכתי משותף.
  // ⚠️ המזהה נשאר 'loans' כדי לא לאבד כיוונון רוחב קיים; ה-hook מוסיף לו
  // את מספר העמודות הנראות בעצמו.
  const tc = useTableColumns('loans', COLUMNS, { extraCols: 1 })

  // דפדוף אחיד: 50 בברירת מחדל, בורר עד 200. החיפוש רץ על כל הרשימה
  // (visible כבר מסונן) ורק אז נחתך לעמוד — ראו lib/useTablePagination.
  const pg = useTablePagination(visible)
  const visibleRows = pg.rows

  // ── תוכן התא לפי עמודה ──
  // ⚠️ מקור אמת יחיד: הכותרת, התא וברירת המחדל יושבים יחד ב-COLUMNS.
  const cell = (c: ColDef<ColKey>, loan: Loan) => {
    const b = loan.beneficiary as BenRef | undefined
    switch (c.key) {
      case 'borrower':
        return (
          <div className="flex items-center gap-2 flex-wrap font-medium text-slate-800">
            <span>{borrowerName(b)}</span>
            {/* 🔴 הבקשה חזרה אלינו: נשלח בירור והמבקש ענה. הסטטוס נשאר
                'inquiry' (במכוון — ראה lib/loanInquiry), ולכן בלי הסימון
                הזה השורה נראית ברשימה בדיוק כמו בקשה שממתינים *לו*,
                בזמן שהיא דורשת טיפול מיידי. */}
            {isReturned(loan) && (
              <span title="המבקש השיב לבירור — הבקשה ממתינה לטיפולכם"
                className="animate-returned-pulse inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                <MessageSquare size={10} className="flex-shrink-0" />
                חזר מבירור
              </span>
            )}
            {/* ⚠️ גם ליד השם וגם בעמודה משלה: מי שכיבה את העמודה עדיין
                צריך לדעת שהמבקש אינו צאצא רגיל. */}
            <ApprovalLabelTag label={approvalLabelOf(b)} size="xs" />
          </div>
        )
      case 'id_number':
        return <span className="ltr-num text-xs font-mono text-slate-500">{b?.id_number ?? '—'}</span>
      case 'approval_label': {
        const lbl = approvalLabelOf(b)
        return lbl ? <ApprovalLabelTag label={lbl} size="xs" /> : <span className="text-slate-300">—</span>
      }
      case 'amount':
        return <span className="ltr-num font-semibold text-slate-900">{fmtCur(loan.amount)}</span>
      case 'approved_amount':
        return loan.approved_amount != null
          ? <span className="ltr-num font-semibold text-green-700">{fmtCur(loan.approved_amount)}</span>
          : <span className="text-slate-300">—</span>
      case 'installments':
        return <span className="text-slate-600">{loan.installments}</span>
      case 'purpose':
        return <span className="text-slate-600">{loan.purpose ?? '—'}</span>
      case 'created_at':
        return <span className="ltr-num text-slate-500 text-xs">{fmtDate(loan.created_at)}</span>
      case 'disbursed':
        return loan.disbursed_at ? (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 size={13} className="flex-shrink-0" />
              בוצע
            </span>
            <span className="text-[11px] text-slate-400 ltr-num">{fmtDate(loan.disbursed_at)}</span>
            {loan.disbursed_by && <span className="text-[11px] text-slate-400">{loan.disbursed_by}</span>}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <Minus size={13} />
            טרם בוצע
          </span>
        )
      case 'status':
        // ⚠️ familyApproved מועבר גם כאן ולא רק בכרטסת: בלעדיו הוא
        // undefined, ובורר "היקף האישור" היה ממשיך להופיע ברשימה
        // למשפחה מאושרת.
        return (
          <LoanStatusControl loan={loan}
            familyApproved={(loan.beneficiary as { eligibility_status?: string } | undefined)?.eligibility_status === 'approved'} />
        )
    }
  }

  // עמודות שהלחיצה בהן פותחת בורר/כפתור ולא אמורה לנווט לכרטיס ההלוואה.
  const stopsNavigation = (k: ColKey) => k === 'status'

  return (
    <div className="flex flex-col gap-5">
      {/* Filter cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {CARD_DEFS.map(c => {
          const Icon = c.icon
          const isActive = filter === c.key
          return (
            <button key={c.key}
              onClick={() => { setSub('all'); setFilter(isActive && c.key !== 'all' ? 'all' : c.key) }}
              className={`flex items-center gap-3 rounded-xl border bg-white p-3.5 text-right transition-all ${isActive ? c.active : c.base}`}>
              <span className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${c.iconCls}`}>
                <Icon size={18} />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{counts[c.key]}</span>
                <span className="text-xs text-slate-500 mt-1 truncate">{c.label}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {/* ⚠️ סרגל הכלים זהה למחלקת היולדות: החיפוש ראשון — כלומר בקצה
            הימני ב-RTL — ואחריו המיון והצ'יפים. מיקום אחיד בין המחלקות
            הוא מה שמונע חיפוש אחרי שדה החיפוש בכל מסך מחדש. */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
              <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש חופשי…"
                className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-colors" />
            </div>
            <SortButtons value={sort} onChange={setSort} />

            {/* ⚠️ צ'יפים בסגנון דף הצאצאים בדיוק — rounded-full, אינדיגו,
                וסימון ✓ על הפעיל. מוצגים רק בלשונית "ממתין לטיפול", כי שם
                בלבד ההבחנה רלוונטית: בקשה ראשונית נבדקת מאפס ובקשה שחזרה
                מבירור דורשת קריאת התשובה בלבד. */}
            {filter === 'todo' && todoCounts.all > 0 && (
              <div className="inline-flex items-center gap-1.5 flex-wrap">
                <button type="button" onClick={() => setSub('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    sub === 'all'
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
                  }`}>הכל</button>
                {([
                  { key: 'fresh', label: 'ממתין לטיפול ראשוני', n: todoCounts.fresh },
                  { key: 'returned', label: 'חזר מבירור', n: todoCounts.returned },
                ] as { key: TodoSub; label: string; n: number }[]).map(o => {
                  const active = sub === o.key
                  return (
                    <button key={o.key} type="button" onClick={() => setSub(o.key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        active
                          ? 'bg-indigo-100 border-indigo-300 text-indigo-700 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
                      }`}>
                      {active && <Check size={11} className="inline -mt-0.5 ml-1" />}
                      {o.label}
                      <span className={`mr-1.5 tabular-nums ${active ? 'text-indigo-500' : 'text-slate-400'}`}>{o.n}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        {/* ── בורר העמודות ── */}
        <div className="px-5 py-3 border-b border-slate-200">{tc.picker}</div>

        {/* ⚠️ בלי overflow-x — הכלל: אין גלילה לרוחב בשום טבלה. */}
        <div className="w-full">
          <table className="w-full text-sm text-right" style={tc.rt.tableStyle}>
            <colgroup>{tc.rt.cols}</colgroup>
            <thead>
              <tr className="bg-gradient-to-b from-slate-50 to-slate-100/60 border-b border-slate-200
                             [&>th]:px-4 [&>th]:py-3.5 [&>th]:text-[11px] [&>th]:font-bold [&>th]:uppercase
                             [&>th]:tracking-wide [&>th]:text-slate-500 [&>th]:align-middle [&>th]:text-right">
                {tc.shown.map((c, i) => (
                  <th key={c.key} className={tc.headClass(c)}>{c.label}{tc.rt.handle(i)}</th>
                ))}
                {/* ⚠️ הידית של "פעולות" היא האחרונה — האינדקס כולל את כל
                    העמודות הנראות שלפניה. */}
                <th className="relative">פעולות{tc.rt.handle(tc.shown.length)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length === 0 ? (
                <tr><td colSpan={20} className="px-4 py-12 text-center text-slate-400">לא נמצאו הלוואות בסינון זה</td></tr>
              ) : visibleRows.map(loan => (
                <tr key={loan.id}
                  onClick={() => router.push(`/admin/loans/${loan.id}`)}
                  className="even:bg-slate-50/50 hover:bg-indigo-50/50 transition-colors cursor-pointer
                             [&>td]:px-4 [&>td]:py-3.5 [&>td]:text-right">
                  {tc.shown.map(c => (
                    <td key={c.key} className={tc.cellClass(c)}
                      onClick={stopsNavigation(c.key) ? e => e.stopPropagation() : undefined}>
                      {cell(c, loan)}
                    </td>
                  ))}
                  <td className={tc.rt.cellClass} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/admin/loans/${loan.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                        <Eye size={14} /> צפייה
                      </Link>
                      <DeleteLoanButton loanId={loan.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* דפדוף + בורר גודל עמוד (20/50/100/200) */}
        <div className="px-4 py-3 border-t border-slate-100">
          <Pagination page={pg.page} size={pg.size} total={pg.total} onPage={pg.setPage} onSize={pg.setSize} />
        </div>
      </div>
    </div>
  )
}
