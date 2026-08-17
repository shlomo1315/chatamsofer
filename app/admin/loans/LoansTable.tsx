'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, Check, X, Eye, Search, Layers, CheckCircle2, Minus, MessageSquare, Loader2 } from 'lucide-react'
import { LoanStatusControl, DeleteLoanButton } from './LoanControls'
import type { Loan } from '@/types'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import SortButtons, { SortMode, applySortMode } from '@/components/ui/SortButtons'
import { useIncrementalRows } from '@/lib/useIncrementalRows'

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
type Filter = 'all' | 'todo' | 'sent' | 'approved' | 'rejected'
/** תת-סינון בתוך "ממתין לטיפול": ראשוני · חזר מבירור. */
type TodoSub = 'all' | 'fresh' | 'returned'

const isPending = (l: Loan) => l.status === 'pending'
const isInquiry = (l: Loan) => l.status === 'inquiry'
const isApproved = (l: Loan) => l.status === 'approved' || l.status === 'active' || l.status === 'completed'
const isRejected = (l: Loan) => l.status === 'rejected' || l.status === 'defaulted'

interface CardDef { key: Filter; label: string; icon: typeof Clock; base: string; active: string; iconCls: string }
const CARD_DEFS: CardDef[] = [
  { key: 'all', label: 'הכל', icon: Layers, base: 'border-slate-200 hover:border-slate-300', active: 'border-slate-400 ring-2 ring-slate-200 bg-slate-50', iconCls: 'bg-slate-100 text-slate-600' },
  { key: 'todo', label: 'ממתין לטיפול', icon: Clock, base: 'border-amber-200 hover:border-amber-300', active: 'border-amber-400 ring-2 ring-amber-200 bg-amber-50', iconCls: 'bg-amber-100 text-amber-700' },
  { key: 'sent', label: 'נשלח לבירור', icon: MessageSquare, base: 'border-sky-200 hover:border-sky-300', active: 'border-sky-400 ring-2 ring-sky-200 bg-sky-50', iconCls: 'bg-sky-100 text-sky-700' },
  { key: 'approved', label: 'מאושרות', icon: Check, base: 'border-green-200 hover:border-green-300', active: 'border-green-400 ring-2 ring-green-200 bg-green-50', iconCls: 'bg-green-100 text-green-700' },
  { key: 'rejected', label: 'לא מאושרות', icon: X, base: 'border-red-200 hover:border-red-300', active: 'border-red-400 ring-2 ring-red-200 bg-red-50', iconCls: 'bg-red-100 text-red-700' },
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
  const isFreshTodo = (l: Loan) => isPending(l)
  const isReturned = (l: Loan) => isInquiry(l) && hasReplied(l)
  const isTodo = (l: Loan) => isFreshTodo(l) || isReturned(l)
  // 🔴 "נשלח לבירור" = נשלח ועדיין לא הגיב. בקשה שהמבקש ענה עליה יוצאת
  // מכאן ועוברת ל"ממתין לטיפול" — אחרת היא נראית כאילו ממתינים לו, בזמן
  // שהיא בעצם דורשת טיפול מיידי.
  const isSentPending = (l: Loan) => isInquiry(l) && !hasReplied(l)

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
  const { rows: visibleRows, sentinelRef, hasMore, shown, total } = useIncrementalRows(visible)

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
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead>
              <tr className="bg-gradient-to-b from-slate-50 to-slate-100/60 border-b border-slate-200">
                {['שם הלווה', 'ת.ז.', 'סכום מבוקש', 'סכום מאושר', 'תשלומים', 'מטרה', 'תאריך הגשה', 'ביצוע', 'סטטוס', 'פעולות'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap align-middle text-right">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400">לא נמצאו הלוואות בסינון זה</td></tr>
              ) : visibleRows.map(loan => {
                const b = loan.beneficiary as BenRef | undefined
                // 🔴 הבקשה חזרה אלינו: נשלח בירור והמבקש ענה. הסטטוס נשאר
                // 'inquiry' (במכוון — ראה lib/loanInquiry), ולכן בלי הסימון
                // הזה השורה נראית ברשימה בדיוק כמו בקשה שממתינים *לו*,
                // בזמן שהיא דורשת טיפול מיידי.
                const returned = isReturned(loan)
                return (
                  <tr key={loan.id}
                    onClick={() => router.push(`/admin/loans/${loan.id}`)}
                    className="even:bg-slate-50/50 hover:bg-indigo-50/50 transition-colors cursor-pointer">
                    <td className="px-4 py-3.5 align-middle text-right font-medium text-slate-800 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{borrowerName(b)}</span>
                        {returned && (
                          <span title="המבקש השיב לבירור — הבקשה ממתינה לטיפולכם"
                            className="animate-returned-pulse inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-800 flex-shrink-0">
                            <MessageSquare size={10} className="flex-shrink-0" />
                            חזר מבירור
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-middle text-right text-xs font-mono text-slate-500"><span className="ltr-num">{b?.id_number ?? '—'}</span></td>
                    <td className="px-4 py-3.5 align-middle text-right font-semibold text-slate-900"><span className="ltr-num">{fmtCur(loan.amount)}</span></td>
                    <td className="px-4 py-3.5 align-middle text-right">
                      {loan.approved_amount != null
                        ? <span className="ltr-num font-semibold text-green-700">{fmtCur(loan.approved_amount)}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 align-middle text-right text-slate-600">{loan.installments}</td>
                    <td className="px-4 py-3.5 align-middle text-right text-slate-600 max-w-[140px] truncate">{loan.purpose ?? '—'}</td>
                    <td className="px-4 py-3.5 align-middle text-right text-slate-500 text-xs"><span className="ltr-num">{fmtDate(loan.created_at)}</span></td>
                    <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                      {loan.disbursed_at ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <CheckCircle2 size={13} className="flex-shrink-0" />
                            בוצע
                          </span>
                          <span className="text-[11px] text-slate-400 ltr-num">{fmtDate(loan.disbursed_at)}</span>
                          {loan.disbursed_by && <span className="text-[11px] text-slate-400 truncate max-w-[100px]">{loan.disbursed_by}</span>}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <Minus size={13} />
                          טרם בוצע
                        </span>
                      )}
                    </td>
                    {/* ⚠️ familyApproved מועבר גם כאן ולא רק בכרטסת: בלעדיו הוא
                        undefined, ובורר "היקף האישור" היה ממשיך להופיע ברשימה
                        למשפחה מאושרת. */}
                    <td className="px-4 py-3.5 align-middle" onClick={e => e.stopPropagation()}>
                      <LoanStatusControl loan={loan}
                        familyApproved={(loan.beneficiary as { eligibility_status?: string } | undefined)?.eligibility_status === 'approved'} />
                    </td>
                    <td className="px-4 py-3.5 align-middle" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/loans/${loan.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                          <Eye size={14} /> צפייה
                        </Link>
                        <DeleteLoanButton loanId={loan.id} />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {/* זקיף הגלילה — מוסיף את המנה הבאה כשמגיעים לתחתית */}
              {hasMore && (
                <tr ref={sentinelRef as React.Ref<HTMLTableRowElement>}>
                  <td colSpan={10} className="px-4 py-4 text-center text-slate-400 text-[11px] font-medium">
                    <Loader2 size={14} className="inline animate-spin ml-1.5" />
                    טוען עוד… ({shown.toLocaleString()} מתוך {total.toLocaleString()})
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
