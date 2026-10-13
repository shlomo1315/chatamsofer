'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Loader2, X, Plus } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { useCan } from '@/components/StaffPermissions'
import { ilDateTime } from '@/lib/israelTime'
import { BOOK_FAIR_STATUS_LABELS, BOOK_FAIR_STATUS_COLORS, type BookFairOrderStatus } from '@/types/bookFair'
import {
  ISSUE_TYPES, ISSUE_TYPE_LABELS, ISSUE_STATUS_LABELS, ISSUE_STATUS_TAG,
  RESOLUTIONS, RESOLUTION_LABELS, REPORTED_VIA, REPORTED_VIA_LABELS, ITEM_TYPES,
  CHIPS, CHIP_LABELS, filtersToQuery, statusToast, statusEventText,
  daysSince, agoLabel, lateDays, chipCounts,
  type IssueType, type IssueStatus, type Resolution, type ReportedVia,
  type IssueFilters, type AffectedItem, type Chip,
} from '@/lib/bookFairShippingIssues'

// ─────────────────────────────────────────────────────────────────────────────
// מסך תקלות המשלוח — לפי המוקאפ שאושר (13.10):
// מסננים בשורה אחת → טבלה (כרטיסים במובייל) → חלונית צד לפרטים, ליומן
// ולטפסים. ברירת המחדל "פתוחות" (פתוח + בטיפול) — זה התור לעבודה.
//
// ⚠️ כל טקסט שהוקלד מוצג כטקסט רגיל של React — אף פעם לא כ-HTML.
// ─────────────────────────────────────────────────────────────────────────────

type OrderMini = { id: string; order_number: string; customer_name: string | null; customer_phone: string | null }
type Row = {
  id: string
  issue_type: IssueType
  status: IssueStatus
  resolution: Resolution | null
  description: string
  created_at: string
  updated_at: string
  order: OrderMini | null
}
type Panel = { kind: 'view'; id: string } | { kind: 'new'; orderId: string } | { kind: 'edit'; id: string } | null

const field = 'rounded-lg border border-slate-200 bg-white px-2.5 py-[7px] text-[13px] text-slate-900 focus:border-indigo-400 focus:outline-none'
const btnDark = 'rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50'
const btnLine = 'rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50'
const tag = 'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold'
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Jerusalem' })

export default function ShippingIssuesClient({ initialFilters, newForOrder, openIssue }: {
  initialFilters: IssueFilters
  newForOrder: string
  openIssue: string
}) {
  const canEdit = useCan('book_fair', 'edit')
  const [f, setF] = useState<IssueFilters>(initialFilters)
  const [q, setQ] = useState(initialFilters.q)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [counts, setCounts] = useState<Record<Chip, number>>(chipCounts([]))
  const [error, setError] = useState('')
  const [panel, setPanel] = useState<Panel>(
    newForOrder ? { kind: 'new', orderId: newForOrder } : openIssue ? { kind: 'view', id: openIssue } : null,
  )
  const [toast, setToast] = useState('')

  // ⚠️ החיפוש נשלח בהשהיה — לא בקשה על כל הקשה.
  useEffect(() => {
    const t = setTimeout(() => setF(p => (p.q === q ? p : { ...p, q })), 350)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(async () => {
    const qs = filtersToQuery(f)
    // המסננים נשמרים ב-URL (בלי ניווט מחדש).
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
    try {
      const res = await fetch(`/api/admin/book-fair/shipping-issues${qs ? `?${qs}` : ''}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'טעינת התקלות נכשלה'); return }
      setError('')
      setRows(json.issues ?? [])
      setCounts(json.counts ?? chipCounts([]))
    } catch {
      setError('טעינת התקלות נכשלה — בדקו את החיבור')
    }
  }, [f])

  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const dirty = Boolean(f.type || f.from || f.to || q.trim() || f.chip !== 'active')
  const clear = () => { setQ(''); setF({ chip: 'active', type: '', from: '', to: '', q: '' }) }
  const done = async (msg: string, next: Panel) => { setToast(msg); setPanel(next); await load() }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="תקלות משלוח" subtitle="משלוחים שדורשים טיפול — מהדיווח ועד הסגירה.">
        {canEdit && (
          <button onClick={() => setPanel({ kind: 'new', orderId: '' })} className={`${btnDark} flex items-center gap-1`}>
            <Plus size={14} /> תקלה חדשה
          </button>
        )}
      </PageHeader>

      {/* ── מסננים ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        {/* ⚠️ flex-wrap ולא גלילה אופקית — כלל הפרויקט (docs/no-horizontal-scroll.md). */}
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map(c => (
            <button
              key={c}
              onClick={() => setF(p => ({ ...p, chip: c }))}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] transition ${
                f.chip === c ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {CHIP_LABELS[c]}
              <b className={`ms-1 font-semibold ${f.chip === c ? 'text-slate-300' : 'text-slate-500'}`}>{counts[c]}</b>
            </button>
          ))}
        </div>
        <span className="hidden h-6 w-px bg-slate-200 md:block" />
        <select value={f.type} onChange={e => setF(p => ({ ...p, type: e.target.value as IssueType | '' }))} className={field}>
          <option value="">כל הסוגים</option>
          {ISSUE_TYPES.map(t => <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>)}
        </select>
        <span className="text-xs text-slate-500">נפתח:</span>
        <input type="date" value={f.from} title="מתאריך" onChange={e => setF(p => ({ ...p, from: e.target.value }))} className={field} />
        <span className="text-xs text-slate-500">עד</span>
        <input type="date" value={f.to} title="עד תאריך" onChange={e => setF(p => ({ ...p, to: e.target.value }))} className={field} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש: מספר הזמנה, שם או טלפון"
               className={`${field} min-w-[200px] flex-1`} />
        {dirty && (
          <button onClick={clear} className="text-[13px] text-indigo-600 hover:underline">נקה מסננים</button>
        )}
      </div>

      {/* ── טבלה ── */}
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!rows && !error && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> טוען…
        </div>
      )}
      {rows && rows.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          {dirty ? (
            <>לא נמצאו תקלות לפי הסינון.<br />
              <button onClick={clear} className="mt-1 text-[13px] text-indigo-600 hover:underline">נקה מסננים</button></>
          ) : (
            <><b className="text-base text-slate-900">אין תקלות פתוחות 🎉</b><br />כל המשלוחים בטיפול או טופלו.</>
          )}
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="hidden md:table-header-group">
              <tr className="border-b border-slate-200 bg-slate-50 text-right text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5">הזמנה</th><th className="px-3 py-2.5">לקוח</th><th className="px-3 py-2.5">סוג</th>
                <th className="px-3 py-2.5">תיאור</th><th className="px-3 py-2.5">סטטוס</th><th className="px-3 py-2.5">נפתח</th>
                <th className="px-3 py-2.5">עודכן</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {rows.map(r => {
                const days = daysSince(r.created_at)
                const late = lateDays(r.status, r.created_at)
                return (
                  <tr
                    key={r.id}
                    onClick={() => setPanel({ kind: 'view', id: r.id })}
                    className="block cursor-pointer border-b border-slate-100 py-2 align-top hover:bg-slate-50 md:table-row md:py-0"
                  >
                    <td className="block px-3 py-1 md:table-cell md:py-[11px]">
                      {r.order && (
                        <Link href={`/admin/book-fair/orders/${r.order.id}`} onClick={e => e.stopPropagation()}
                              className="font-mono font-semibold text-indigo-700 hover:underline">
                          {r.order.order_number}
                        </Link>
                      )}
                    </td>
                    <td className="block px-3 py-1 md:table-cell md:py-[11px]">
                      {r.order?.customer_name || '—'}
                      <div className="text-xs text-slate-500">{r.order?.customer_phone}</div>
                    </td>
                    <td className="block px-3 py-1 md:table-cell md:py-[11px]">
                      <span className={`${tag} bg-slate-100 font-medium text-slate-700`}>{ISSUE_TYPE_LABELS[r.issue_type]}</span>
                    </td>
                    <td className="block px-3 py-1 md:table-cell md:py-[11px]">
                      <div className="text-slate-700 md:max-w-[280px] md:overflow-hidden md:text-ellipsis md:whitespace-nowrap" title={r.description}>
                        {r.description}
                      </div>
                    </td>
                    <td className="block px-3 py-1 md:table-cell md:py-[11px]">
                      <span className={`${tag} ${ISSUE_STATUS_TAG[r.status]}`}>{ISSUE_STATUS_LABELS[r.status]}</span>
                      {late !== null && (
                        <div><span className={`${tag} mt-1 bg-orange-50 text-[11px] text-orange-700`}>ממתינה {late} ימים</span></div>
                      )}
                    </td>
                    <td className="block px-3 py-1 md:table-cell md:py-[11px]">
                      {fmtDay(r.created_at)}
                      <div className="text-xs text-slate-500">{agoLabel(days)}</div>
                    </td>
                    <td className="block px-3 py-1 text-xs text-slate-500 md:table-cell md:py-[11px]">{fmtDay(r.updated_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── חלונית צד ── */}
      {panel && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/35" onClick={() => setPanel(null)} />
          <aside className="fixed bottom-0 left-0 top-0 z-50 w-full overflow-y-auto bg-white p-5 shadow-2xl sm:w-[440px]">
            <button onClick={() => setPanel(null)} aria-label="סגירה" className="float-left text-slate-500 hover:text-slate-800">
              <X size={22} />
            </button>
            {panel.kind === 'view' && (
              <IssueDetails
                key={panel.id}
                id={panel.id}
                canEdit={canEdit}
                onEdit={() => setPanel({ kind: 'edit', id: panel.id })}
                onChanged={async msg => { setToast(msg); await load() }}
              />
            )}
            {panel.kind === 'new' && (
              <IssueForm key={`new-${panel.orderId}`} orderId={panel.orderId}
                         onCancel={() => setPanel(null)}
                         onSaved={id => done('התקלה נשמרה', { kind: 'view', id })} />
            )}
            {panel.kind === 'edit' && (
              <IssueForm key={`edit-${panel.id}`} editId={panel.id} orderId=""
                         onCancel={() => setPanel({ kind: 'view', id: panel.id })}
                         onSaved={id => done('התקלה נשמרה', { kind: 'view', id })} />
            )}
          </aside>
        </>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

// ── פרטי תקלה ────────────────────────────────────────────────────────────────

type Detail = {
  issue: Row & {
    reported_via: ReportedVia | null
    affected_items: AffectedItem[]
    order: (OrderMini & { status: BookFairOrderStatus; delivery_method: string }) | null
  }
  events: { id: string; kind: 'note' | 'status' | 'edit'; body: string | null; from_status: string | null; to_status: string | null; resolution: string | null; author_name: string | null; created_at: string }[]
}

function IssueDetails({ id, canEdit, onEdit, onChanged }: {
  id: string; canEdit: boolean; onEdit: () => void; onChanged: (msg: string) => Promise<void>
}) {
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [pickResolved, setPickResolved] = useState(false)
  const [resolution, setResolution] = useState<Resolution | ''>('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/book-fair/shipping-issues/${id}`, { cache: 'no-store' }).catch(() => null)
    const json = await res?.json().catch(() => ({}))
    if (!res?.ok) { setErr(json?.error ?? 'טעינת התקלה נכשלה'); return }
    setD(json)
    setResolution(json.issue.resolution ?? '')
  }, [id])

  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  async function send(method: 'PATCH' | 'POST', body: object, msg: string) {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/admin/book-fair/shipping-issues/${id}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(json.error ?? 'העדכון נכשל'); return false }
      await Promise.all([load(), onChanged(msg)])
      return true
    } catch {
      setErr('העדכון נכשל — בדקו את החיבור')
      return false
    } finally {
      setBusy(false)
    }
  }

  const setStatus = (status: IssueStatus, res?: Resolution) =>
    send('PATCH', { action: 'status', status, ...(res ? { resolution: res } : {}) }, statusToast(status))

  if (!d) {
    return err
      ? <p className="mt-10 text-sm text-red-700">{err}</p>
      : <div className="mt-16 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-400" /></div>
  }

  const { issue: r, events } = d
  const showResolution = r.status === 'resolved' || pickResolved

  return (
    <div>
      <h2 className="mb-1 text-[17px] font-bold">{ISSUE_TYPE_LABELS[r.issue_type]}</h2>
      <div className="text-xs text-slate-500">
        הזמנה{' '}
        {r.order && (
          <Link href={`/admin/book-fair/orders/${r.order.id}`} className="font-mono font-semibold text-indigo-700 hover:underline">
            {r.order.order_number}
          </Link>
        )}
        {' · '}{r.order?.customer_name || '—'}{r.order?.customer_phone && ` · ${r.order.customer_phone}`}
      </div>
      {r.order && (
        <span className={`mt-2 inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${BOOK_FAIR_STATUS_COLORS[r.order.status]}`}>
          הזמנה: {BOOK_FAIR_STATUS_LABELS[r.order.status]}
        </span>
      )}

      <Box title="מה קרה">
        <p className="whitespace-pre-wrap">{r.description}</p>
        {r.affected_items.length > 0 && (
          <div className="mt-1 text-xs text-slate-500">
            ספרים: {r.affected_items.map(i => `${i.title} ×${i.quantity}`).join(', ')}
          </div>
        )}
        <div className="mt-1 text-xs text-slate-500">
          {r.reported_via ? `דווח ב${REPORTED_VIA_LABELS[r.reported_via]} · ` : ''}{fmtDay(r.created_at)}
        </div>
      </Box>

      <Box title="סטטוס">
        <div className="flex gap-1.5">
          {(['open', 'in_progress', 'resolved'] as const).map(s => {
            const on = r.status === s || (s === 'resolved' && pickResolved)
            const onCls = s === 'open' ? 'border-red-300 bg-red-50 font-semibold text-red-700'
              : s === 'in_progress' ? 'border-amber-300 bg-amber-50 font-semibold text-amber-700'
              : 'border-green-300 bg-green-50 font-semibold text-green-700'
            return (
              <button
                key={s}
                disabled={!canEdit || busy}
                onClick={() => {
                  if (s === 'resolved') { if (r.status !== 'resolved') setPickResolved(true); return }
                  setPickResolved(false)
                  if (r.status !== s) void setStatus(s)
                }}
                className={`flex-1 rounded-lg border p-2 text-[13px] transition disabled:cursor-default ${on ? onCls : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                {ISSUE_STATUS_LABELS[s]}
              </button>
            )
          })}
        </div>
        {showResolution && (
          <>
            <label className="mb-1 mt-3 block text-xs font-semibold text-slate-700">
              איך טופלה התקלה? <span className="text-red-600">*</span>
            </label>
            <select
              value={resolution}
              disabled={!canEdit || busy}
              onChange={e => {
                const v = e.target.value as Resolution | ''
                setResolution(v)
                // ⚠️ בתקלה שכבר טופלה — שינוי האופן נשמר מיד.
                if (v && r.status === 'resolved' && v !== r.resolution) void setStatus('resolved', v)
              }}
              className={`${field} w-full`}
            >
              <option value="">בחר…</option>
              {RESOLUTIONS.map(x => <option key={x} value={x}>{RESOLUTION_LABELS[x]}</option>)}
            </select>
            {resolution === 'refunded' && (
              <div className="mt-1 text-xs text-slate-500">
                &quot;זיכוי כספי&quot; לא מזכה בעצמו — <Link href="/admin/book-fair/refunds" className="text-indigo-600 hover:underline">למסך הזיכויים</Link>
              </div>
            )}
            {r.status !== 'resolved' && canEdit && (
              <div className="mt-2 flex gap-2">
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (!resolution) { setErr('בחר איך טופלה התקלה'); return }
                    if (await setStatus('resolved', resolution)) setPickResolved(false)
                  }}
                  className={btnDark}
                >
                  סמן כטופל
                </button>
                <button onClick={() => { setPickResolved(false); setErr('') }} className={btnLine}>ביטול</button>
              </div>
            )}
          </>
        )}
        {r.status === 'cancelled' && (
          <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            התקלה בוטלה ונשארת לתיעוד בלבד.
          </div>
        )}
        {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
      </Box>

      <Box title="יומן טיפול">
        <ul className="m-0 list-none p-0">
          {events.map(e => (
            <li key={e.id} className="relative border-s-2 border-slate-200 pb-3 ps-3">
              <span className={`absolute -start-[6px] top-[3px] h-2.5 w-2.5 rounded-full ${e.kind === 'status' ? 'bg-indigo-500' : 'bg-slate-300'}`} />
              <div className="whitespace-pre-wrap">
                {e.kind === 'status' ? statusEventText(e) : e.kind === 'note' ? `"${e.body}"` : e.body}
              </div>
              <div className="text-xs text-slate-500">{e.author_name || 'משתמש'} · {ilDateTime(e.created_at)}</div>
            </li>
          ))}
        </ul>
        {canEdit && (
          <>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={2000}
                      placeholder='מה נעשה? לדוגמה: "דיברתי עם השליח, יוצא משלוח חוזר מחר"'
                      className={`${field} w-full`} />
            <button
              disabled={busy || !note.trim()}
              onClick={async () => { if (await send('POST', { body: note }, 'ההערה נוספה')) setNote('') }}
              className={`${btnLine} mt-1.5`}
            >
              הוסף הערה
            </button>
          </>
        )}
      </Box>

      {canEdit && (
        <div className="mt-3.5 flex gap-2">
          <button onClick={onEdit} className={btnLine}>ערוך</button>
          {r.status !== 'cancelled' && (
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm("לבטל את התקלה? היא תישאר בתיעוד בסטטוס 'בוטל'.")) void setStatus('cancelled')
              }}
              className={`${btnLine} text-red-700`}
            >
              בטל תקלה
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 p-3 text-sm">
      <h3 className="mb-1.5 text-xs font-semibold text-slate-500">{title}</h3>
      {children}
    </div>
  )
}

// ── טופס תקלה חדשה / עריכה ───────────────────────────────────────────────────

type OrderOption = OrderMini & {
  status: BookFairOrderStatus
  delivery_method: string
  items: { id: string; title_snapshot: string; quantity: number }[]
}

function IssueForm({ orderId, editId, onCancel, onSaved }: {
  orderId: string; editId?: string; onCancel: () => void; onSaved: (id: string) => void
}) {
  const [order, setOrder] = useState<OrderOption | null>(null)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<OrderOption[]>([])
  const [type, setType] = useState<IssueType | ''>('')
  const [items, setItems] = useState<Record<string, number>>({})
  const [description, setDescription] = useState('')
  const [via, setVia] = useState<ReportedVia>('phone')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const loadedRef = useRef(false)

  // טעינה ראשונית: הזמנה ידועה (מכרטיס ההזמנה) או תקלה לעריכה.
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    const t = setTimeout(async () => {
      if (editId) {
        const res = await fetch(`/api/admin/book-fair/shipping-issues/${editId}`, { cache: 'no-store' }).catch(() => null)
        const json = await res?.json().catch(() => null)
        if (!res?.ok || !json) { setErr(json?.error ?? 'טעינת התקלה נכשלה'); return }
        const i = json.issue as Detail['issue']
        if (i.order) setOrder({ ...i.order, items: json.orderItems ?? [] })
        setType(i.issue_type)
        setDescription(i.description)
        setVia(i.reported_via ?? 'phone')
        setItems(Object.fromEntries(i.affected_items.map(a => [a.item_id, a.quantity])))
      } else if (orderId) {
        const res = await fetch(`/api/admin/book-fair/shipping-issues/orders?id=${encodeURIComponent(orderId)}`, { cache: 'no-store' }).catch(() => null)
        const json = await res?.json().catch(() => null)
        if (json?.orders?.[0]) setOrder(json.orders[0])
      }
    }, 0)
    return () => clearTimeout(t)
  }, [editId, orderId])

  // חיפוש הזמנה בהשהיה.
  useEffect(() => {
    if (order || search.trim().length < 2) return
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/book-fair/shipping-issues/orders?q=${encodeURIComponent(search.trim())}`, { cache: 'no-store' }).catch(() => null)
      const json = await res?.json().catch(() => null)
      setResults(json?.orders ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [search, order])

  async function save() {
    if (!order) { setErr('בחר הזמנה'); return }
    if (!type) { setErr('בחר סוג תקלה'); return }
    if (!description.trim()) { setErr('כתוב מה קרה'); return }
    setBusy(true); setErr('')
    const selected = ITEM_TYPES.includes(type)
      ? Object.entries(items).map(([itemId, quantity]) => ({ itemId, quantity }))
      : []
    const payload = { type, description, via, items: selected }
    try {
      const res = await fetch(
        editId ? `/api/admin/book-fair/shipping-issues/${editId}` : '/api/admin/book-fair/shipping-issues',
        {
          method: editId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editId ? { action: 'edit', ...payload } : { orderId: order.id, ...payload }),
        },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(json.error ?? 'השמירה נכשלה'); return }
      onSaved(editId ?? json.id)
    } catch {
      setErr('השמירה נכשלה — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  const label = 'mb-1 mt-3 block text-xs font-semibold text-slate-700'

  return (
    <div>
      <h2 className="mb-1 text-[17px] font-bold">{editId ? 'עריכת תקלה' : 'תקלה חדשה במשלוח'}</h2>

      <label className={label}>הזמנה <span className="text-red-600">*</span></label>
      {order ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-[13px]">
          <span>
            <span className="font-mono font-semibold text-indigo-700">{order.order_number}</span>
            {' · '}{order.customer_name || '—'}
            {order.customer_phone && <span className="text-xs text-slate-500"> · {order.customer_phone}</span>}
          </span>
          {!editId && (
            <button onClick={() => { setOrder(null); setItems({}) }} className="text-xs text-indigo-600 hover:underline">החלף</button>
          )}
        </div>
      ) : (
        <>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="מספר הזמנה, שם או טלפון"
                 className={`${field} w-full`} autoFocus />
          {search.trim().length >= 2 && results.length > 0 && (
            <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
              {results.map(o => (
                <li key={o.id}>
                  <button onClick={() => { setOrder(o); setResults([]) }}
                          className="w-full px-2.5 py-2 text-right text-[13px] hover:bg-slate-50">
                    <span className="font-mono font-semibold text-indigo-700">{o.order_number}</span>
                    {' · '}{o.customer_name || '—'}
                    <span className="text-xs text-slate-500"> · {o.customer_phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {order?.delivery_method === 'pickup' && (
        <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
          ההזמנה הזו באיסוף עצמי, לא במשלוח. לתעד בכל זאת?
        </div>
      )}

      <label className={label}>סוג תקלה <span className="text-red-600">*</span></label>
      <select value={type} onChange={e => setType(e.target.value as IssueType | '')} className={`${field} w-full`}>
        <option value="">בחר…</option>
        {ISSUE_TYPES.map(t => <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>)}
      </select>

      {type && ITEM_TYPES.includes(type) && order && order.items.length > 0 && (
        <>
          <label className={label}>אילו ספרים?</label>
          <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-3">
            {order.items.map(it => (
              <label key={it.id} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={it.id in items}
                  onChange={e => setItems(p => {
                    const n = { ...p }
                    if (e.target.checked) n[it.id] = 1; else delete n[it.id]
                    return n
                  })}
                />
                <span className="min-w-0 flex-1">{it.title_snapshot}</span>
                כמות
                <input
                  type="number" min={1} max={Math.max(it.quantity, 1)}
                  value={items[it.id] ?? 1}
                  disabled={!(it.id in items)}
                  onChange={e => setItems(p => ({ ...p, [it.id]: Math.max(1, Number(e.target.value) || 1) }))}
                  className={`${field} w-14`}
                />
              </label>
            ))}
          </div>
        </>
      )}

      <label className={label}>מה קרה? <span className="text-red-600">*</span></label>
      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={2000}
                placeholder={'מה הלקוח סיפר? לדוגמה: "הגיע \'שו"ת חתם סופר\' חלק ב\' במקום חלק ג\'"'}
                className={`${field} w-full`} />

      <label className={label}>איך דווח</label>
      <select value={via} onChange={e => setVia(e.target.value as ReportedVia)} className={`${field} w-full`}>
        {REPORTED_VIA.map(v => <option key={v} value={v}>{REPORTED_VIA_LABELS[v]}</option>)}
      </select>

      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={save} disabled={busy} className={`${btnDark} flex items-center gap-1.5`}>
          {busy && <Loader2 size={13} className="animate-spin" />} שמור תקלה
        </button>
        <button onClick={onCancel} className={btnLine}>ביטול</button>
      </div>
    </div>
  )
}
