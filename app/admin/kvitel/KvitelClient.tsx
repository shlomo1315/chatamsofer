'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileDown, Check, RotateCcw, X, ShieldCheck, BookCheck, Filter, Eye } from 'lucide-react'
import { KVITEL_CHANNELS, KVITEL_REQUEST_OPTIONS, KVITEL_STATUSES, formatLine, type KvitelStatus } from '@/lib/kvitel'
import { kvitelRequestLines, type KvitelFilters, type KvitelRequestRow } from '@/lib/kvitelQuery'
import ExportDialog from './ExportDialog'
import KvitelPreview from './KvitelPreview'

const STATUS_STYLE: Record<KvitelStatus, string> = {
  review: 'bg-amber-100 text-amber-900',
  pending: 'bg-sky-100 text-sky-900',
  done: 'bg-emerald-100 text-emerald-900',
  cancelled: 'bg-slate-200 text-slate-700',
}

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'
const label = 'flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600'
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
  const [exportOpen, setExportOpen] = useState(false)
  const [previewRow, setPreviewRow] = useState<KvitelRequestRow | null>(null)

  const lineCount = useMemo(() => rows.reduce((n, r) => n + r.kvitel_request_lines.length, 0), [rows])
  const reviewCount = rows.filter(r => r.status === 'review').length
  const filtersActive = filters.status !== 'open' || !!(filters.from || filters.to || filters.channel || filters.type || filters.q)
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
  const exportRows = selected.size ? rows.filter(r => selected.has(r.id)) : rows

  return (
    <div className="space-y-5">
      <form method="get" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className={label}>סטטוס
            <select name="status" defaultValue={filters.status} className={field}>
              <option value="open">טרם נשלחו לציון</option>
              {Object.entries(KVITEL_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              <option value="all">הכול</option>
            </select>
          </label>
          <label className={label}>ערוץ
            <select name="channel" defaultValue={filters.channel ?? ''} className={field}>
              <option value="">כל הערוצים</option>
              {Object.entries(KVITEL_CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className={label}>סוג בקשה
            <select name="type" defaultValue={filters.type ?? ''} className={field}>
              <option value="">כל הסוגים</option>
              {KVITEL_REQUEST_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <label className={label}>מתאריך
            <input type="date" name="from" defaultValue={filters.from ?? ''} className={field} />
          </label>
          <label className={label}>עד תאריך
            <input type="date" name="to" defaultValue={filters.to ?? ''} className={field} />
          </label>
          <label className={`${label} col-span-2 sm:col-span-1`}>חיפוש
            <input type="search" name="q" defaultValue={filters.q} placeholder="שם, מגיש, טלפון" className={field} />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          {filtersActive && <a href="/admin/kvitel" className="text-sm text-slate-600 underline-offset-4 hover:underline">ניקוי הסינון</a>}
          <button type="submit" className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
            <Filter className="h-4 w-4" aria-hidden /> סינון
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-800"><strong>{rows.length}</strong> בקשות</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-800"><strong>{lineCount}</strong> שמות</span>
          {reviewCount > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900">{reviewCount} לבדיקה</span>}
        </div>
        <button type="button" onClick={() => { setMessage(''); setExportOpen(true) }} disabled={!rows.length}
          className="ms-auto flex items-center gap-2 rounded-lg bg-[#1B3256] px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-40">
          <FileDown className="h-4 w-4" aria-hidden />
          {selected.size ? `ייצוא ${selected.size} שנבחרו` : 'ייצוא'}
        </button>
      </div>

      {canEdit && rows.length > 0 && (
        <div className={`sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border p-3 backdrop-blur ${selected.size ? 'border-[#1B3256]/30 bg-blue-50/95' : 'border-slate-200 bg-white/95'}`}>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)))} className="h-4 w-4" />
            {selected.size ? `נבחרו ${selected.size}` : 'בחירת הכול'}
          </label>
          {selected.size > 0 && (
            <div className="ms-auto flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => setStatus(ids, 'done')} className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
                <Check className="h-4 w-4" aria-hidden /> נשלח לציון
              </button>
              <button disabled={busy} onClick={() => setStatus(ids, 'pending')} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:opacity-40">
                <RotateCcw className="h-4 w-4" aria-hidden /> אישור / החזרה לממתין
              </button>
              <button disabled={busy} onClick={() => setStatus(ids, 'cancelled')} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-rose-800 disabled:opacity-40">
                <X className="h-4 w-4" aria-hidden /> ביטול
              </button>
            </div>
          )}
        </div>
      )}
      {message && <p role="status" className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">{message}</p>}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} rows={exportRows} exportHref={exportHref} canEdit={canEdit}
        onDone={m => { setExportOpen(false); setMessage(m); setSelected(new Set()); router.refresh() }} />
      <KvitelPreview open={!!previewRow} onClose={() => setPreviewRow(null)} lines={previewRow ? kvitelRequestLines(previewRow) : []}
        title={previewRow?.contact_name ? `הבקשה של ${previewRow.contact_name} בקובץ` : 'הבקשה בקובץ'} />

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">אין בקשות בסינון הזה.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(r => (
            <li key={r.id} className={`rounded-xl border bg-white p-4 shadow-sm sm:p-5 ${selected.has(r.id) ? 'border-[#1B3256] ring-1 ring-[#1B3256]' : 'border-slate-200'}`}>
              <div className="flex items-start gap-3">
                {canEdit && (
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-1 h-4 w-4 shrink-0" aria-label={`בחירת הבקשה של ${r.contact_name || dateFmt.format(new Date(r.submitted_at))}`} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span className={`rounded-full px-2.5 py-0.5 font-medium ${STATUS_STYLE[r.status]}`}>{KVITEL_STATUSES[r.status]}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700">{KVITEL_CHANNELS[r.channel]}</span>
                    <span>{dateFmt.format(new Date(r.submitted_at))}</span>
                    {r.kvitel_request_lines.length > 0 && (
                      <button type="button" onClick={() => setPreviewRow(r)}
                        className="ms-auto flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-[#1B3256] hover:bg-slate-50">
                        <Eye className="h-3.5 w-3.5" aria-hidden /> תצוגה
                      </button>
                    )}
                  </div>
                  {(r.contact_name || r.contact_phone || r.contact_email) && (
                    <p className="mt-1.5 break-words text-sm text-slate-600">
                      {r.contact_name && <span className="font-medium text-slate-800">{r.contact_name}</span>}
                      {r.contact_phone && <> · <span dir="ltr">{r.contact_phone}</span></>}
                      {r.contact_email && <> · <span dir="ltr">{r.contact_email}</span></>}
                    </p>
                  )}
                  <ol className="mt-3 space-y-1.5">
                    {r.kvitel_request_lines.map(l => (
                      <li key={l.id} className="break-words border-s-2 border-[#1B3256]/20 ps-3 text-base text-slate-900">
                        {formatLine({ name: l.name, relation: l.relation, parentName: l.parent_name, requestType: l.request_type, requestNote: l.request_note })}
                        {l.flagged && <span className="ms-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900">{l.flag_reason || 'לבדיקה'}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
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
