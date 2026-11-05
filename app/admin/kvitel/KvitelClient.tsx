'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileDown, Check, RotateCcw, X, Filter, Link2 } from 'lucide-react'
import { KVITEL_CHANNELS, KVITEL_REQUEST_OPTIONS, KVITEL_STATUSES, requestTypeLabel, type KvitelStatus } from '@/lib/kvitel'
import { kvitelRequestLines, type KvitelFilters, type KvitelLineRow, type KvitelRequestRow } from '@/lib/kvitelQuery'
import { ListTable } from '@/components/admin/system/ListTable'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'
import { useTablePagination } from '@/lib/useTablePagination'
import KvitelCardModal from './KvitelCardModal'
import ExportDialog from './ExportDialog'
import KvitelPreview from './KvitelPreview'

const STATUS_STYLE: Record<KvitelStatus, string> = {
  review: 'bg-gold-soft text-navy',
  pending: 'bg-sand text-navy',
  done: 'bg-navy text-white',
  cancelled: 'bg-line text-ink-soft',
}

type ColKey = 'status' | 'channel' | 'date' | 'contact' | 'phone' | 'email' | 'names' | 'request' | 'count'
const personOf = (l: KvitelLineRow) => `${l.name} ${l.relation === 'bat' ? 'בת' : 'בן'} ${l.parent_name}`.trim()
const requestsOf = (r: KvitelRequestRow) => [...new Set(r.kvitel_request_lines.map(l => (l.request_type === 'other' ? l.request_note || 'אחר' : requestTypeLabel(l.request_type))))].join(', ')
const COLUMNS: ColDef<ColKey, KvitelRequestRow>[] = [
  { key: 'status', label: 'סטטוס', def: true, kind: 'enum', filterable: true, value: r => KVITEL_STATUSES[r.status] },
  { key: 'contact', label: 'מגיש', def: true, value: r => r.contact_name || null },
  { key: 'phone', label: 'טלפון', def: true, value: r => r.contact_phone },
  { key: 'names', label: 'שמות (שם, בן/בת, שם האם)', def: true, value: r => r.kvitel_request_lines.map(personOf).join(' · ') || null },
  { key: 'request', label: 'בקשה', def: true, value: r => requestsOf(r) || null },
  { key: 'date', label: 'הוגשה', def: true, value: r => r.submitted_at },
  { key: 'channel', label: 'ערוץ', def: true, kind: 'enum', filterable: true, value: r => KVITEL_CHANNELS[r.channel] },
  { key: 'email', label: 'מייל', def: false, value: r => r.contact_email },
  { key: 'count', label: 'מס׳ שמות', def: false, kind: 'number', value: r => r.kvitel_request_lines.length },
]

const field = 'w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm text-ink'
const label = 'flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-soft'
const dateFmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' })

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

// עד שלושה שמות בתא, והשאר בספירה. הכרטסת מציגה הכול.
function NamesCell({ r }: { r: KvitelRequestRow }) {
  const ls = r.kvitel_request_lines
  if (!ls.length) return <span className="rounded bg-gold-soft px-1.5 py-0.5 text-xs text-navy">לא זוהו שמות</span>
  return (
    <div className="min-w-48 space-y-0.5 text-ink">
      {ls.slice(0, 3).map(l => (
        <div key={l.id} className="break-words">{personOf(l)}{l.flagged && <span className="ms-1.5 rounded bg-gold-soft px-1 text-xs text-navy">לבדיקה</span>}</div>
      ))}
      {ls.length > 3 && <div className="text-xs text-ink-faint">ועוד {ls.length - 3}</div>}
    </div>
  )
}

export default function KvitelClient({ rows, filters, canEdit }: { rows: KvitelRequestRow[]; filters: KvitelFilters; canEdit: boolean }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [previewRow, setPreviewRow] = useState<KvitelRequestRow | null>(null)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const tc = useTableColumns<ColKey, KvitelRequestRow>('kvitel', COLUMNS, { sortFilter: { mode: 'client', rows } })
  const pg = useTablePagination(tc.rows)

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

  function copyFormLink() {
    const url = `${window.location.origin}/kvitel`
    const done = () => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500) }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => window.prompt('העתק את הקישור:', url))
    } else {
      window.prompt('העתק את הקישור:', url)
    }
  }

  const exportHref = `/api/admin/kvitel/export?${filtersToQuery(filters, selected.size ? { ids: [...selected].join(',') } : {})}`
  const ids = [...selected]
  const exportRows = selected.size ? rows.filter(r => selected.has(r.id)) : rows

  return (
    <div className="space-y-5">
      <form method="get" className="rounded-xl border border-line bg-white p-4 sm:p-5">
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
          {filtersActive && <a href="/admin/kvitel" className="text-sm text-ink-soft underline-offset-4 hover:underline">ניקוי הסינון</a>}
          <button type="submit" className="flex items-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white">
            <Filter className="h-4 w-4" aria-hidden /> סינון
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-sand px-3 py-1 text-ink"><strong>{rows.length}</strong> בקשות</span>
          <span className="rounded-full bg-sand px-3 py-1 text-ink"><strong>{lineCount}</strong> שמות</span>
          {reviewCount > 0 && <span className="rounded-full bg-gold-soft px-3 py-1 font-semibold text-navy">{reviewCount} לבדיקה</span>}
        </div>
        <button type="button" onClick={copyFormLink}
          className="ms-auto flex items-center gap-2 rounded-lg border border-line-strong bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm">
          {linkCopied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
          {linkCopied ? 'הקישור הועתק' : 'העתק קישור למילוי קוויטלאך'}
        </button>
        <button type="button" onClick={() => { setMessage(''); setExportOpen(true) }} disabled={!rows.length}
          className="flex items-center gap-2 rounded-lg bg-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-40">
          <FileDown className="h-4 w-4" aria-hidden />
          {selected.size ? `ייצוא ${selected.size} שנבחרו` : 'ייצוא'}
        </button>
      </div>

      {canEdit && rows.length > 0 && (
        <div className={`sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border p-3 backdrop-blur ${selected.size ? 'border-navy/30 bg-sand' : 'border-line bg-white/95'}`}>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)))} className="h-4 w-4" />
            {selected.size ? `נבחרו ${selected.size}` : 'בחירת הכול'}
          </label>
          {selected.size > 0 && (
            <div className="ms-auto flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => setStatus(ids, 'done')} className="flex items-center gap-1 rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
                <Check className="h-4 w-4" aria-hidden /> נשלח לציון
              </button>
              <button disabled={busy} onClick={() => setStatus(ids, 'pending')} className="flex items-center gap-1 rounded-lg border border-line-strong bg-white px-3 py-2 text-sm text-ink disabled:opacity-40">
                <RotateCcw className="h-4 w-4" aria-hidden /> אישור / החזרה לממתין
              </button>
              <button disabled={busy} onClick={() => setStatus(ids, 'cancelled')} className="flex items-center gap-1 rounded-lg border border-line-strong bg-white px-3 py-2 text-sm text-ink-soft disabled:opacity-40">
                <X className="h-4 w-4" aria-hidden /> ביטול
              </button>
            </div>
          )}
        </div>
      )}
      {message && <p role="status" className="rounded-lg bg-sand px-4 py-2.5 text-sm text-navy">{message}</p>}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} rows={exportRows} exportHref={exportHref} canEdit={canEdit}
        onDone={m => { setExportOpen(false); setMessage(m); setSelected(new Set()); router.refresh() }} />
      <KvitelPreview open={!!previewRow} onClose={() => setPreviewRow(null)} lines={previewRow ? kvitelRequestLines(previewRow) : []}
        title={previewRow?.contact_name ? `הבקשה של ${previewRow.contact_name} בקובץ` : 'הבקשה בקובץ'}
        downloadHref={previewRow && (previewRow.status === 'pending' || previewRow.status === 'done')
          ? `/api/admin/kvitel/export?status=all&ids=${previewRow.id}` : undefined}
        downloadNote="אפשר להוריד את הקובץ אחרי שהבקשה מאושרת." />

      <ListTable tc={tc} rows={pg.rows} pg={pg} empty="אין בקשות בסינון הזה."
        onOpen={r => setOpenIdx(tc.rows.findIndex(x => x.id === r.id))}
        toolbar={<h2 className="font-bold text-navy">בקשות קוויטל</h2>}
        renderCell={(c, r) => {
          switch (c.key) {
            case 'status': return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{KVITEL_STATUSES[r.status]}</span>
            case 'channel': return <span className="text-ink-soft">{KVITEL_CHANNELS[r.channel]}</span>
            case 'date': return <span className="tabular-nums text-ink-soft">{dateFmt.format(new Date(r.submitted_at))}</span>
            case 'contact': return <span className="font-medium text-ink">{r.contact_name || '—'}</span>
            case 'phone': return <span dir="ltr" className="tabular-nums text-ink-soft">{r.contact_phone || '—'}</span>
            case 'email': return <span dir="ltr" className="break-all text-ink-soft">{r.contact_email || '—'}</span>
            case 'names': return <NamesCell r={r} />
            case 'request': return <span className="text-ink-soft">{requestsOf(r) || '—'}</span>
            case 'count': return <span className="tabular-nums text-ink-soft">{r.kvitel_request_lines.length}</span>
          }
        }}
        actions={canEdit ? r => (
          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4"
            aria-label={`בחירת הבקשה של ${r.contact_name || dateFmt.format(new Date(r.submitted_at))}`} />
        ) : undefined}
        actionsHead="בחירה" />
      {openIdx !== null && tc.rows[openIdx] && (
        <KvitelCardModal rows={tc.rows} index={openIdx} onIndex={setOpenIdx} onClose={() => setOpenIdx(null)}
          canEdit={canEdit} busy={busy} setStatus={setStatus} approveWithDictionary={approveWithDictionary} onPreview={setPreviewRow} />
      )}
    </div>
  )
}
