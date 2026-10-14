'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileDown, Check, RotateCcw, X, ShieldCheck, BookCheck } from 'lucide-react'
import { KVITEL_CHANNELS, KVITEL_REQUEST_TYPES, KVITEL_STATUSES, formatLine, type KvitelStatus } from '@/lib/kvitel'
import type { KvitelFilters, KvitelRequestRow } from '@/lib/kvitelQuery'

const STATUS_STYLE: Record<KvitelStatus, string> = {
  review: 'bg-amber-100 text-amber-900',
  pending: 'bg-sky-100 text-sky-900',
  done: 'bg-emerald-100 text-emerald-900',
  cancelled: 'bg-slate-200 text-slate-700',
}

const field = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'
const dateFmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

function filtersToQuery(f: KvitelFilters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams()
  if (f.from) p.set('from', f.from)
  if (f.to) p.set('to', f.to)
  if (f.status !== 'open') p.set('status', f.status)
  if (f.channel) p.set('channel', f.channel)
  if (f.type) p.set('type', f.type)
  if (f.q) p.set('q', f.q)
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  return p.toString()
}

export default function KvitelClient({ rows, filters, canEdit }: { rows: KvitelRequestRow[]; filters: KvitelFilters; canEdit: boolean }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const lineCount = useMemo(() => rows.reduce((n, r) => n + r.kvitel_request_lines.length, 0), [rows])
  const reviewCount = rows.filter(r => r.status === 'review').length
  const allSelected = rows.length > 0 && selected.size === rows.length

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  // אישור + הוספת שמות הבקשה למילון, כדי שהסוכן יכיר את הכתיב בפעם הבאה.
  async function approveWithDictionary(r: KvitelRequestRow) {
    const names = r.kvitel_request_lines.flatMap(l => [l.name, l.parent_name])
    setBusy(true)
    try {
      const res = await fetch('/api/admin/kvitel/dictionary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names }),
      })
      if (!res.ok) { setMessage((await res.json().catch(() => ({}))).error || 'ההוספה למילון נכשלה'); return }
    } finally {
      setBusy(false)
    }
    await setStatus([r.id], 'pending')
  }

  async function setStatus(ids: string[], status: KvitelStatus) {
    if (!ids.length) return
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin/kvitel/requests', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMessage(data.error || 'העדכון נכשל'); return }
      setMessage(`עודכנו ${data.updated} בקשות ל"${KVITEL_STATUSES[status]}"`)
      setSelected(new Set())
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const exportHref = `/api/admin/kvitel/export?${filtersToQuery(filters, selected.size ? { ids: [...selected].join(',') } : {})}`
  const ids = [...selected]

  return (
    <div className="space-y-5">
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">מתאריך
          <input type="date" name="from" defaultValue={filters.from ?? ''} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">עד תאריך
          <input type="date" name="to" defaultValue={filters.to ?? ''} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">סטטוס
          <select name="status" defaultValue={filters.status} className={field}>
            <option value="open">פתוחות (לבדיקה + ממתין)</option>
            {Object.entries(KVITEL_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="all">הכול</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">ערוץ
          <select name="channel" defaultValue={filters.channel ?? ''} className={field}>
            <option value="">כל הערוצים</option>
            {Object.entries(KVITEL_CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">סוג בקשה
          <select name="type" defaultValue={filters.type ?? ''} className={field}>
            <option value="">כל הסוגים</option>
            {KVITEL_REQUEST_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-slate-600">חיפוש
          <input type="search" name="q" defaultValue={filters.q} placeholder="משפחה, מגיש, טלפון" className={field} />
        </label>
        <button type="submit" className="rounded-lg bg-[#1B3256] px-4 py-2 text-sm font-semibold text-white">סינון</button>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-700">
          <strong>{rows.length}</strong> בקשות · <strong>{lineCount}</strong> שמות
          {reviewCount > 0 && <> · <span className="font-semibold text-amber-800">{reviewCount} לבדיקה</span></>}
        </p>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <a href={exportHref} className="flex items-center gap-1.5 rounded-lg border border-[#1B3256] px-3 py-2 text-sm font-semibold text-[#1B3256]">
            <FileDown className="h-4 w-4" aria-hidden />
            {selected.size ? `ייצוא ${selected.size} שנבחרו ל-Word` : 'ייצוא ל-Word'}
          </a>
        </div>
      </div>
      <p className="-mt-3 text-xs text-slate-500">בקובץ נכנסים רק &quot;ממתין&quot; ו&quot;בוצע&quot;. בקשות &quot;לבדיקה&quot; צריך לאשר קודם.</p>

      {canEdit && rows.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/95 p-3 backdrop-blur">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)))} className="h-4 w-4" />
            בחירת הכול
          </label>
          <span className="text-sm text-slate-500">{selected.size ? `נבחרו ${selected.size}` : ''}</span>
          <div className="ms-auto flex flex-wrap gap-2">
            <button disabled={busy || !ids.length} onClick={() => setStatus(ids, 'done')} className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
              <Check className="h-4 w-4" aria-hidden /> סימון בוצע
            </button>
            <button disabled={busy || !ids.length} onClick={() => setStatus(ids, 'pending')} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:opacity-40">
              <RotateCcw className="h-4 w-4" aria-hidden /> אישור / החזרה לממתין
            </button>
            <button disabled={busy || !ids.length} onClick={() => setStatus(ids, 'cancelled')} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-rose-800 disabled:opacity-40">
              <X className="h-4 w-4" aria-hidden /> ביטול
            </button>
          </div>
        </div>
      )}
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">אין בקשות בסינון הזה.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(r => (
            <li key={r.id} className={`rounded-xl border bg-white p-4 ${selected.has(r.id) ? 'border-[#1B3256] ring-1 ring-[#1B3256]' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                {canEdit && (
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-1 h-4 w-4" aria-label={`בחירת הבקשה של ${r.contact_name || dateFmt.format(new Date(r.submitted_at))}`} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{r.contact_name || '—'}</p>
                  <p className="text-sm text-slate-600 break-words">
                    {r.contact_phone && <><span dir="ltr">{r.contact_phone}</span> · </>}
                    {r.contact_email && <><span dir="ltr">{r.contact_email}</span> · </>}
                    {dateFmt.format(new Date(r.submitted_at))}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">{KVITEL_CHANNELS[r.channel]}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{KVITEL_STATUSES[r.status]}</span>
                </div>
              </div>
              <ol className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-base text-slate-800">
                {r.kvitel_request_lines.map(l => (
                  <li key={l.id} className="break-words">
                    {formatLine({ name: l.name, relation: l.relation, parentName: l.parent_name, requestType: l.request_type, requestNote: l.request_note })}
                    {l.flagged && <span className="ms-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900">{l.flag_reason || 'לבדיקה'}</span>}
                  </li>
                ))}
              </ol>
              {!r.kvitel_request_lines.length && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">לא זוהו שמות. יש לקרוא את המקור ולהקליד את השמות בטופס, ואז לבטל בקשה זו.</p>
              )}
              {r.note && <p className="mt-2 text-sm text-slate-600">{r.note}</p>}
              {r.recording_url?.startsWith('yemot:') && (
                <p className="mt-2 text-sm text-slate-600">ההקלטה שמורה במערכת הטלפון (ימות), בתיקיית ההקלטות לפי מספר המתקשר והשעה.</p>
              )}
              {r.recording_url && !r.recording_url.startsWith('yemot:') && (
                <audio controls preload="none" src={r.recording_url} className="mt-2 w-full" aria-label="ההקלטה של המתקשר" />
              )}
              {r.raw_text && (
                <details className="mt-2 text-sm text-slate-600">
                  <summary className="cursor-pointer">המקור (תמלול / מייל)</summary>
                  <p className="mt-1 whitespace-pre-wrap break-words">{r.raw_text}</p>
                </details>
              )}
              {canEdit && r.status === 'review' && r.kvitel_request_lines.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={busy} onClick={() => setStatus([r.id], 'pending')} className="flex items-center gap-1 rounded-lg bg-[#1B3256] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                    <ShieldCheck className="h-4 w-4" aria-hidden /> אישור
                  </button>
                  <button disabled={busy} onClick={() => approveWithDictionary(r)} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 disabled:opacity-40">
                    <BookCheck className="h-4 w-4" aria-hidden /> אישור והוספת הכתיב למילון
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
