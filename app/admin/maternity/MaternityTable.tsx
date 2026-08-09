'use client'
import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, Check, X, Baby, Eye, Loader2, Search, FileText, Trash2, AlertTriangle, PencilLine } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ViewDocButton } from '@/components/ui/DocViewer'
import DownloadDocButton from '@/components/ui/DownloadDocButton'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import type { MaternityAid } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import SortButtons, { SortMode, applySortMode } from '@/components/ui/SortButtons'
import { StatusControl, deleteMaternityAid, STATUS_PILL, type MotherRef } from './maternityStatus'
import { babyNameLabel, isNamePending, type AidNameFields } from '@/lib/babyNames'
import { recoveryDaysOf } from '@/lib/maternity'
import { useIncrementalRows } from '@/lib/useIncrementalRows'

const formatDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yy', { locale: he }) : '—'

// שם היולדת (האישה) = שם משפחה + spouse_name. נפילה לשם הרשומה אם חסר
const motherName = (m?: MotherRef) => {
  if (!m) return '—'
  if (m.spouse_name) return [m.family_name, m.spouse_name].filter(Boolean).join(' ')
  return [m.family_name, m.full_name].filter(Boolean).join(' ') || '—'
}

// ── Status filter buckets ──────────────────────────────────────────────────────
// ממתין=pending · מאושר=active · לא מאושר=cancelled · בדיקה מעמיקה=deep_review
// ממתין לתיקונים=pending_fixes (baby_name_pending) — חוצה-סטטוס: היולדת סימנה
// "עדיין אין שם" וטרם השלימה. כל עוד לא תוקן, הרשומה יושבת כאן ולא ב"ממתין לאישור".
type Filter = 'all' | 'pending' | 'pending_fixes' | 'active' | 'cancelled' | 'deep_review'
// ⚠️ isNamePending בודק *שני* המקורות (baby_name + babies[]): רשומה שהשם שלה
// הושלם באחד מהם אינה "ממתינה לתיקון" רק כי הדגל נשאר דלוק.
// וגם: רק תיק שעדיין ממתין לאישור יושב כאן. תיק שאושר (או בוטל) — הטיפול בו
// נגמר; קודם הוא נספר גם כ"מאושר" וגם כ"ממתין לתיקונים", ולכן סכום הכרטיסים
// היה גדול מסך הכול, והיולדת נראתה כאילו לא טופלה.
const namePending = (a: MaternityAid) => isNamePending(a as AidNameFields) && a.status === 'pending'
const matchesFilter = (a: MaternityAid, f: Filter) => {
  if (f === 'all') return true
  if (f === 'pending_fixes') return namePending(a)
  // "ממתין לאישור" לא כולל רשומות שממתינות לתיקון שם — הן בקטגוריה נפרדת
  if (f === 'pending') return a.status === 'pending' && !namePending(a)
  return a.status === f
}

// סינון לפי ההטבה שהיולדת ביקשה. undefined (בקשות ישנות) = ביקשה — תאימות לאחור.
type BenefitFilter = 'all' | 'card' | 'recovery' | 'both'
const matchesBenefit = (a: MaternityAid, f: BenefitFilter) => {
  if (f === 'all') return true
  const wc = (a as { wants_food_card?: boolean }).wants_food_card !== false
  const wr = (a as { wants_recovery?: boolean }).wants_recovery !== false
  if (f === 'card') return wc && !wr        // כרטיס בלבד
  if (f === 'recovery') return wr && !wc    // בית החלמה בלבד
  return wc && wr                            // שתיהן
}
const BENEFIT_OPTS: { key: BenefitFilter; label: string }[] = [
  { key: 'all', label: 'כל ההטבות' },
  { key: 'both', label: 'כרטיס + הבראה' },
  { key: 'card', label: 'כרטיס בלבד' },
  { key: 'recovery', label: 'בית החלמה בלבד' },
]

interface CardDef { key: Filter; label: string; icon: typeof Clock; base: string; active: string; iconCls: string }
const CARD_DEFS: CardDef[] = [
  { key: 'all', label: 'הכל', icon: Baby, base: 'border-slate-200 hover:border-slate-300', active: 'border-slate-400 ring-2 ring-slate-200 bg-slate-50', iconCls: 'bg-slate-100 text-slate-600' },
  { key: 'pending', label: 'ממתין לאישור', icon: Clock, base: 'border-amber-200 hover:border-amber-300', active: 'border-amber-400 ring-2 ring-amber-200 bg-amber-50', iconCls: 'bg-amber-100 text-amber-700' },
  { key: 'pending_fixes', label: 'ממתין לתיקונים', icon: PencilLine, base: 'border-rose-200 hover:border-rose-300', active: 'border-rose-400 ring-2 ring-rose-200 bg-rose-50', iconCls: 'bg-rose-100 text-rose-700' },
  { key: 'deep_review', label: 'ממתין לאישור מנהל', icon: AlertTriangle, base: 'border-orange-200 hover:border-orange-300', active: 'border-orange-400 ring-2 ring-orange-200 bg-orange-50', iconCls: 'bg-orange-100 text-orange-700' },
  { key: 'active', label: 'מאושר', icon: Check, base: 'border-green-200 hover:border-green-300', active: 'border-green-400 ring-2 ring-green-200 bg-green-50', iconCls: 'bg-green-100 text-green-700' },
  { key: 'cancelled', label: 'לא מאושר', icon: X, base: 'border-red-200 hover:border-red-300', active: 'border-red-400 ring-2 ring-red-200 bg-red-50', iconCls: 'bg-red-100 text-red-700' },
]

// ── Delete button (table row) ─────────────────────────────────────────────────────
function DeleteAidButton({ aid }: { aid: MaternityAid }) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!(await confirm({ title: 'מחיקת תיק יולדת', message: `למחוק את תיק היולדת של "${aid.baby_name ?? 'התינוק'}" לצמיתות? פעולה זו אינה הפיכה.`, confirmLabel: 'מחיקה', danger: true }))) return
    setDeleting(true)
    try {
      await deleteMaternityAid(supabase, aid)
      toast.success('תיק היולדת נמחק')
      router.refresh()
    } catch (err: unknown) {
      toast.error(`שגיאה במחיקה: ${err instanceof Error ? err.message : String(err)}`)
      setDeleting(false)
    }
  }

  return (
    <>
    {/* ⚠️ אייקון בלבד, בגודל זהה לכפתור הצפייה. הכיתוב "מחיקה" הרחיב את
        הכפתור מעבר לעמודה הצרה, ושני הכפתורים נדחסו/ירדו שורה — במיוחד
        במסך צר או כשעמודות "כרטיס"/"הגעה" מוצגות. הכותרת (title) שומרת
        על הנגישות ומסבירה מה הכפתור עושה. */}
    <button onClick={handleDelete} disabled={deleting} title="מחיקת התיק"
      aria-label="מחיקת התיק"
      className="inline-flex items-center justify-center w-7 h-7 flex-shrink-0 text-red-600 hover:text-white hover:bg-red-600 rounded-lg border border-red-200 hover:border-red-600 transition-colors disabled:opacity-50">
      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
    {confirmDialog}
    </>
  )
}

// טקסט חיפוש לכל רשומה — מאחד את כל השדות המוצגים בטבלה לחיפוש חופשי
const searchHaystack = (a: MaternityAid) => {
  const m = a.beneficiary as MotherRef | undefined
  return [
    motherName(m),
    m?.spouse_id_number,
    babyNameLabel(a as AidNameFields).text,
    a.baby_id_number,
    formatDate(a.birth_date),
    a.recovery_home,
    a.card_number,
    STATUS_PILL[a.status]?.label,
  ].filter(Boolean).join(' ').toLowerCase()
}

// ── Main table ──────────────────────────────────────────────────────────────────
const CARD_STATUS_PILL: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'ממתין', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'אושר',   cls: 'bg-blue-100 text-blue-800' },
  loaded:   { label: 'נטען',    cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'נדחה',    cls: 'bg-red-100 text-red-800' },
}

export default function MaternityTable({ data, showCard, showArrived, hideFilters, emptyMessage, defaultFilter = 'all' }: { data: MaternityAid[]; showCard?: boolean; showArrived?: boolean; hideFilters?: boolean; emptyMessage?: string; defaultFilter?: Filter }) {
  const router = useRouter()
  // ברירת המחדל של הסינון — בלשונית הראשית מתחילים ב"ממתין לאישור" (defaultFilter='pending'),
  // כדי שהמזכירות תראה מיד את מה שדורש טיפול ולא את כל הרשימה.
  const [filter, setFilter] = useState<Filter>(defaultFilter)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('newest')
  // סינון לפי ההטבה שהיולדת ביקשה (כרטיס / הבראה / שתיהן)
  const [benefit, setBenefit] = useState<BenefitFilter>('all')

  // ⚡ רענון בחזרה ללשונית בלבד — הוסר הפולינג התקופתי (כל 90ש'): כל refresh
  // מריץ מחדש את כל טעינת מסך היולדות (כל ה-maternity_aids + joins), ובכל טאב
  // פתוח זה העמיס ברקע והאיט את האתר. refresh-on-focus נותן עדכניות כשחוזרים
  // למסך, בלי הטעינה-מחדש הכבדה כל דקה וחצי. (Realtime הוסר קודם — retry loop
  // בתכנית החינמית חסם את ה-main thread.)
  useEffect(() => {
    const onFocus = () => router.refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [router])

  // המונים תואמים ללוגיקת matchesFilter: "ממתין לאישור" לא כולל רשומות הממתינות
  // לתיקון שם (הן נספרות ב"ממתין לתיקונים"), כדי שרשומה לא תיספר פעמיים.
  const counts = useMemo(() => ({
    all: data.length,
    pending: data.filter(a => a.status === 'pending' && !namePending(a)).length,
    pending_fixes: data.filter(a => namePending(a)).length,
    active: data.filter(a => a.status === 'active').length,
    cancelled: data.filter(a => a.status === 'cancelled').length,
    deep_review: data.filter(a => a.status === 'deep_review').length,
  }), [data])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.filter(a =>
      matchesFilter(a, filter) && matchesBenefit(a, benefit) && (q === '' || searchHaystack(a).includes(q))
    )
  }, [data, filter, benefit, query])

  const visible = useMemo(() =>
    applySortMode(filtered, sort,
      a => motherName(a.beneficiary as MotherRef | undefined),
      a => a.created_at,
    ), [filtered, sort])

  // ⚡ גלילה אינסופית — הטבלה רינדרה את כל השורות המסוננות בבת אחת (עד ~1000
  // שורות × 15 עמודות = ~15,000 תאים), וכל סינון/מיון/הקלדה בנה אותן מחדש.
  const { rows: visibleRows, sentinelRef, hasMore, shown, total } = useIncrementalRows(visible)

  return (
    <div className="flex flex-col gap-5">
      {/* Filter cards — 6 כרטיסים → 6 עמודות במסך רחב, מצומצמים כדי שייכנסו בשורה אחת */}
      {!hideFilters && (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {CARD_DEFS.map(c => {
          const Icon = c.icon
          const isActive = filter === c.key
          return (
            <button key={c.key}
              onClick={() => setFilter(isActive && c.key !== 'all' ? 'all' : c.key)}
              className={`flex items-center gap-2 rounded-xl border bg-white p-2.5 text-right transition-all ${isActive ? c.active : c.base}`}>
              <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${c.iconCls}`}>
                <Icon size={15} />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-xl font-bold text-slate-900 tabular-nums leading-none">{counts[c.key]}</span>
                <span className="text-[11px] text-slate-500 mt-0.5 truncate">{c.label}</span>
              </span>
            </button>
          )
        })}
      </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {/* ⚠️ הכותרת "רשימת לידות" הוסרה: היא חזרה על כותרת העמוד ורק דחקה את
            החיפוש שמאלה. בלעדיה החיפוש יושב בקצה הימני — אותו מקום שבו הוא
            נמצא בשאר המחלקות ובמסך הצאצאים. */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* חיפוש חופשי — ראשון, כלומר בצד ימין ב-RTL. אותו מיקום כמו
                בשאר המחלקות ובמסך הצאצאים, כדי שלא יבלבל. */}
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="חיפוש חופשי…"
                className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-colors"
              />
            </div>
            <SortButtons value={sort} onChange={setSort} />
            {/* סינון לפי ההטבה שהיולדת ביקשה — אותו עיצוב כמו כפתורי המיון */}
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 flex-shrink-0">
              {BENEFIT_OPTS.map(o => (
                <button
                  key={o.key}
                  onClick={() => setBenefit(o.key)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    benefit === o.key
                      ? 'bg-white text-slate-800 shadow-sm shadow-slate-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-hidden">
          {/* ⚠️ table-fixed + colgroup ברוחבי אחוזים: הדרישה היא שהכל ייכנס לרוחב
              המסך *בלי גלילה רוחבית בכלל*. עם 15 עמודות אי אפשר לשמור nowrap על
              הכל — לכן עמודות הטקסט (שמות, בית החלמה) מקבלות wrap (break-words):
              טקסט ארוך יורד שורה ומגביה את השורה, ואף עמודה לא "בורחת" מתחת
              לכותרת הלא-נכונה. עמודות קצרות (ת"ז, תגיות, תאריכים) נשארות nowrap.
              הרוחבים ב-colgroup מסתכמים ל-100% ומחולקים לפי חשיבות/אורך התוכן. */}
          <table className="w-full table-fixed text-sm text-right">
            {/* ⚠️ הרוחבים מסתכמים בדיוק ל-100% בכל שילוב (בסיס / +showCard / +showArrived),
                אחרת table-fixed דוחס והתוכן נחתך/חופף. עמודות טקסט (שמות, בית החלמה)
                מקבלות wrap ולכן יכולות לקבל פחות; סטטוס ופעולות מקבלות מספיק רוחב
                לתגית+חצים ולזוג האייקונים. חושב לכל מצב בנפרד. */}
            <colgroup>
              {(() => {
                // רוחבים בסיסיים (12 עמודות: בלי showCard/showArrived) — סכום 100
                const base: Record<string, number> = {
                  mother: 12, wifeId: 8, baby: 11, benefit: 9, babyId: 8, birth: 7,
                  recovery: 9, days: 5, cert: 8, source: 7, status: 8, actions: 8,
                }
                // כשמופיעות עמודות נוספות, מקטינים את הטקסט הארוך כדי לפנות להן מקום
                const w = { ...base }
                if (showCard) {
                  Object.assign(w, { mother: 10, baby: 9, benefit: 7, recovery: 7, cert: 6, source: 5, status: 7, actions: 7 })
                }
                if (showArrived) {
                  Object.assign(w, { mother: 9, baby: 8, benefit: 6, recovery: 7, babyId: 7, wifeId: 7, cert: 6, source: 5, status: 6, actions: 6 })
                }
                const cols: { key: string; w: number }[] = [
                  { key: 'mother', w: w.mother }, { key: 'wifeId', w: w.wifeId }, { key: 'baby', w: w.baby },
                  { key: 'benefit', w: w.benefit }, { key: 'babyId', w: w.babyId }, { key: 'birth', w: w.birth },
                  { key: 'recovery', w: w.recovery }, { key: 'days', w: w.days },
                  ...(showArrived ? [{ key: 'arrived', w: 6 }, { key: 'amount', w: 7 }] : []),
                  { key: 'cert', w: w.cert }, { key: 'source', w: w.source },
                  ...(showCard ? [{ key: 'loadStatus', w: 6 }, { key: 'loadDate', w: 7 }, { key: 'cardLink', w: 6 }] : []),
                  { key: 'status', w: w.status }, { key: 'actions', w: w.actions },
                ]
                const total = cols.reduce((s, c) => s + c.w, 0)
                // מנרמלים ל-100% בדיוק כדי שלא תהיה גלישה/דחיסה
                return cols.map(c => <col key={c.key} style={{ width: `${(c.w / total) * 100}%` }} />)
              })()}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['שם היולדת', 'ת.ז. האישה', 'שם התינוק', 'הטבה', 'ת.ז. התינוק', 'תאריך לידה', 'בית החלמה', 'ימי זכאות', ...(showArrived ? ['הגעה', 'סכום בית החלמה'] : []), 'אישור לידה', 'אופן הגשה', ...(showCard ? ['סטטוס טעינה', 'תאריך ושעת טעינה', 'שיוך כרטיס'] : []), 'סטטוס', 'פעולות'].map(h => (
                  <th key={h} className="px-2 py-3.5 text-xs font-semibold text-slate-500 align-middle leading-tight break-words">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length === 0 ? (
                <tr><td colSpan={12 + (showCard ? 3 : 0) + (showArrived ? 2 : 0)} className="px-4 py-12 text-center text-slate-400">{emptyMessage ?? 'לא נמצאו לידות בסינון זה'}</td></tr>
              ) : visibleRows.map(aid => {
                const m = aid.beneficiary as MotherRef | undefined
                return (
                  <tr key={aid.id}
                    onClick={() => router.push(`/admin/maternity/${aid.id}`)}
                    className="hover:bg-indigo-50/50 cursor-pointer transition-colors">
                    <td className="px-2 py-3 align-middle font-medium text-slate-800 break-words">{motherName(m)}</td>
                    <td className="px-2 py-3 align-middle text-xs font-mono text-slate-600 break-words"><span className="ltr-num">{m?.spouse_id_number ?? '—'}</span></td>
                    <td className="px-2 py-3 align-middle text-slate-700 break-words">
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        {(() => {
                          const nm = babyNameLabel(aid as AidNameFields)
                          if (nm.missing) return <span className="text-slate-300">—</span>
                          return nm.pending
                            ? <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">⏳ {nm.text}</span>
                            : <span>{nm.text}</span>
                        })()}
                        {aid.is_twins && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700" title="לידת תאומים"><Baby size={10} /> תאומים</span>}
                      </span>
                    </td>
                    {/* עמודת ההטבה — נפרדת משם התינוק. מציגה תמיד מה היולדת ביקשה. */}
                    <td className="px-2.5 py-3 align-middle">
                      {(() => {
                        const wc = aid.wants_food_card !== false
                        const wr = aid.wants_recovery !== false
                        const label = wc && wr ? 'כרטיס + הבראה' : wc ? 'כרטיס בלבד' : wr ? 'בית החלמה בלבד' : '—'
                        const cls = wc && wr ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        return <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${cls}`} title="הטבות שהיולדת ביקשה">{label}</span>
                      })()}
                    </td>
                    <td className="px-2.5 py-3 align-middle text-xs font-mono text-slate-600"><span className="ltr-num">{aid.baby_id_number ?? '—'}</span></td>
                    <td className="px-2.5 py-3 align-middle text-slate-600"><span className="ltr-num">{formatDate(aid.birth_date)}</span></td>
                    <td className="px-2 py-3 align-middle text-slate-600 break-words">{aid.recovery_home ?? '—'}</td>
                    <td className="px-2.5 py-3 align-middle">
                      <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-sky-100 text-sky-800" title="ימי זכאות בבית ההחלמה">{recoveryDaysOf(aid)}</span>
                    </td>
                    {showArrived && (
                      <td className="px-2.5 py-3 align-middle">
                        {aid.recovery_arrived === true
                          ? <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800">הגיעה</span>
                          : aid.recovery_arrived === false
                            ? <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-800">לא הגיעה</span>
                            : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    {showArrived && (
                      <td className="px-2 py-3 align-middle">
                        {aid.recovery_amount != null ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-bold text-emerald-700">₪{Number(aid.recovery_amount).toLocaleString('he-IL')}</span>
                            {aid.recovery_amount_status === 'rejected'
                              ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">נדחה</span>
                              : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{aid.recovery_amount_status === 'approved' ? 'אושר' : 'מומש'}</span>}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    <td className="px-2 py-3 align-middle">
                      {aid.birth_certificate_url ? (
                        <span className="inline-flex items-center gap-1" title="צפייה באישור הלידה">
                          {/* אייקונים קומפקטיים (בלי טקסט) — נשארים בשורה אחת בעמודה צרה */}
                          <ViewDocButton url={aid.birth_certificate_url}
                            className="inline-flex items-center justify-center w-7 h-7 text-indigo-600 hover:text-indigo-700 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors">
                            <FileText size={14} />
                          </ViewDocButton>
                          <DownloadDocButton url={aid.birth_certificate_url} docType="אישור לידה" person={motherName(m)} name={aid.birth_certificate_url} variant="icon" />
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {/* אופן הגשת הבקשה — אתר / מייל / הזנה ידנית */}
                    <td className="px-2 py-3 align-middle">
                      {(() => {
                        const src = (aid as { source?: string | null }).source
                        if (src === 'portal') return <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">האתר</span>
                        if (src === 'email') return <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">מייל</span>
                        if (src === 'admin') return <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">הזנה ידנית</span>
                        return <span className="text-[11px] text-slate-400">—</span>
                      })()}
                    </td>
                    {showCard && (
                      <td className="px-2 py-3 align-middle">
                        {(() => {
                          // ⚠️ "נטען" אמיתי = יש card_tlush_id, שהוא ה-ID שנדרים החזיר
                          // בתגובה ל-AddTlush מוצלח (lib/nedarim.ts addTlush). הוא נכתב
                          // רק אחרי אישור נדרים, ולכן הוא ההוכחה שהכסף אכן הוטען שם.
                          // מציגים את הסכום שנטען בפועל (card_load_amount).
                          const proven = !!aid.card_tlush_id
                          if (proven) {
                            const amt = Number(aid.card_load_amount ?? 0)
                            return <span className="inline-flex items-center whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800" title={`מזהה טעינה בנדרים: ${aid.card_tlush_id}`}>
                              {amt > 0 ? `נטען ₪${amt.toLocaleString('he-IL')}` : 'נטען'}
                            </span>
                          }
                          const cs = aid.card_status ?? 'pending'
                          const pill = CARD_STATUS_PILL[cs] ?? CARD_STATUS_PILL.pending
                          return <span className={`inline-flex items-center whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full ${pill.cls}`}>{pill.label}</span>
                        })()}
                      </td>
                    )}
                    {showCard && (
                      <td className="px-2 py-3 align-middle text-slate-600">
                        {/* תאריך ושעת הטעינה בפועל — נכתב יחד עם אישור נדרים (card_loaded_at).
                            מוצג רק כשהטעינה אומתה (card_tlush_id), אחרת "—". */}
                        {aid.card_tlush_id && aid.card_loaded_at
                          ? <span className="ltr-num text-xs whitespace-nowrap">{format(new Date(aid.card_loaded_at), 'dd/MM/yy', { locale: he })}<br />{format(new Date(aid.card_loaded_at), 'HH:mm', { locale: he })}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    {showCard && (
                      <td className="px-2.5 py-3 align-middle">
                        {/* שיוך כרטיס בפועל — נקבע רק כשהמשפחה חיברה כרטיס בשיחת ימות (card_picked_up_at) */}
                        {aid.card_picked_up_at ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800">
                            <Check size={12} /> שויך
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                            <X size={12} /> לא שויך
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-3 align-middle" onClick={e => e.stopPropagation()}><StatusControl aid={aid} /></td>
                    <td className="px-2 py-3 align-middle" onClick={e => e.stopPropagation()}>
                      {/* אייקונים קומפקטיים בשורה אחת — עמודה צרה, בלי עומס.
                          ⚠️ flex-nowrap + flex-shrink-0: בלעדיהם הכפתורים ירדו
                          שורה או נדחסו כשהעמודה מצטמצמת (מסך צר / עמודות נוספות). */}
                      <div className="flex flex-nowrap items-center justify-center gap-1">
                        <Link href={`/admin/maternity/${aid.id}`} title="צפייה בתיק" aria-label="צפייה בתיק"
                          className="inline-flex items-center justify-center w-7 h-7 flex-shrink-0 text-slate-600 hover:text-indigo-600 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                          <Eye size={14} />
                        </Link>
                        <DeleteAidButton aid={aid} />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {/* זקיף הגלילה — מוסיף את המנה הבאה כשמגיעים לתחתית */}
              {hasMore && (
                <tr ref={sentinelRef as React.Ref<HTMLTableRowElement>}>
                  <td colSpan={20} className="px-3 py-4 text-center text-slate-400 text-[11px] font-medium">
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
