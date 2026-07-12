'use client'
import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, Check, X, Baby, Eye, Loader2, Search, FileText, Trash2 } from 'lucide-react'
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
import { recoveryDaysOf } from '@/lib/maternity'

const formatDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yy', { locale: he }) : '—'

// שם היולדת (האישה) = שם משפחה + spouse_name. נפילה לשם הרשומה אם חסר
const motherName = (m?: MotherRef) => {
  if (!m) return '—'
  if (m.spouse_name) return [m.family_name, m.spouse_name].filter(Boolean).join(' ')
  return [m.family_name, m.full_name].filter(Boolean).join(' ') || '—'
}

// ── Status filter buckets ──────────────────────────────────────────────────────
// ממתין=pending · מאושר=active · לא מאושר=cancelled
type Filter = 'all' | 'pending' | 'active' | 'cancelled'
const matchesFilter = (a: MaternityAid, f: Filter) => f === 'all' ? true : a.status === f

interface CardDef { key: Filter; label: string; icon: typeof Clock; base: string; active: string; iconCls: string }
const CARD_DEFS: CardDef[] = [
  { key: 'all', label: 'הכל', icon: Baby, base: 'border-slate-200 hover:border-slate-300', active: 'border-slate-400 ring-2 ring-slate-200 bg-slate-50', iconCls: 'bg-slate-100 text-slate-600' },
  { key: 'pending', label: 'ממתין לאישור', icon: Clock, base: 'border-amber-200 hover:border-amber-300', active: 'border-amber-400 ring-2 ring-amber-200 bg-amber-50', iconCls: 'bg-amber-100 text-amber-700' },
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
    <button onClick={handleDelete} disabled={deleting}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-white hover:bg-red-600 px-2.5 py-1.5 rounded-lg border border-red-200 hover:border-red-600 transition-colors disabled:opacity-50">
      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} מחיקה
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
    a.baby_name,
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

export default function MaternityTable({ data, showCard, showArrived, hideFilters, emptyMessage }: { data: MaternityAid[]; showCard?: boolean; showArrived?: boolean; hideFilters?: boolean; emptyMessage?: string }) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('newest')

  // רענון חי — כשבית ההחלמה מסמן הגעה/אי-הגעה, הממשק מתעדכן מיד (realtime) + גיבוי בפולינג
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel('maternity-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maternity_aids' }, () => router.refresh())
      .subscribe()
    // עדכון חי מתבצע דרך ה-realtime למעלה; ה-poll הוא רק גיבוי — בתדירות נמוכה
    // כדי לא להעמיס רענוני-עמוד ברקע שמאטים את התגובה ללחיצות.
    const poll = setInterval(() => router.refresh(), 60000)
    return () => { supabase.removeChannel(ch); clearInterval(poll) }
  }, [router])

  const counts = useMemo(() => ({
    all: data.length,
    pending: data.filter(a => a.status === 'pending').length,
    active: data.filter(a => a.status === 'active').length,
    cancelled: data.filter(a => a.status === 'cancelled').length,
  }), [data])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.filter(a =>
      matchesFilter(a, filter) && (q === '' || searchHaystack(a).includes(q))
    )
  }, [data, filter, query])

  const visible = useMemo(() =>
    applySortMode(filtered, sort,
      a => motherName(a.beneficiary as MotherRef | undefined),
      a => a.created_at,
    ), [filtered, sort])

  return (
    <div className="flex flex-col gap-5">
      {/* Filter cards */}
      {!hideFilters && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CARD_DEFS.map(c => {
          const Icon = c.icon
          const isActive = filter === c.key
          return (
            <button key={c.key}
              onClick={() => setFilter(isActive && c.key !== 'all' ? 'all' : c.key)}
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
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-700">רשימת לידות</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <SortButtons value={sort} onChange={setSort} />
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
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['שם היולדת', 'ת.ז. האישה', 'שם התינוק', 'ת.ז. התינוק', 'תאריך לידה', 'בית החלמה', 'ימי זכאות', ...(showArrived ? ['הגעה', 'סכום בית החלמה'] : []), 'אישור לידה', ...(showCard ? ['סטטוס כרטיס', 'שיוך כרטיס'] : []), 'סטטוס', 'פעולות'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-xs font-semibold text-slate-500 align-middle">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length === 0 ? (
                <tr><td colSpan={10 + (showCard ? 2 : 0) + (showArrived ? 2 : 0)} className="px-4 py-12 text-center text-slate-400">{emptyMessage ?? 'לא נמצאו לידות בסינון זה'}</td></tr>
              ) : visible.map(aid => {
                const m = aid.beneficiary as MotherRef | undefined
                return (
                  <tr key={aid.id}
                    onClick={() => router.push(`/admin/maternity/${aid.id}`)}
                    className="hover:bg-indigo-50/50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 align-middle font-medium text-slate-800">{motherName(m)}</td>
                    <td className="px-4 py-3 align-middle text-xs font-mono text-slate-600"><span className="ltr-num">{m?.spouse_id_number ?? '—'}</span></td>
                    <td className="px-4 py-3 align-middle text-slate-700">
                      <span className="inline-flex items-center gap-1.5">
                        {aid.baby_name ?? <span className="text-slate-300">—</span>}
                        {aid.is_twins && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700" title="לידת תאומים"><Baby size={10} /> תאומים</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-xs font-mono text-slate-600"><span className="ltr-num">{aid.baby_id_number ?? '—'}</span></td>
                    <td className="px-4 py-3 align-middle text-slate-600"><span className="ltr-num">{formatDate(aid.birth_date)}</span></td>
                    <td className="px-4 py-3 align-middle text-slate-600">{aid.recovery_home ?? '—'}</td>
                    <td className="px-4 py-3 align-middle">
                      <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-sky-100 text-sky-800" title="ימי זכאות בבית ההחלמה">{recoveryDaysOf(aid)}</span>
                    </td>
                    {showArrived && (
                      <td className="px-4 py-3 align-middle">
                        {aid.recovery_arrived === true
                          ? <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800">הגיעה</span>
                          : aid.recovery_arrived === false
                            ? <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-800">לא הגיעה</span>
                            : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    {showArrived && (
                      <td className="px-4 py-3 align-middle whitespace-nowrap">
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
                    <td className="px-4 py-3 align-middle">
                      {aid.birth_certificate_url ? (
                        <span className="inline-flex items-center gap-1.5">
                          <ViewDocButton url={aid.birth_certificate_url}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 px-2.5 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors">
                            <FileText size={14} /> צפייה
                          </ViewDocButton>
                          <DownloadDocButton url={aid.birth_certificate_url} docType="אישור לידה" person={motherName(m)} name={aid.birth_certificate_url} variant="icon" />
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {showCard && (
                      <td className="px-4 py-3 align-middle">
                        {(() => { const cs = aid.card_status ?? 'pending'; const m = CARD_STATUS_PILL[cs]; return <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${m.cls}`}>{m.label}</span> })()}
                      </td>
                    )}
                    {showCard && (
                      <td className="px-4 py-3 align-middle">
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
                    <td className="px-4 py-3 align-middle" onClick={e => e.stopPropagation()}><StatusControl aid={aid} /></td>
                    <td className="px-4 py-3 align-middle" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/maternity/${aid.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                          <Eye size={14} /> צפייה
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
      </div>
    </div>
  )
}
