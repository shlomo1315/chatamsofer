'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Search, Phone, Pencil, X, Save } from 'lucide-react'
import { ilDateTime } from '@/lib/israelTime'
import { useCan } from '@/components/StaffPermissions'
import {
  ISSUE_TYPES, ISSUE_STATUSES, ISSUE_TYPE_LABELS, ISSUE_STATUS_LABELS, ISSUE_STATUS_COLORS,
  type IssueType, type IssueStatus,
} from '@/lib/bookFairShippingIssues'

// ─────────────────────────────────────────────────────────────────────────────
// תקלות משלוח — רישום, שינוי סטטוס וסינון.
//
// ⚠️ ברירת המחדל "לא טופלו": זה התור. "טופל" נשאר זמין לתיעוד.
// 🔴 כניסה מכרטיס הזמנה (?order=&number=) פותחת טופס חדש עם ההזמנה
// כבר ממולאת, ומסננת לתקלות של אותה הזמנה.
// ─────────────────────────────────────────────────────────────────────────────

type Issue = {
  id: string
  order_id: string
  issue_type: IssueType
  status: IssueStatus
  description: string
  resolution_note: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  order: { id: string; order_number: string; customer_name: string | null; customer_phone: string | null } | null
}

type StatusFilter = 'pending' | IssueStatus | 'all'
const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'pending', label: 'לא טופלו' },
  { key: 'open', label: 'פתוח' },
  { key: 'in_progress', label: 'בטיפול' },
  { key: 'resolved', label: 'טופל' },
  { key: 'all', label: 'הכל' },
]

const input = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none'

export default function IssuesClient({ orderParam = '', numberParam = '' }: {
  orderParam?: string; numberParam?: string
}) {
  const canEdit = useCan('book_fair', 'edit')

  const [status, setStatus] = useState<StatusFilter>(orderParam ? 'all' : 'pending')
  const [type, setType] = useState<IssueType | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [orderFilter, setOrderFilter] = useState(orderParam)

  const [rows, setRows] = useState<Issue[] | null>(null)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(Boolean(numberParam))

  // ⚠️ החיפוש נשלח בהשהיה — לא בקשה על כל הקשה.
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    const p = new URLSearchParams()
    if (status !== 'pending') p.set('status', status)
    if (type) p.set('type', type)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (term) p.set('q', term)
    if (orderFilter) p.set('order', orderFilter)
    try {
      const res = await fetch(`/api/admin/book-fair/issues?${p}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'טעינת התקלות נכשלה'); return }
      setError('')
      setRows(json.issues ?? [])
    } catch {
      setError('טעינת התקלות נכשלה — בדקו את החיבור')
    }
  }, [status, type, from, to, term, orderFilter])

  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch('/api/admin/book-fair/issues', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    }).catch(() => null)
    const json = await res?.json().catch(() => ({}))
    if (!res?.ok) { alert(json?.error ?? 'העדכון נכשל — בדקו את החיבור'); return false }
    await load()
    return true
  }

  const counts = (rows ?? []).reduce((acc, r) => { acc[r.status]++; return acc },
    { open: 0, in_progress: 0, resolved: 0 } as Record<IssueStatus, number>)
  const hasFilters = Boolean(type || from || to || search || orderFilter)

  return (
    <div className="flex flex-col gap-5">
      {/* ── סינון ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                status === t.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
          {canEdit && (
            <button
              onClick={() => setShowNew(v => !v)}
              className="mr-auto flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <Plus size={15} /> תקלה חדשה
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש: מספר הזמנה, שם, טלפון או תיאור"
              className={`${input} w-full pr-9`}
            />
          </div>
          <select value={type} onChange={e => setType(e.target.value as IssueType | '')} className={input}>
            <option value="">כל הסוגים</option>
            {ISSUE_TYPES.map(t => <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            מ־<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={input} />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            עד <input type="date" value={to} onChange={e => setTo(e.target.value)} className={input} />
          </label>
          {hasFilters && (
            <button
              onClick={() => { setType(''); setFrom(''); setTo(''); setSearch(''); setOrderFilter('') }}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
            >
              <X size={13} /> ניקוי סינון
            </button>
          )}
        </div>
        {orderFilter && (
          <p className="text-xs text-indigo-700">מוצגות רק התקלות של הזמנה {numberParam || 'נבחרת'}.</p>
        )}
      </div>

      {showNew && canEdit && (
        <NewIssueForm
          orderId={orderParam}
          orderNumber={numberParam}
          onDone={async () => { setShowNew(false); await load() }}
          onCancel={() => setShowNew(false)}
        />
      )}

      {/* ── סיכום ── */}
      {rows && (
        <div className="grid grid-cols-3 gap-3">
          {ISSUE_STATUSES.map(s => (
            <div key={s} className={`rounded-xl border-2 p-4 ${ISSUE_STATUS_COLORS[s]}`}>
              <div className="text-2xl font-bold">{counts[s]}</div>
              <div className="mt-0.5 text-xs font-medium">{ISSUE_STATUS_LABELS[s]}</div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!rows && !error && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> טוען…
        </div>
      )}
      {rows && rows.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          {hasFilters || status !== 'pending' ? 'אין תקלות שמתאימות לסינון.' : 'אין תקלות פתוחות.'}
        </p>
      )}
      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map(r => <IssueCard key={r.id} r={r} canEdit={canEdit} onPatch={patch} />)}
        </div>
      )}
    </div>
  )
}

function NewIssueForm({ orderId, orderNumber, onDone, onCancel }: {
  orderId: string; orderNumber: string; onDone: () => Promise<void>; onCancel: () => void
}) {
  const [number, setNumber] = useState(orderNumber)
  const [type, setType] = useState<IssueType>('not_arrived')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    // ⚠️ מזהה ההזמנה נשלח רק אם המספר לא שונה ידנית מזה שהגיע מהכרטיס.
    const byId = orderId && number.trim() === orderNumber
    try {
      const res = await fetch('/api/admin/book-fair/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(byId ? { orderId } : { orderNumber: number }),
          type, description,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(json.error ?? 'הרישום נכשל'); return }
      await onDone()
    } catch {
      setErr('הרישום נכשל — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-5">
      <h2 className="font-semibold text-slate-900">תיעוד תקלה חדשה</h2>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          מספר הזמנה
          <input value={number} onChange={e => setNumber(e.target.value)} required
                 placeholder="BF-26-…" dir="ltr" className={`${input} w-44 font-mono`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          סוג התקלה
          <select value={type} onChange={e => setType(e.target.value as IssueType)} className={input}>
            {ISSUE_TYPES.map(t => <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        מה קרה
        <textarea value={description} onChange={e => setDescription(e.target.value)} required maxLength={2000}
                  rows={3} placeholder="למשל: הגיע כרך ב׳ במקום כרך א׳ של משנה ברורה"
                  className={input} />
      </label>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} שמירה
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
          ביטול
        </button>
      </div>
    </form>
  )
}

function IssueCard({ r, canEdit, onPatch }: {
  r: Issue; canEdit: boolean; onPatch: (id: string, body: Record<string, unknown>) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [type, setType] = useState<IssueType>(r.issue_type)
  const [description, setDescription] = useState(r.description)
  const [resolution, setResolution] = useState(r.resolution_note ?? '')

  async function run(body: Record<string, unknown>) {
    setBusy(true)
    const ok = await onPatch(r.id, body)
    setBusy(false)
    if (ok) setEditing(false)
  }

  return (
    <div className={`rounded-xl border bg-white p-4 ${r.status === 'resolved' ? 'border-slate-100' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${ISSUE_STATUS_COLORS[r.status]}`}>
              {ISSUE_STATUS_LABELS[r.status]}
            </span>
            <span className="text-sm font-semibold text-slate-900">{ISSUE_TYPE_LABELS[r.issue_type]}</span>
            {r.order && (
              <Link href={`/admin/book-fair/orders/${r.order.id}`} className="text-sm font-medium text-indigo-600 hover:underline">
                הזמנה {r.order.order_number}
              </Link>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-700">
            {r.order?.customer_name || '—'}
            {r.order?.customer_phone && (
              <a href={`tel:${r.order.customer_phone}`} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                <Phone size={12} /> {r.order.customer_phone}
              </a>
            )}
          </div>
          {!editing && (
            <>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{r.description}</p>
              {r.resolution_note && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                  <span className="font-medium">טיפול: </span>{r.resolution_note}
                </p>
              )}
            </>
          )}
          <p className="mt-1 text-xs text-slate-400">
            נרשם {ilDateTime(r.created_at)}
            {r.resolved_at && ` · טופל ${ilDateTime(r.resolved_at)}`}
          </p>
        </div>

        {canEdit && !editing && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <select
              value={r.status}
              disabled={busy}
              onChange={e => run({ status: e.target.value })}
              className={`${input} py-1.5`}
              aria-label="סטטוס"
            >
              {ISSUE_STATUSES.map(s => <option key={s} value={s}>{ISSUE_STATUS_LABELS[s]}</option>)}
            </select>
            <button onClick={() => setEditing(true)} title="עריכה"
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100">
              <Pencil size={14} />
            </button>
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
          <select value={type} onChange={e => setType(e.target.value as IssueType)} className={`${input} w-48`}>
            {ISSUE_TYPES.map(t => <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>)}
          </select>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={2000} className={input} />
          <textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={2} maxLength={2000}
                    placeholder="הערות טיפול: מה נעשה (נשלח שוב, הוחלף, זוכה…)" className={input} />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => run({ type, description, resolution })}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} שמירה
            </button>
            <button onClick={() => { setEditing(false); setType(r.issue_type); setDescription(r.description); setResolution(r.resolution_note ?? '') }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
