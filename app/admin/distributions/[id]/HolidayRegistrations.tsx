'use client'
import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Download, Loader2, Users, Wallet, Monitor, Phone, Mail, Pencil, CreditCard, Check, X, ShieldCheck, Send } from 'lucide-react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { useToast } from '@/components/ui/Toast'
import { useCan } from '@/components/StaffPermissions'
import { SOURCE_LABEL, type RegisterSource } from '@/lib/distributionSources'
import { downloadXlsx, type XlsxColumn } from '@/lib/downloadXlsx'
import type { ApprovalStatus } from '@/lib/holidayCards'
import HolidayRecipientsTable, { type HolidayRow } from './HolidayRecipientsTable'
import type { ApprovalLabel } from '@/types'
import AddRecipientDialog from './AddRecipientDialog'
import Pagination from '@/components/ui/Pagination'
import CityBreakdown from './CityBreakdown'

export interface RegistrationRow {
  id: string
  source: RegisterSource
  registered_at: string | null
  phone: string | null
  notified_at: string | null
  notify_error: string | null
  amount: number | null
  beneficiary_id: string | null
  approval_status: ApprovalStatus
  approved_at: string | null
  card_number: string | null
  card_linked_at: string | null
  card_link_error: string | null
  name: string
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
  community: string | null
  children_count: number | null
  age: number | null
}

// ⚠️ האישור אינו קוסמטי: הוא מה שפותח את שיוך הכרטיס בשלוחה הטלפונית ובממשק.
// לכן הוא מוצג כעמודה ראשית עם פעולה ישירה, ולא מוסתר במסך עריכה נפרד.
const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: 'ממתין לאישור', approved: 'מאושר', rejected: 'נדחה',
}
const APPROVAL_STYLE: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-green-50 text-green-800 border-green-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
}

// ⚠️ כולל שניות — לראות את הרגע המדויק של הרישום (חשוב בשחרור המוני).
const fmtDateTime = (d?: string | null) => d ? format(new Date(d), 'dd/MM/yy HH:mm:ss', { locale: he }) : '—'
// סמל השקל אחרי המספר — כך קוראים אותו בעברית ("500 ₪")
const fmtCur = (n: number) => `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n)} ₪`

// ⚠️ טווחי הגיל ומספר הילדים הם *פילוח* ולא סינון של הנתונים: הכרטיסים
// מסננים את הטבלה, כדי שאפשר יהיה לענות מיד על "כמה משפחות עם 6 ילדים ומעלה".
const AGE_BUCKETS: { key: string; label: string; test: (a: number | null) => boolean }[] = [
  { key: 'u30', label: 'עד 30', test: a => a != null && a < 30 },
  { key: '30-39', label: '30–39', test: a => a != null && a >= 30 && a < 40 },
  { key: '40-49', label: '40–49', test: a => a != null && a >= 40 && a < 50 },
  { key: '50+', label: '50 ומעלה', test: a => a != null && a >= 50 },
  { key: 'unknown', label: 'לא ידוע', test: a => a == null },
]
const KIDS_BUCKETS: { key: string; label: string; test: (n: number | null) => boolean }[] = [
  { key: '0-2', label: '0–2 ילדים', test: n => (n ?? 0) <= 2 },
  { key: '3-5', label: '3–5 ילדים', test: n => (n ?? 0) >= 3 && (n ?? 0) <= 5 },
  { key: '6-8', label: '6–8 ילדים', test: n => (n ?? 0) >= 6 && (n ?? 0) <= 8 },
  { key: '9+', label: '9 ילדים ומעלה', test: n => (n ?? 0) >= 9 },
]

const SOURCE_ICON: Record<RegisterSource, typeof Monitor> = {
  portal: Monitor, phone: Phone, email: Mail, nedarim: CreditCard, admin: Pencil,
}

// ⚠️ מקור אמת אחד לסדר הערוצים — גם לכרטיס הפילוח וגם לצ'יפים של הסינון.
// היו שתי רשימות נפרדות, והן נפרדו: nedarim תוקן בכרטיס התצוגה ונשכח בסינון,
// כך שאי אפשר היה לסנן דווקא לערוץ שדרכו מגיע רוב הרישום המאסיבי.
const SOURCE_ORDER: RegisterSource[] = ['phone', 'portal', 'nedarim', 'email', 'admin']

export default function HolidayRegistrations({
  distributionId, rows, amountPerFamily, registrationOpen, distributionName,
}: {
  distributionId: string
  rows: RegistrationRow[]
  amountPerFamily: number
  registrationOpen: boolean
  distributionName: string
}) {
  const router = useRouter()
  const toast = useToast()
  const canEdit = useCan('distributions', 'edit')
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<RegisterSource | 'all'>('all')
  const [community, setCommunity] = useState<string>('all')
  const [communityOpen, setCommunityOpen] = useState(false)   // פילטר קהילה מכווץ כברירת מחדל
  const [ageBucket, setAgeBucket] = useState<string>('all')
  const [kidsBucket, setKidsBucket] = useState<string>('all')
  const [approval, setApproval] = useState<ApprovalStatus | 'all'>('all')
  const [city, setCity] = useState<string>('all')
  const [cityOpen, setCityOpen] = useState(false)   // רשימת הערים מכווצת כברירת מחדל
  // ⚡ דפדוף אמיתי: 50 שורות כברירת מחדל במקום כל ~6,000 בבת אחת.
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [toggling, setToggling] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // ── פילוחים — מחושבים מהנתונים בזמן אמת, בלי סיכומים שמורים ──
  //
  // ⚡ כל הפילוחים נגזרים במעבר *אחד* על השורות ולא במעבר לכל כרטיס.
  //
  // ⚠️ למה זה משנה: בחלוקה עם ~6,000 נרשמים, החישוב הקודם עבר על הרשימה
  // 12 פעמים (ערוץ, קהילה, 5 טווחי גיל, 4 טווחי ילדים, אישורים, כרטיסים) —
  // כ-70,000 בדיקות בכל רינדור, וכל הקלדה בתיבת החיפוש הפעילה אותן מחדש.
  // מעבר אחד מייצר את אותם מספרים בדיוק.
  const facets = useMemo(() => {
    const bySource: Record<string, number> = { portal: 0, phone: 0, email: 0, nedarim: 0, admin: 0 }
    const communityMap = new Map<string, number>()
    const cityMap = new Map<string, number>()
    const age: Record<string, number> = {}
    const kids: Record<string, number> = {}
    const approval: Record<ApprovalStatus, number> = { pending: 0, approved: 0, rejected: 0 }
    let cardsLinked = 0
    // מי כבר רשום — לסימון בדיאלוג ההוספה הידנית.
    // ⚠️ נאסף במעבר המשותף ולא בלולאה נפרדת: זה בדיוק המעבר שהוקם כדי
    // להימנע מ-12 סריקות של ~6,000 שורות בכל רינדור.
    const registered = new Set<string>()

    for (const r of rows) {
      bySource[r.source] = (bySource[r.source] ?? 0) + 1
      if (r.beneficiary_id) registered.add(String(r.beneficiary_id))
      const c = r.community?.trim() || 'לא צוין'
      communityMap.set(c, (communityMap.get(c) ?? 0) + 1)
      // ⚠️ נאסף באותו מעבר יחיד — ראה ההערה למעלה.
      const ct = r.city?.trim() || 'לא צוין'
      cityMap.set(ct, (cityMap.get(ct) ?? 0) + 1)
      // ⚠️ הדלי הראשון שמתאים בלבד — הטווחים זרים זה לזה, ולכן אין טעם
      // להמשיך לבדוק את השאר.
      for (const b of AGE_BUCKETS) if (b.test(r.age)) { age[b.key] = (age[b.key] ?? 0) + 1; break }
      for (const b of KIDS_BUCKETS) if (b.test(r.children_count)) { kids[b.key] = (kids[b.key] ?? 0) + 1; break }
      approval[r.approval_status] = (approval[r.approval_status] ?? 0) + 1
      if (r.card_linked_at) cardsLinked++
    }

    return {
      bySource,
      communities: [...communityMap.entries()].sort((a, b) => b[1] - a[1]),
      // ממוין מהגבוה לנמוך — משמש גם לפילטר וגם לגרף הפילוח.
      cities: [...cityMap.entries()].sort((a, b) => b[1] - a[1]),
      ageCounts: AGE_BUCKETS.map(b => ({ ...b, count: age[b.key] ?? 0 })),
      kidsCounts: KIDS_BUCKETS.map(b => ({ ...b, count: kids[b.key] ?? 0 })),
      approval,
      cardsLinked,
      registered,
    }
  }, [rows])

  const { bySource, communities, cities, ageCounts, kidsCounts } = facets
  const registeredIds = facets.registered

  // ⚠️ נגזר מהשורות בכל טעינה: הכרטיסים האלה הם מה שהמנהל בודק לפניהם ("כמה
  // ממתינים לאישור", "כמה מאושרים כבר שייכו כרטיס"), ומונה שמור היה מתיישן.
  // (מחושבים במעבר המשותף למעלה — ראו facets.)
  const approvalCounts = facets.approval
  const cardsLinked = facets.cardsLinked

  // ⚡ טקסט החיפוש של כל שורה נבנה פעם אחת ולא בכל הקלדה.
  //
  // ⚠️ קודם כל הקלדה בנתה מחדש מחרוזת מ-9 שדות עבור כל אחת מ-~6,000 השורות
  // (join + toLowerCase), וזה מה שגרם לתיבת החיפוש להרגיש תקועה. עכשיו זה
  // נגזר פעם אחת מהשורות, והחיפוש עצמו הוא includes בלבד.
  const haystacks = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) {
      m.set(r.id, [r.name, r.id_number, r.spouse_name, r.ben_phone, r.phone, r.email, r.address, r.city, r.community]
        .filter(Boolean).join(' ').toLowerCase())
    }
    return m
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    // ⚠️ נבדק פעם אחת מחוץ ללולאה: find() בתוך הלולאה חזר על עצמו לכל שורה.
    const ageTest = ageBucket === 'all' ? null : AGE_BUCKETS.find(b => b.key === ageBucket)?.test
    const kidsTest = kidsBucket === 'all' ? null : KIDS_BUCKETS.find(b => b.key === kidsBucket)?.test
    return rows.filter(r => {
      if (source !== 'all' && r.source !== source) return false
      if (approval !== 'all' && r.approval_status !== approval) return false
      if (community !== 'all' && (r.community?.trim() || 'לא צוין') !== community) return false
      if (city !== 'all' && (r.city?.trim() || 'לא צוין') !== city) return false
      if (ageTest && !ageTest(r.age)) return false
      if (kidsTest && !kidsTest(r.children_count)) return false
      if (!q) return true
      return (haystacks.get(r.id) ?? '').includes(q)
    })
  }, [rows, haystacks, query, source, community, city, ageBucket, kidsBucket, approval])

  // ⚡ הדף המוצג בפועל.
  //
  // 🔴 הסינון והחיפוש רצים על *כל* השורות (filtered למעלה), והחיתוך לעמוד
  // קורה רק אחריהם. כך תיבת החיפוש מחזירה תוצאה מכל ~6,000 הרשומות ולא
  // מתוך 50 המוצגות — זו הייתה דרישה מפורשת.
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  // ⚠️ עמוד מחוץ לטווח אחרי סינון (היינו בעמוד 40 ונשארו 3) — נצמד לאחרון.
  const safePage = Math.min(page, pageCount)
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  // ⚠️ חזרה לעמוד 1 בכל שינוי סינון/חיפוש: להישאר בעמוד 12 אחרי סינון
  // שהותיר 2 עמודים מציג מסך ריק שנראה כתקלה.
  useEffect(() => { setPage(1) }, [query, source, community, city, ageBucket, kidsBucket, approval, pageSize])

  // הצפי התקציבי — של מה שמסונן כרגע ושל הכל. כך גם "כמה יעלה פילוח מסוים".
  const expectedAll = rows.length * amountPerFamily
  const expectedFiltered = filtered.length * amountPerFamily

  const toggleRegistration = async () => {
    setToggling(true)
    try {
      const res = await fetch('/api/admin/distributions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: distributionId, registration_open: !registrationOpen }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'העדכון נכשל'); setToggling(false); return }
      toast.success(registrationOpen ? 'הרישום נסגר' : 'הרישום נפתח — הערוצים פעילים')
      router.refresh()
    } catch { toast.error('שגיאת רשת') }
    setToggling(false)
  }

  // אישור / דחייה — לשורה בודדת או לכל המסומנות. אותה קריאה בשני המקרים, כדי
  // שלא יהיו שני מסלולי עדכון שיכולים להיפרד זה מזה.
  const setApprovalFor = async (ids: string[], status: ApprovalStatus) => {
    if (!ids.length) return
    setBusyId(ids.length === 1 ? ids[0] : 'bulk')
    try {
      const res = await fetch('/api/admin/distributions/recipients', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, approval_status: status }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'העדכון נכשל'); setBusyId(null); return }
      toast.success(status === 'approved'
        ? `${ids.length} אושרו — הכרטיס נפתח לשיוך בטלפון ובממשק`
        : status === 'rejected' ? `${ids.length} נדחו` : `${ids.length} חזרו להמתנה`)
      setSelected(new Set())
      router.refresh()
    } catch { toast.error('שגיאת רשת') }
    setBusyId(null)
  }

  const clearCard = async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/distributions/recipients', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], clear_card: true }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'הניקוי נכשל'); setBusyId(null); return }
      toast.success('שיוך הכרטיס נוקה — המשפחה יכולה לשייך כרטיס מחדש')
      router.refresh()
    } catch { toast.error('שגיאת רשת') }
    setBusyId(null)
  }

  // שליחת הודעת האישור — מייל + צינתוק. בלי בחירה: כל המאושרים שטרם קיבלו.
  // ⚠️ הצינתוק אינו "תוספת" למייל: לחלק מהמשפחות אין מייל, ואצלן הוא הערוץ
  // היחיד. לכן שני הערוצים נשלחים יחד וכל אחד נכשל בנפרד.
  const [notifying, setNotifying] = useState(false)
  const notify = async (ids: string[]) => {
    setNotifying(true)
    try {
      const res = await fetch('/api/admin/distributions/recipients/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids.length ? { ids } : { distributionId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'השליחה נכשלה'); setNotifying(false); return }
      if (d.empty) toast.success('אין מאושרים שממתינים להודעה')
      else if (d.failed > 0) toast.error(`נשלחו ${d.sent} · נכשלו ${d.failed} — הסיבה מופיעה בעמודת ההודעה`)
      else toast.success(`נשלחה הודעת אישור ל-${d.sent}${d.skipped ? ` · ${d.skipped} דולגו` : ''}`)
      setSelected(new Set())
      router.refresh()
    } catch { toast.error('שגיאת רשת') }
    setNotifying(false)
  }

  const toggleRow = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const allShownSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id))
  const toggleAllShown = () => setSelected(prev => {
    const next = new Set(prev)
    if (allShownSelected) filtered.forEach(r => next.delete(r.id))
    else filtered.forEach(r => next.add(r.id))
    return next
  })

  // ⚠️ ת"ז/טלפון/מספר כרטיס מוגדרים 'id' (טקסט) ולא מספר: כמספר הם מאבדים
  // אפס מוביל ומקבלים פסיקי אלפים. גיל/ילדים/סכום הם מספרים אמיתיים, כדי
  // שאפשר יהיה לסכם ולמיין אותם באקסל.
  // ⚠️ שם משפחה ושם פרטי בעמודות נפרדות — מיון וסינון באקסל לפי שם משפחה
  // אינם אפשריים כשהשניים במחרוזת אחת.
  const XLSX_COLUMNS: XlsxColumn[] = [
    { header: 'שם משפחה' }, { header: 'שם פרטי' }, { header: 'ת"ז', kind: 'id' }, { header: 'בן/בת זוג' },
    { header: 'טלפון', kind: 'id' }, { header: 'מייל' }, { header: 'כתובת' }, { header: 'עיר' },
    { header: 'קהילה' }, { header: 'גיל', kind: 'number' }, { header: 'ילדים', kind: 'number' },
    { header: 'ערוץ' }, { header: 'תאריך רישום', kind: 'date' }, { header: 'סכום מתוכנן', kind: 'number' },
    { header: 'אישור' }, { header: 'מספר כרטיס', kind: 'id' }, { header: 'שויך בתאריך', kind: 'date' },
  ]

  const [exporting, setExporting] = useState(false)
  const exportExcel = async () => {
    setExporting(true)
    try {
      await downloadXlsx({
        filename: `${distributionName || 'חלוקה'} — נרשמים`,
        sheetName: 'נרשמים',
        columns: XLSX_COLUMNS,
        rows: filtered.map(r => [
          r.family_name || r.name, r.first_name || '', r.id_number, r.spouse_name, r.ben_phone ?? r.phone, r.email,
          r.address, r.city, r.community, r.age, r.children_count,
          SOURCE_LABEL[r.source], r.registered_at, amountPerFamily || null,
          APPROVAL_LABEL[r.approval_status], r.card_number, r.card_linked_at,
        ]),
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הייצוא נכשל')
    }
    setExporting(false)
  }

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`

  // שורת מונה לחיצה בכרטיסי הפילוח. הסימון הפעיל אינו קישוט: בלעדיו הלחיצה
  // מסננת טבלה שנמצאת הרחק למטה, והמסך נראה כאילו לא הגיב.
  const statRow = (active: boolean) =>
    `flex w-full items-center justify-between rounded-lg px-2 py-1 text-right transition-colors ${active ? 'bg-indigo-50 ring-1 ring-indigo-300' : 'hover:bg-slate-50'}`

  return (
    <div className="flex flex-col gap-5">
      {/* ── מונים חיים: נרשמים וצפי תקציבי ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-5">
          <div className="flex items-center gap-2 text-indigo-700 mb-1"><Users size={16} /><span className="text-xs font-bold">נרשמו</span></div>
          <p className="text-3xl font-extrabold text-indigo-900 ltr-num">{rows.length.toLocaleString('he-IL')}</p>
        </div>
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 text-emerald-700 mb-1"><Wallet size={16} /><span className="text-xs font-bold">צפי תקציבי</span></div>
          <p className="text-3xl font-extrabold text-emerald-900 ltr-num">{fmtCur(expectedAll)}</p>
          <p className="text-[11px] text-emerald-700 mt-1">{rows.length} × {fmtCur(amountPerFamily)} למשפחה</p>
        </div>
        {/* ── אישורים וכרטיסים — המסלול שאחרי הרישום ──
            ⚠️ השורות כאן לחיצות ומסננות את הטבלה, בדיוק כמו הצ'יפים שמתחת.
            כמספרים בלבד הן הזמינו לחיצה שלא עשתה כלום: המנהל רואה "ממתינים
            לאישור 47", לוחץ כדי לראות מי הם, ושום דבר לא קורה. */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-slate-500 mb-2"><ShieldCheck size={16} /><span className="text-xs font-bold">אישורים וכרטיסים</span></div>
          <div className="flex flex-col gap-1 text-[12.5px]">
            {([
              { k: 'pending' as const, label: 'ממתינים לאישור', text: 'text-amber-800', num: 'text-amber-900' },
              { k: 'approved' as const, label: 'מאושרים', text: 'text-green-800', num: 'text-green-900' },
              { k: 'rejected' as const, label: 'נדחו', text: 'text-rose-800', num: 'text-rose-900' },
            ]).map(r => (
              <button key={r.k} type="button" onClick={() => setApproval(a => (a === r.k ? 'all' : r.k))}
                title="לחצו כדי לסנן את הרשימה"
                className={statRow(approval === r.k)}>
                <span className={r.text}>{r.label}</span>
                <span className={`font-extrabold ltr-num ${r.num}`}>{approvalCounts[r.k]}</span>
              </button>
            ))}
            {/* כרטיסים ששויכו — תצוגה בלבד: אין לו פילטר מקביל בטבלה, ולעשות
                אותו לחיץ בלי שיסנן היה משחזר בדיוק את התקלה שתוקנה כאן. */}
            <div className="mt-1 flex items-center justify-between border-t border-slate-100 px-2 pt-1.5">
              <span className="text-slate-600">כרטיסים ששויכו</span>
              <span className="font-extrabold text-slate-800 ltr-num">{cardsLinked} / {approvalCounts.approved}</span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold text-slate-500 mb-2">פילוח לפי ערוץ</p>
          <div className="flex flex-col gap-1">
            {/* ⚠️ nedarim חייב להיכלל — רוב הרישום המאסיבי לחגים מגיע דרך טופס
                נדרים (matara.pro). בלעדיו הפילוח "בלע" את נרשמי נדרים בשקט
                (סכום הערוצים המוצגים נמוך בהרבה מסך "נרשמו"). */}
            {SOURCE_ORDER.map(s => {
              const I = SOURCE_ICON[s]
              return (
                <button key={s} type="button" onClick={() => setSource(c => (c === s ? 'all' : s))}
                  title="לחצו כדי לסנן את הרשימה"
                  className={`${statRow(source === s)} text-[12.5px]`}>
                  <span className="flex items-center gap-1.5 text-slate-600"><I size={13} />{SOURCE_LABEL[s]}</span>
                  <span className="font-extrabold text-slate-800 ltr-num">{bySource[s] ?? 0}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className={`rounded-2xl border-2 p-5 ${registrationOpen ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
          <p className="text-xs font-bold text-slate-500 mb-1">מצב הרישום</p>
          <p className={`text-lg font-extrabold ${registrationOpen ? 'text-green-700' : 'text-slate-600'}`}>
            {registrationOpen ? '🟢 פתוח לרישום' : '⚪ סגור'}
          </p>
          {canEdit && (
            <button type="button" onClick={toggleRegistration} disabled={toggling}
              className={`mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white transition ${registrationOpen ? 'bg-slate-600 hover:bg-slate-700' : 'bg-green-600 hover:bg-green-700'} disabled:opacity-50`}>
              {toggling && <Loader2 size={13} className="animate-spin" />}
              {registrationOpen ? 'סגור את הרישום' : 'פתח את הרישום'}
            </button>
          )}
        </div>
      </div>

      {/* ── פילוח לפי עיר ── */}
      <CityBreakdown cities={cities} selected={city} onSelect={setCity} />

      {/* ── פילוחים לחיצים ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 w-16">ערוץ:</span>
          <button className={chip(source === 'all')} onClick={() => setSource('all')}>הכל</button>
          {SOURCE_ORDER.map(s => (
            <button key={s} className={chip(source === s)} onClick={() => setSource(s)}>{SOURCE_LABEL[s]} ({bySource[s] ?? 0})</button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 w-16">אישור:</span>
          <button className={chip(approval === 'all')} onClick={() => setApproval('all')}>הכל</button>
          {(['pending', 'approved', 'rejected'] as ApprovalStatus[]).map(s => (
            <button key={s} className={chip(approval === s)} onClick={() => setApproval(s)}>
              {APPROVAL_LABEL[s]} ({approvalCounts[s]})
            </button>
          ))}
        </div>
        {/* ⚠️ קהילה — מכווץ כברירת מחדל (עשוי להכיל עשרות ערכים ברישום מאסיבי).
            לחיצה על הכותרת פותחת את רשימת הצ'יפים; כשמסונן, הבחירה מוצגת גם סגור. */}
        <div className="flex items-start gap-2 flex-wrap">
          <button type="button" onClick={() => setCommunityOpen(o => !o)}
            className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1 shrink-0 pt-1">
            קהילה{community !== 'all' ? `: ${community}` : ` (${communities.length})`} <span className="text-slate-400">{communityOpen ? '▲' : '▼'}</span>
          </button>
          {communityOpen ? (
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <button className={chip(community === 'all')} onClick={() => setCommunity('all')}>הכל</button>
              {communities.map(([c, n]) => (
                <button key={c} className={chip(community === c)} onClick={() => setCommunity(c)}>{c} ({n})</button>
              ))}
            </div>
          ) : community !== 'all' ? (
            <button className={chip(true)} onClick={() => setCommunity('all')}>{community} ✕</button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 w-16">גיל:</span>
          <button className={chip(ageBucket === 'all')} onClick={() => setAgeBucket('all')}>הכל</button>
          {ageCounts.map(b => (
            <button key={b.key} className={chip(ageBucket === b.key)} onClick={() => setAgeBucket(b.key)}>{b.label} ({b.count})</button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 w-16">ילדים:</span>
          <button className={chip(kidsBucket === 'all')} onClick={() => setKidsBucket('all')}>הכל</button>
          {kidsCounts.map(b => (
            <button key={b.key} className={chip(kidsBucket === b.key)} onClick={() => setKidsBucket(b.key)}>{b.label} ({b.count})</button>
          ))}
        </div>
      </div>

      {/* ── חיפוש + ייצוא + סיכום המסונן ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש בשם, ת״ז, טלפון, מייל, כתובת…"
            className="w-full pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <span className="text-xs font-bold text-slate-500">
          מוצגים {filtered.length.toLocaleString('he-IL')} · {fmtCur(expectedFiltered)}
        </span>
        {/* ⚠️ מוצג גם כשהרישום סגור — זו כל מטרתו: לצרף משפחה שלא נרשמה
            בזמן, בלי לפתוח מחדש את הרישום לכולם. */}
        {canEdit && (
          <AddRecipientDialog distributionId={distributionId} existingIds={registeredIds} />
        )}
        {canEdit && approvalCounts.approved > 0 && (
          <button type="button" disabled={notifying} onClick={() => void notify([])}
            title="מייל וצינתוק לכל מי שאושר וטרם קיבל הודעה"
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
            {notifying ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            הודעת אישור לכל המאושרים
          </button>
        )}
        <button type="button" onClick={() => void exportExcel()} disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} ייצוא לאקסל
        </button>
      </div>

      {/* ── פעולה מרוכזת על המסומנים ── */}
      {canEdit && selected.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3">
          <span className="text-[13px] font-bold text-indigo-900">{/* ⚠️ הסימון חוצה עמודים: "סימון הכל" מסמן את כל התוצאות המסוננות, לא רק את השורות שבעמוד הנוכחי. בלי לומר זאת, מונה של 800 מול 50 שורות על המסך נראה כתקלה. */}
            סומנו {selected.size}
            {selected.size > paged.length && (
              <span className="mr-1.5 font-medium text-indigo-600">(כולל עמודים אחרים)</span>
            )}
          </span>
          <button type="button" disabled={busyId === 'bulk'}
            onClick={() => void setApprovalFor([...selected], 'approved')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">
            {busyId === 'bulk' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} אישור הכל
          </button>
          <button type="button" disabled={busyId === 'bulk'}
            onClick={() => void setApprovalFor([...selected], 'rejected')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">
            <X size={13} /> דחיית הכל
          </button>
          <button type="button" disabled={notifying}
            onClick={() => void notify([...selected])}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
            {notifying ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} שליחת הודעת אישור
          </button>
          <button type="button" onClick={() => setSelected(new Set())}
            className="text-xs font-bold text-slate-500 hover:text-slate-700">ביטול הסימון</button>
          <span className="text-[11.5px] text-indigo-700">אישור פותח למשפחה את שיוך הכרטיס בשלוחה הטלפונית ובממשק</span>
        </div>
      )}

      {/* ── טבלת הנרשמים — קומפוננטה משותפת עם דף השיתוף (זהות מובטחת) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <HolidayRecipientsTable
          rows={paged}
          paginated
          amountPerFamily={amountPerFamily}
          fmtDateTime={fmtDateTime}
          fmtCur={fmtCur}
          controls={{
            canEdit, selected, toggleRow, allShownSelected, toggleAllShown,
            busyId, setApprovalFor, clearCard, showMessage: true,
          }}
        />
      </div>

      {/* ⚠️ הדפדוף היה מחושב אך לא מרונדר — הטבלה קיבלה את כל השורות.
          החיפוש והסינון רצים על המערך המלא (filtered) והחיתוך לעמוד
          קורה רק אחריהם, כך שתוצאה נמצאת מכל הרשומות ולא מתוך העמוד. */}
      <Pagination page={safePage} size={pageSize} total={filtered.length}
        onPage={setPage} onSize={setPageSize} />
    </div>
  )
}
