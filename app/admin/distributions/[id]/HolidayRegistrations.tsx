'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Download, Loader2, Users, Wallet, Monitor, Phone, Mail, Pencil, CreditCard, Check, X, ShieldCheck, Send } from 'lucide-react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { useToast } from '@/components/ui/Toast'
import { useCan } from '@/components/StaffPermissions'
import { SOURCE_LABEL, type RegisterSource } from '@/lib/distributionSources'
import type { ApprovalStatus } from '@/lib/holidayCards'

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
  id_number: string | null
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

const fmtDateTime = (d?: string | null) => d ? format(new Date(d), 'dd/MM/yy HH:mm', { locale: he }) : '—'
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
  const [ageBucket, setAgeBucket] = useState<string>('all')
  const [kidsBucket, setKidsBucket] = useState<string>('all')
  const [approval, setApproval] = useState<ApprovalStatus | 'all'>('all')
  const [toggling, setToggling] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // ── פילוחים — מחושבים מהנתונים בזמן אמת, בלי סיכומים שמורים ──
  const bySource = useMemo(() => {
    const m: Record<string, number> = { portal: 0, phone: 0, email: 0, nedarim: 0, admin: 0 }
    rows.forEach(r => { m[r.source] = (m[r.source] ?? 0) + 1 })
    return m
  }, [rows])

  const communities = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach(r => { const c = r.community?.trim() || 'לא צוין'; m.set(c, (m.get(c) ?? 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  const ageCounts = useMemo(
    () => AGE_BUCKETS.map(b => ({ ...b, count: rows.filter(r => b.test(r.age)).length })),
    [rows],
  )
  const kidsCounts = useMemo(
    () => KIDS_BUCKETS.map(b => ({ ...b, count: rows.filter(r => b.test(r.children_count)).length })),
    [rows],
  )

  // ⚠️ נגזר מהשורות בכל טעינה: הכרטיסים האלה הם מה שהמנהל בודק לפניהם ("כמה
  // ממתינים לאישור", "כמה מאושרים כבר שייכו כרטיס"), ומונה שמור היה מתיישן.
  const approvalCounts = useMemo(() => {
    const m: Record<ApprovalStatus, number> = { pending: 0, approved: 0, rejected: 0 }
    rows.forEach(r => { m[r.approval_status] = (m[r.approval_status] ?? 0) + 1 })
    return m
  }, [rows])
  const cardsLinked = useMemo(() => rows.filter(r => r.card_linked_at).length, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(r => {
      if (source !== 'all' && r.source !== source) return false
      if (approval !== 'all' && r.approval_status !== approval) return false
      if (community !== 'all' && (r.community?.trim() || 'לא צוין') !== community) return false
      if (ageBucket !== 'all' && !AGE_BUCKETS.find(b => b.key === ageBucket)?.test(r.age)) return false
      if (kidsBucket !== 'all' && !KIDS_BUCKETS.find(b => b.key === kidsBucket)?.test(r.children_count)) return false
      if (!q) return true
      return [r.name, r.id_number, r.spouse_name, r.ben_phone, r.phone, r.email, r.address, r.city, r.community]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [rows, query, source, community, ageBucket, kidsBucket, approval])

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

  const exportCsv = () => {
    const head = ['שם', 'ת"ז', 'בן/בת זוג', 'טלפון', 'מייל', 'כתובת', 'עיר', 'קהילה', 'גיל', 'ילדים', 'ערוץ', 'תאריך רישום', 'סכום מתוכנן', 'אישור', 'מספר כרטיס', 'שויך בתאריך']
    const lines = filtered.map(r => [
      r.name, r.id_number ?? '', r.spouse_name ?? '', r.ben_phone ?? r.phone ?? '', r.email ?? '',
      r.address ?? '', r.city ?? '', r.community ?? '', r.age ?? '', r.children_count ?? '',
      SOURCE_LABEL[r.source], fmtDateTime(r.registered_at), amountPerFamily || '',
      APPROVAL_LABEL[r.approval_status], r.card_number ?? '', fmtDateTime(r.card_linked_at),
    ])
    const csv = [head, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${distributionName || 'חלוקה'} — נרשמים.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`

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
        {/* ── אישורים וכרטיסים — המסלול שאחרי הרישום ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-slate-500 mb-2"><ShieldCheck size={16} /><span className="text-xs font-bold">אישורים וכרטיסים</span></div>
          <div className="flex flex-col gap-1 text-[12.5px]">
            <div className="flex items-center justify-between">
              <span className="text-amber-800">ממתינים לאישור</span>
              <span className="font-extrabold text-amber-900 ltr-num">{approvalCounts.pending}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-green-800">מאושרים</span>
              <span className="font-extrabold text-green-900 ltr-num">{approvalCounts.approved}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-rose-800">נדחו</span>
              <span className="font-extrabold text-rose-900 ltr-num">{approvalCounts.rejected}</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1">
              <span className="text-slate-600">כרטיסים ששויכו</span>
              <span className="font-extrabold text-slate-800 ltr-num">{cardsLinked} / {approvalCounts.approved}</span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold text-slate-500 mb-2">פילוח לפי ערוץ</p>
          <div className="flex flex-col gap-1">
            {(['phone', 'portal', 'email', 'admin'] as RegisterSource[]).map(s => {
              const I = SOURCE_ICON[s]
              return (
                <div key={s} className="flex items-center justify-between text-[12.5px]">
                  <span className="flex items-center gap-1.5 text-slate-600"><I size={13} />{SOURCE_LABEL[s]}</span>
                  <span className="font-extrabold text-slate-800 ltr-num">{bySource[s] ?? 0}</span>
                </div>
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

      {/* ── פילוחים לחיצים ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 w-16">ערוץ:</span>
          <button className={chip(source === 'all')} onClick={() => setSource('all')}>הכל</button>
          {(['phone', 'portal', 'email', 'admin'] as RegisterSource[]).map(s => (
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 w-16">קהילה:</span>
          <button className={chip(community === 'all')} onClick={() => setCommunity('all')}>הכל</button>
          {communities.map(([c, n]) => (
            <button key={c} className={chip(community === c)} onClick={() => setCommunity(c)}>{c} ({n})</button>
          ))}
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
        {canEdit && approvalCounts.approved > 0 && (
          <button type="button" disabled={notifying} onClick={() => void notify([])}
            title="מייל וצינתוק לכל מי שאושר וטרם קיבל הודעה"
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
            {notifying ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            הודעת אישור לכל המאושרים
          </button>
        )}
        <button type="button" onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700">
          <Download size={14} /> ייצוא לאקסל
        </button>
      </div>

      {/* ── פעולה מרוכזת על המסומנים ── */}
      {canEdit && selected.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3">
          <span className="text-[13px] font-bold text-indigo-900">סומנו {selected.size}</span>
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

      {/* ── טבלת הנרשמים ──
          ⚠️ 17 עמודות — עם whitespace-nowrap הטבלה נחתכה וחייבה גלילה צדדית.
          עכשיו: פונט קומפקטי, padding מצומצם, ועמודות ארוכות (כתובת/מייל) שוברות
          שורה במקום לדחוף את השאר. table-fixed מונע חפיפה בין עמודות. */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] table-fixed">
            {/* רוחב יחסי לכל עמודה — כדי ש-table-fixed יחלק הגיונית: קצרות (גיל,
                ילדים, אישור) צרות, ארוכות (שם, כתובת, מייל) רחבות. */}
            <colgroup>
              {canEdit && <col className="w-[2.5%]" />}
              <col className="w-[9%]" />{/* שם */}
              <col className="w-[6.5%]" />{/* ת"ז */}
              <col className="w-[6%]" />{/* אישור */}
              <col className="w-[6%]" />{/* כרטיס */}
              <col className="w-[7%]" />{/* בן/בת */}
              <col className="w-[6.5%]" />{/* טלפון */}
              <col className="w-[9%]" />{/* מייל */}
              <col className="w-[9%]" />{/* כתובת */}
              <col className="w-[5%]" />{/* עיר */}
              <col className="w-[6%]" />{/* קהילה */}
              <col className="w-[3.5%]" />{/* גיל */}
              <col className="w-[3.5%]" />{/* ילדים */}
              <col className="w-[6%]" />{/* ערוץ */}
              <col className="w-[7%]" />{/* תאריך */}
              <col className="w-[5%]" />{/* סכום */}
              <col className="w-[5%]" />{/* הודעה */}
            </colgroup>
            <thead className="bg-slate-50 text-slate-500">
              <tr className="[&>th]:px-2 [&>th]:py-2.5 [&>th]:font-bold [&>th]:text-right [&>th]:border-l [&>th]:border-slate-200 [&>th:last-child]:border-l-0 [&>th]:align-top">
                {canEdit && (
                  <th className="w-8">
                    <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown}
                      className="h-4 w-4 accent-indigo-600" aria-label="סימון כל המוצגים" />
                  </th>
                )}
                <th>שם המשפחה</th><th>ת״ז</th><th>אישור הבקשה</th><th>כרטיס</th>
                <th>בן/בת זוג</th><th>טלפון</th><th>מייל</th>
                <th>כתובת</th><th>עיר</th><th>קהילה</th><th>גיל</th><th>ילדים</th>
                <th>ערוץ</th><th>תאריך רישום</th><th>סכום</th><th>הודעה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={canEdit ? 17 : 16} className="px-4 py-14 text-center text-slate-400 font-medium">
                  {rows.length ? 'אין נרשמים שמתאימים לסינון' : 'עדיין לא נרשמו משפחות לחלוקה זו'}
                </td></tr>
              ) : filtered.map(r => {
                const I = SOURCE_ICON[r.source]
                return (
                  <tr key={r.id} className="hover:bg-indigo-50/40 align-top [&>td]:px-2 [&>td]:py-2 [&>td]:border-l [&>td]:border-slate-100 [&>td:last-child]:border-l-0 [&>td]:break-words [&>td]:whitespace-normal [&_span.ltr-num]:!whitespace-normal [&_span.ltr-num]:break-words">
                    {canEdit && (
                      <td>
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)}
                          className="h-4 w-4 accent-indigo-600" aria-label={`סימון ${r.name}`} />
                      </td>
                    )}
                    <td className="font-semibold text-slate-800">
                      {r.beneficiary_id
                        ? <Link href={`/admin/beneficiaries/${r.beneficiary_id}`} className="hover:text-indigo-700 hover:underline">{r.name}</Link>
                        : r.name}
                    </td>
                    <td className="font-mono text-slate-600"><span className="ltr-num">{r.id_number ?? '—'}</span></td>
                    {/* ── אישור הבקשה — הפעולה שפותחת את שיוך הכרטיס ── */}
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${APPROVAL_STYLE[r.approval_status]}`}>
                          {APPROVAL_LABEL[r.approval_status]}
                        </span>
                        {canEdit && (
                          busyId === r.id
                            ? <Loader2 size={13} className="animate-spin text-slate-400" />
                            : <>
                                {r.approval_status !== 'approved' && (
                                  <button type="button" title="אישור הבקשה" onClick={() => void setApprovalFor([r.id], 'approved')}
                                    className="rounded-lg p-1 text-green-700 hover:bg-green-50"><Check size={14} /></button>
                                )}
                                {r.approval_status !== 'rejected' && (
                                  <button type="button" title="דחיית הבקשה" onClick={() => void setApprovalFor([r.id], 'rejected')}
                                    className="rounded-lg p-1 text-rose-600 hover:bg-rose-50"><X size={14} /></button>
                                )}
                              </>
                        )}
                      </div>
                    </td>
                    {/* ── מספר הכרטיס ששויך (בטלפון או בממשק) ── */}
                    <td>
                      {r.card_linked_at ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[12px] text-slate-700 ltr-num">{r.card_number}</span>
                          <span className="text-[11px] font-bold text-green-700">✓</span>
                          {canEdit && (busyId === r.id
                            ? <Loader2 size={12} className="animate-spin text-slate-400" />
                            : <button type="button" title="ניקוי השיוך כדי לאפשר כרטיס אחר" onClick={() => void clearCard(r.id)}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><X size={12} /></button>)}
                        </div>
                      ) : r.card_link_error ? (
                        <span className="text-[11px] font-bold text-rose-700" title={r.card_link_error}>נכשל</span>
                      ) : (
                        <span className="text-[11px] text-slate-400">{r.approval_status === 'approved' ? 'ממתין לשיוך' : '—'}</span>
                      )}
                    </td>
                    <td className="text-slate-600">{r.spouse_name ?? '—'}</td>
                    <td className="font-mono text-slate-600"><span className="ltr-num">{r.ben_phone ?? r.phone ?? '—'}</span></td>
                    <td className="text-slate-600">{r.email ?? '—'}</td>
                    <td className="text-slate-600">{r.address ?? '—'}</td>
                    <td className="text-slate-600">{r.city ?? '—'}</td>
                    <td className="text-slate-600">{r.community ?? '—'}</td>
                    <td className="text-slate-600 ltr-num">{r.age ?? '—'}</td>
                    <td className="text-slate-600 ltr-num">{r.children_count ?? '—'}</td>
                    <td>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        <I size={11} /> {SOURCE_LABEL[r.source]}
                      </span>
                    </td>
                    <td className="text-slate-500 ltr-num">{fmtDateTime(r.registered_at)}</td>
                    <td className="font-bold text-emerald-700 ltr-num">{amountPerFamily ? fmtCur(amountPerFamily) : '—'}</td>
                    {/* ⚠️ "נשלח" לצד שגיאה אינו סתירה: מייל עבר וצינתוק נכשל הוא
                        מצב שכיח, והצוות צריך לראות שערוץ אחד לא הגיע. */}
                    <td>
                      {r.notified_at ? (
                        <span className="text-[11px] font-bold text-green-700" title={fmtDateTime(r.notified_at)}>
                          ✓ נשלח{r.notify_error ? <span className="text-amber-700" title={r.notify_error}> ⚠</span> : null}
                        </span>
                      ) : r.notify_error ? (
                        <span className="text-[11px] font-bold text-rose-700" title={r.notify_error}>נכשל</span>
                      ) : (
                        <span className="text-[11px] font-bold text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
