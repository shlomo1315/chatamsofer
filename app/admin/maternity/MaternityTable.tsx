'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, Check, X, Baby, Eye, Loader2, Search, FileText, Trash2, AlertTriangle, PencilLine, MessageSquare } from 'lucide-react'
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
import { babyNameLabel, type AidNameFields } from '@/lib/babyNames'
import { matchesBucket, returnedFromInquiry, type MaternityBucket, type BucketAid } from '@/lib/maternityBuckets'
import { recoveryDaysOf } from '@/lib/maternity'
import { useTablePagination } from '@/lib/useTablePagination'
import Pagination from '@/components/ui/Pagination'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'
import ApprovalLabelTag from '@/components/ui/ApprovalLabelTag'
import { approvalLabelOf } from '@/lib/approvalLabel'

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
type Filter = MaternityBucket
// ⚠️ ההגדרה עברה ל-lib/maternityBuckets, כדי שניווט "הבאה/הקודמת" בכרטסת
// ישתמש *בדיוק* באותו כלל. כשהם חלוקים, "הבאה" קופצת ליולדת מלשונית אחרת
// והרצף שבו המזכירות עובדת נקטע.
const matchesFilter = (a: MaternityAid, f: Filter) => matchesBucket(a as BucketAid, f)

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

// ── הגדרת העמודות ──
// ⚠️ מקור אמת יחיד: הכותרת, מצב ברירת המחדל והתא (בפונקציית cell) יושבים
// לפי אותו מפתח. קודם הכותרות היו במערך נפרד מהתאים, וכל הוספת עמודה
// במקום אחד ושכחה באחר הסיטה את כל השורה.
type ColKey =
  | 'mother' | 'wifeId' | 'approval_label' | 'baby' | 'benefit' | 'babyId' | 'birth'
  | 'recovery' | 'days' | 'arrived' | 'amount' | 'cert' | 'source'
  | 'loadStatus' | 'loadDate' | 'cardLink' | 'status'

// ⚠️ ברירת המחדל צומצמה לתשע עמודות שנכנסות בנוחות למסך רגיל. השאר
// (ת"ז התינוק, אישור לידה, אופן הגשה) זמינות בבורר — קודם כל 12–19
// העמודות נדחסו יחד והטקסט נחתך.
const COLUMNS: ColDef<ColKey>[] = [
  { key: 'mother', label: 'שם היולדת', def: true },
  { key: 'wifeId', label: 'ת.ז. האישה', def: true },
  // ⚠️ עמודה משלה בנוסף לתג שליד השם — כך אפשר לסרוק את הרשימה לפי
  // סיבת האישור. ריקה אצל הרוב המוחלט, וזו הכוונה.
  { key: 'approval_label', label: 'סיבת אישור', def: true },
  { key: 'baby', label: 'שם התינוק', def: true },
  { key: 'benefit', label: 'הטבה', def: true },
  { key: 'babyId', label: 'ת.ז. התינוק', def: false },
  { key: 'birth', label: 'תאריך לידה', def: true },
  { key: 'recovery', label: 'בית החלמה', def: true },
  { key: 'days', label: 'ימי זכאות', def: true, align: 'center' },
  { key: 'arrived', label: 'הגעה', def: true },
  { key: 'amount', label: 'סכום בית החלמה', def: true },
  { key: 'cert', label: 'אישור לידה', def: false, align: 'center' },
  { key: 'source', label: 'אופן הגשה', def: false },
  { key: 'loadStatus', label: 'סטטוס טעינה', def: true },
  { key: 'loadDate', label: 'תאריך ושעת טעינה', def: false },
  { key: 'cardLink', label: 'שיוך כרטיס', def: true },
  { key: 'status', label: 'סטטוס', def: true },
]

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

  // ⚠️ המונים נגזרים מ-matchesFilter עצמו ולא משוכפלים לידו. כשהיו שני
  // מימושים, כל שינוי בכלל היה צריך להיזכר בשניהם — והמונה על הכרטיס הראה
  // מספר אחד בזמן שהלשונית הציגה רשימה אחרת.
  const counts = useMemo(() => Object.fromEntries(
    CARD_DEFS.map(c => [c.key, data.filter(a => matchesFilter(a, c.key)).length]),
  ) as Record<Filter, number>, [data])

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

  // ⚡ דפדוף אחיד (50 בברירת מחדל, בורר עד 200) — הטבלה רינדרה את כל השורות
  // המסוננות בבת אחת (עד ~1000 שורות × 15 עמודות = ~15,000 תאים), וכל
  // סינון/מיון/הקלדה בנה אותן מחדש.
  // ⚠️ החיפוש רץ על כל הרשימה (visible) ורק אז נחתך לעמוד — ראו useTablePagination.
  const pg = useTablePagination(visible)
  const visibleRows = pg.rows

  // ⚠️ העמודות שהמסך המארח כיבה (showCard/showArrived) יורדות מהבורר עצמו
  // ולא רק מהטבלה — אחרת המשתמש מסמן עמודה ושום דבר לא קורה.
  const colFilter = useCallback((c: ColDef<ColKey>) => {
    if ((c.key === 'arrived' || c.key === 'amount') && !showArrived) return false
    if ((c.key === 'loadStatus' || c.key === 'loadDate' || c.key === 'cardLink') && !showCard) return false
    return true
  }, [showArrived, showCard])

  // extraCols: 1 — עמודת הפעולות קבועה ואינה בבורר, אך נספרת לגרירה.
  const tc = useTableColumns<ColKey>('maternity', COLUMNS, { filter: colFilter, extraCols: 1 })

  // תוכן התא לפי מפתח העמודה
  const cell = (key: ColKey, aid: MaternityAid, m?: MotherRef) => {
    switch (key) {
      case 'mother': return (
        <span className="inline-flex items-center gap-1.5 flex-wrap font-medium text-slate-800">
          {motherName(m)}
          {/* 🔴 תווית מהבהבת: היולדת השיבה לבירור והתיק חזר לטיפולנו.
              בלעדיה השורה נראית ברשימה בדיוק כמו תיק שממתינים *לה*,
              בזמן שהיא דורשת טיפול מיידי. */}
          {returnedFromInquiry(aid as BucketAid) && (
            <span title="היולדת השיבה לבירור — התיק ממתין לטיפולכם"
              className="animate-returned-pulse inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              <MessageSquare size={10} className="flex-shrink-0" />
              חזר מבירור
            </span>
          )}
          {/* ⚠️ גם ליד השם וגם בעמודה: מי שכיבה את העמודה עדיין צריך
              לדעת שהיולדת אינה צאצא רגיל. */}
          <ApprovalLabelTag label={approvalLabelOf(m)} size="xs" />
        </span>
      )
      case 'wifeId': return <span className="ltr-num text-xs font-mono text-slate-600">{m?.spouse_id_number ?? '—'}</span>
      case 'approval_label': {
        const lbl = approvalLabelOf(m)
        return lbl ? <ApprovalLabelTag label={lbl} size="xs" /> : <span className="text-slate-300">—</span>
      }
      case 'baby': return (
        <span className="inline-flex items-center gap-1.5 flex-wrap text-slate-700">
          {(() => {
            const nm = babyNameLabel(aid as AidNameFields)
            if (nm.missing) return <span className="text-slate-300">—</span>
            return nm.pending
              ? <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">⏳ {nm.text}</span>
              : <span>{nm.text}</span>
          })()}
          {aid.is_twins && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700" title="לידת תאומים"><Baby size={10} /> תאומים</span>}
        </span>
      )
      case 'benefit': {
        const wc = aid.wants_food_card !== false
        const wr = aid.wants_recovery !== false
        const label = wc && wr ? 'כרטיס + הבראה' : wc ? 'כרטיס בלבד' : wr ? 'בית החלמה בלבד' : '—'
        const cls = wc && wr ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        return <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`} title="הטבות שהיולדת ביקשה">{label}</span>
      }
      case 'babyId': return <span className="ltr-num text-xs font-mono text-slate-600">{aid.baby_id_number ?? '—'}</span>
      case 'birth': return <span className="ltr-num text-slate-600">{formatDate(aid.birth_date)}</span>
      case 'recovery': return <span className="text-slate-600">{aid.recovery_home ?? '—'}</span>
      case 'days': return <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-sky-100 text-sky-800" title="ימי זכאות בבית ההחלמה">{recoveryDaysOf(aid)}</span>
      case 'arrived':
        return aid.recovery_arrived === true
          ? <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800">הגיעה</span>
          : aid.recovery_arrived === false
            ? <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-800">לא הגיעה</span>
            : <span className="text-slate-300">—</span>
      case 'amount':
        return aid.recovery_amount != null ? (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-emerald-700">₪{Number(aid.recovery_amount).toLocaleString('he-IL')}</span>
            {aid.recovery_amount_status === 'rejected'
              ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">נדחה</span>
              : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{aid.recovery_amount_status === 'approved' ? 'אושר' : 'מומש'}</span>}
          </span>
        ) : <span className="text-slate-300">—</span>
      case 'cert':
        return aid.birth_certificate_url ? (
          <span className="inline-flex items-center gap-1" title="צפייה באישור הלידה" onClick={e => e.stopPropagation()}>
            {/* אייקונים קומפקטיים (בלי טקסט) — נשארים בשורה אחת בעמודה צרה */}
            <ViewDocButton url={aid.birth_certificate_url}
              className="inline-flex items-center justify-center w-7 h-7 text-indigo-600 hover:text-indigo-700 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors">
              <FileText size={14} />
            </ViewDocButton>
            <DownloadDocButton url={aid.birth_certificate_url} docType="אישור לידה" person={motherName(m)} name={aid.birth_certificate_url} variant="icon" />
          </span>
        ) : <span className="text-slate-300">—</span>
      case 'source': {
        const src = (aid as { source?: string | null }).source
        if (src === 'portal') return <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">האתר</span>
        if (src === 'email') return <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">מייל</span>
        if (src === 'admin') return <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">הזנה ידנית</span>
        return <span className="text-[11px] text-slate-400">—</span>
      }
      case 'loadStatus': {
        // ⚠️ "נטען" אמיתי = יש card_tlush_id, שהוא ה-ID שנדרים החזיר
        // בתגובה ל-AddTlush מוצלח (lib/nedarim.ts addTlush). הוא נכתב
        // רק אחרי אישור נדרים, ולכן הוא ההוכחה שהכסף אכן הוטען שם.
        // מציגים את הסכום שנטען בפועל (card_load_amount).
        if (aid.card_tlush_id) {
          const amt = Number(aid.card_load_amount ?? 0)
          return <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800" title={`מזהה טעינה בנדרים: ${aid.card_tlush_id}`}>
            {amt > 0 ? `נטען ₪${amt.toLocaleString('he-IL')}` : 'נטען'}
          </span>
        }
        const pill = CARD_STATUS_PILL[aid.card_status ?? 'pending'] ?? CARD_STATUS_PILL.pending
        return <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${pill.cls}`}>{pill.label}</span>
      }
      case 'loadDate':
        // תאריך ושעת הטעינה בפועל — נכתב יחד עם אישור נדרים (card_loaded_at).
        // מוצג רק כשהטעינה אומתה (card_tlush_id), אחרת "—".
        return aid.card_tlush_id && aid.card_loaded_at
          ? <span className="ltr-num text-xs text-slate-600">{format(new Date(aid.card_loaded_at), 'dd/MM/yy', { locale: he })}<br />{format(new Date(aid.card_loaded_at), 'HH:mm', { locale: he })}</span>
          : <span className="text-slate-300">—</span>
      case 'cardLink':
        // שיוך כרטיס בפועל — נקבע רק כשהמשפחה חיברה כרטיס בשיחת ימות (card_picked_up_at)
        return aid.card_picked_up_at ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800"><Check size={12} /> שויך</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500"><X size={12} /> לא שויך</span>
        )
      case 'status': return <span onClick={e => e.stopPropagation()}><StatusControl aid={aid} /></span>
    }
  }

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
        {/* בורר העמודות — מעל הטבלה */}
        <div className="px-5 py-3 border-b border-slate-100">
          {tc.picker}
        </div>
        <div className="w-full">
          {/* ⚠️ בלי overflow-x — הכלל: אין גלילה לרוחב בשום טבלה. הרוחב מחולק
              בין העמודות המוצגות, והטקסט גולש לשורה נוספת במקום להיחתך. */}
          <table className="w-full text-sm text-right" style={tc.rt.tableStyle}>
            <colgroup>{tc.rt.cols}</colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 [&>th]:px-2 [&>th]:py-3.5 [&>th]:text-xs [&>th]:font-semibold [&>th]:text-slate-500 [&>th]:align-middle [&>th]:leading-tight">
                {tc.shown.map((c, i) => (
                  <th key={c.key} className={tc.headClass(c)}>{c.label}{tc.rt.handle(i)}</th>
                ))}
                <th className="relative text-center">פעולות{tc.rt.handle(tc.shown.length)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length === 0 ? (
                <tr><td colSpan={tc.shown.length + 1} className="px-4 py-12 text-center text-slate-400">{emptyMessage ?? 'לא נמצאו לידות בסינון זה'}</td></tr>
              ) : visibleRows.map(aid => {
                const m = aid.beneficiary as MotherRef | undefined
                return (
                  // ⚠️ הלשונית נוסעת בכתובת. בלעדיה הכרטסת אינה יודעת באיזו
                  // רשימה המזכירות עובדת, ו"הבאה" חוזרת לרוץ על כל הטבלה.
                  // הסינון אינו נשמר בכתובת של הרשימה עצמה, ולכן הקישור הוא
                  // המקום היחיד שבו הוא עובר הלאה.
                  <tr key={aid.id}
                    onClick={() => router.push(`/admin/maternity/${aid.id}?st=${filter}`)}
                    className="hover:bg-indigo-50/50 cursor-pointer transition-colors [&>td]:px-2 [&>td]:py-3">
                    {tc.shown.map(c => (
                      <td key={c.key} className={tc.cellClass(c)}>{cell(c.key, aid, m)}</td>
                    ))}
                    <td className="align-top text-center" onClick={e => e.stopPropagation()}>
                      {/* אייקונים קומפקטיים בשורה אחת — עמודה צרה, בלי עומס.
                          ⚠️ flex-nowrap + flex-shrink-0: בלעדיהם הכפתורים ירדו
                          שורה או נדחסו כשהעמודה מצטמצמת. */}
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
