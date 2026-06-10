'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, Check, X, Baby, Eye, ChevronDown, Loader2, Search, FileText, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { goToNextPending } from '@/lib/nextPending'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import type { MaternityAid, MaternityStatus } from '@/types'

const formatDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yy', { locale: he }) : '—'

type MotherRef = {
  id: string
  full_name?: string
  family_name?: string
  phone?: string
  spouse_name?: string
  spouse_id_number?: string
  children?: unknown[]
  children_count?: number
}

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

const STATUS_PILL: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending:   { label: 'ממתין לאישור', cls: 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200', icon: Clock },
  active:    { label: 'מאושר',        cls: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200', icon: Check },
  cancelled: { label: 'לא מאושר',     cls: 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200', icon: X },
  completed: { label: 'הושלם',        cls: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200', icon: Check },
}

// ── Clickable status control ────────────────────────────────────────────────────
export function StatusControl({ aid, advance }: { aid: MaternityAid; advance?: boolean }) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const pill = STATUS_PILL[aid.status] ?? STATUS_PILL.pending
  const Icon = pill.icon

  const setStatus = async (next: MaternityStatus) => {
    setSaving(true)
    try {
      // עדכון סטטוס התיק
      const { error } = await supabase.from('maternity_aids').update({ status: next }).eq('id', aid.id)
      if (error) throw error

      // סנכרון סטטוס התינוק בכרטסת המשפחה לפי סטטוס תיק היולדת
      // active → הלידה מאושרת · pending → חוזר לממתין · cancelled → מוסר מהכרטסת
      await syncBabyStatusInFamily(supabase, aid, next)

      // באישור הלידה — מייל "בקשתך אושרה" לנרשם + הפיכת המשפחה ל"מאושר" אוטומטית
      if (next === 'active') {
        await fetch('/api/admin/request-approved', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'maternity', id: aid.id }),
        }).catch(() => {})
      }

      // באישור הלידה — סנכרון המשפחה לנדרים פלוס (כרטיס נדרים). נכשל בשקט אם לא מוגדר.
      if (next === 'active') {
        const mother = aid.beneficiary as MotherRef | undefined
        if (mother?.id) {
          try {
            await fetch('/api/nedarim/save-client', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ beneficiaryId: mother.id }),
            })
          } catch { /* לא חוסם את האישור */ }
        }
      }
      setOpen(false)
      // טיפול בבקשה ממתינה מתוך כרטיס הבקשה → קפיצה לבקשה הממתינה הבאה
      if (advance && next !== 'pending') {
        await goToNextPending(supabase, router, { table: 'maternity_aids', statusColumn: 'status', pendingValues: ['pending'], currentId: aid.id, detailBase: '/admin/maternity', listPath: '/admin/maternity' })
      } else {
        router.refresh()
      }
    } catch (err: unknown) {
      alert(`שגיאה בעדכון: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const options: { value: MaternityStatus; label: string; cls: string; icon: typeof Check }[] = [
    { value: 'active',    label: 'אשר לידה',     cls: 'text-green-700 hover:bg-green-50', icon: Check },
    { value: 'cancelled', label: 'דחה',          cls: 'text-red-600 hover:bg-red-50', icon: X },
    { value: 'pending',   label: 'החזר לממתין',  cls: 'text-amber-700 hover:bg-amber-50', icon: Clock },
  ]

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-60 ${pill.cls}`}
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
        {pill.label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {/* נפתח לצד שמאל של הכפתור כדי לא להיחתך בתחתית הטבלה */}
          <div className="absolute z-20 top-0 left-full ml-2 w-40 bg-white rounded-xl border border-slate-200 shadow-lg py-1">
            {options.filter(o => o.value !== aid.status).map(o => {
              const OIcon = o.icon
              return (
                <button key={o.value} onClick={() => setStatus(o.value)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right transition-colors ${o.cls}`}>
                  <OIcon size={15} /> {o.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// התאמת התינוק שנשמר בכרטסת המשפחה לתיק היולדת הנוכחי
const isSameBaby = (c: Record<string, unknown>, aid: MaternityAid) =>
  (c.maternity_aid_id && c.maternity_aid_id === aid.id) ||
  (aid.baby_id_number && c.id_number === aid.baby_id_number) ||
  (c.name === aid.baby_name && c.birth_date === aid.birth_date)

// סנכרון סטטוס התינוק בכרטסת המשפחה (beneficiaries → children JSON) לפי סטטוס תיק היולדת
async function syncBabyStatusInFamily(
  supabase: ReturnType<typeof createClient>,
  aid: MaternityAid,
  next: MaternityStatus,
) {
  const mother = aid.beneficiary as MotherRef | undefined
  if (!mother?.id || !aid.baby_name) return

  const existing = Array.isArray(mother.children) ? (mother.children as Record<string, unknown>[]) : []
  const idx = existing.findIndex(c => isSameBaby(c, aid))

  let updatedChildren: Record<string, unknown>[]

  if (next === 'cancelled') {
    // דחיית הלידה — נסיר מהכרטסת רק אם הילד נכנס דרך תיק היולדת (יש לו birth_status)
    if (idx === -1) return
    const child = existing[idx]
    if (!child.birth_status && !child.maternity_aid_id) return
    updatedChildren = existing.filter((_, i) => i !== idx)
  } else {
    // active → מאושר · pending → ממתין לאישור לידה
    const birth_status = next === 'active' ? 'approved' : 'pending'
    const babyData = {
      name: aid.baby_name,
      id_number: aid.baby_id_number ?? null,
      doc_type: aid.baby_id_type ?? 'id',
      gender: aid.baby_gender ?? null,
      birth_date: aid.birth_date ?? null,
      marital_status: 'single', // תינוק שזה עתה נולד — לא נשוי
      maternity_aid_id: aid.id,
      birth_status,
    }
    if (idx === -1) {
      updatedChildren = [...existing, babyData]
    } else {
      updatedChildren = existing.map((c, i) => i === idx ? { ...c, ...babyData } : c)
    }
  }

  await supabase
    .from('beneficiaries')
    .update({ children: updatedChildren, children_count: updatedChildren.length })
    .eq('id', mother.id)
}

// מחיקת תיק יולדת — מסיר גם את התינוק שנכנס דרך התיק מכרטסת המשפחה, ואז מוחק את התיק
export async function deleteMaternityAid(supabase: ReturnType<typeof createClient>, aid: MaternityAid) {
  const mother = aid.beneficiary as MotherRef | undefined
  if (mother?.id) {
    const existing = Array.isArray(mother.children) ? (mother.children as Record<string, unknown>[]) : []
    const idx = existing.findIndex(c => isSameBaby(c, aid))
    // נסיר רק ילד שנכנס דרך תיק היולדת (יש לו maternity_aid_id / birth_status)
    if (idx !== -1 && (existing[idx].maternity_aid_id || existing[idx].birth_status)) {
      const updatedChildren = existing.filter((_, i) => i !== idx)
      await supabase
        .from('beneficiaries')
        .update({ children: updatedChildren, children_count: updatedChildren.length })
        .eq('id', mother.id)
    }
  }
  const { error } = await supabase.from('maternity_aids').delete().eq('id', aid.id)
  if (error) throw error
}

// ── Delete button (table row) ─────────────────────────────────────────────────────
function DeleteAidButton({ aid }: { aid: MaternityAid }) {
  const router = useRouter()
  const supabase = createClient()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`למחוק את תיק היולדת של "${aid.baby_name ?? 'התינוק'}" לצמיתות? פעולה זו אינה הפיכה.`)) return
    setDeleting(true)
    try {
      await deleteMaternityAid(supabase, aid)
      router.refresh()
    } catch (err: unknown) {
      alert(`שגיאה במחיקה: ${err instanceof Error ? err.message : String(err)}`)
      setDeleting(false)
    }
  }

  return (
    <button onClick={handleDelete} disabled={deleting}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-white hover:bg-red-600 px-2.5 py-1.5 rounded-lg border border-red-200 hover:border-red-600 transition-colors disabled:opacity-50">
      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} מחיקה
    </button>
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

export default function MaternityTable({ data, showCard, hideFilters }: { data: MaternityAid[]; showCard?: boolean; hideFilters?: boolean }) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

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
          <div className="relative w-full sm:w-72">
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['שם היולדת', 'ת.ז. האישה', 'שם התינוק', 'ת.ז. התינוק', 'תאריך לידה', 'בית החלמה', 'אישור לידה', ...(showCard ? ['סטטוס כרטיס'] : []), 'סטטוס', 'פעולות'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap align-middle">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={showCard ? 10 : 9} className="px-4 py-12 text-center text-slate-400">לא נמצאו לידות בסינון זה</td></tr>
              ) : filtered.map(aid => {
                const m = aid.beneficiary as MotherRef | undefined
                return (
                  <tr key={aid.id}
                    onClick={() => router.push(`/admin/maternity/${aid.id}`)}
                    className="hover:bg-indigo-50/50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 align-middle font-medium text-slate-800 whitespace-nowrap">{motherName(m)}</td>
                    <td className="px-4 py-3 align-middle text-xs font-mono text-slate-600"><span className="ltr-num">{m?.spouse_id_number ?? '—'}</span></td>
                    <td className="px-4 py-3 align-middle text-slate-700">{aid.baby_name ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 align-middle text-xs font-mono text-slate-600"><span className="ltr-num">{aid.baby_id_number ?? '—'}</span></td>
                    <td className="px-4 py-3 align-middle text-slate-600"><span className="ltr-num">{formatDate(aid.birth_date)}</span></td>
                    <td className="px-4 py-3 align-middle text-slate-600">{aid.recovery_home ?? '—'}</td>
                    <td className="px-4 py-3 align-middle">
                      {aid.birth_certificate_url ? (
                        <a href={aid.birth_certificate_url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 px-2.5 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors">
                          <FileText size={14} /> צפייה
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {showCard && (
                      <td className="px-4 py-3 align-middle">
                        {(() => { const cs = aid.card_status ?? 'pending'; const m = CARD_STATUS_PILL[cs]; return <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${m.cls}`}>{m.label}</span> })()}
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
