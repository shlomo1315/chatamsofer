'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileDown, Check, RotateCcw, X, Filter, Link2, AlertTriangle, ChevronLeft, RefreshCw } from 'lucide-react'
import { KVITEL_CHANNELS, KVITEL_REQUEST_OPTIONS, KVITEL_STATUSES, requestTypeLabel, type KvitelStatus } from '@/lib/kvitel'
import { kvitelRequestLines, type KvitelFilters, type KvitelLineRow, type KvitelRequestRow } from '@/lib/kvitelQuery'
import { ListTable } from '@/components/admin/system/ListTable'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'
import { useTablePagination } from '@/lib/useTablePagination'
import { countByStatus, hebrewDay, lineMissing, reviewReason } from '@/lib/kvitelView'
import KvitelCardModal from './KvitelCardModal'
import ExportDialog from './ExportDialog'
import KvitelPreview from './KvitelPreview'

// כל סטטוס: צבע רקע וטקסט של הגלולה + צבע הנקודה
const STATUS_STYLE: Record<KvitelStatus, { pill: string; dot: string }> = {
  review: { pill: 'bg-[#FBEFD2] text-[#8A5A00]', dot: 'bg-[#C0912F]' },
  pending: { pill: 'bg-[#E4EBF6] text-[#2C4A7A]', dot: 'bg-[#2C4A7A]' },
  done: { pill: 'bg-[#E3F0E9] text-[#2F6B4F]', dot: 'bg-[#2F6B4F]' },
  cancelled: { pill: 'bg-line text-[#7A7F8C]', dot: 'bg-[#7A7F8C]' },
}
type Tab = 'all' | KvitelStatus
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'כל הבקשות' }, { key: 'review', label: 'דורש בדיקה' }, { key: 'pending', label: 'ממתין לשליחה' },
  { key: 'done', label: 'נשלח לציון' }, { key: 'cancelled', label: 'בוטל' },
]

export function StatusPill({ status }: { status: KvitelStatus }) {
  const st = STATUS_STYLE[status]
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} aria-hidden />{KVITEL_STATUSES[status]}</span>
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

// במובייל: כרטיס לכל בקשה (מגיש וסטטוס, שמות, תאריך). הטבלה מוסתרת מתחת ל-md.
function MobileCards({ rows, onOpen }: { rows: KvitelRequestRow[]; onOpen: (r: KvitelRequestRow) => void }) {
  if (!rows.length) return <p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-ink-faint md:hidden">אין בקשות בסינון הזה.</p>
  return (
    <ul className="space-y-2 md:hidden">
      {rows.map(r => (
        <li key={r.id}>
          <button type="button" onClick={() => onOpen(r)} className={`grid w-full gap-2 rounded-xl border border-line bg-white p-4 text-start ${r.status === 'review' ? 'border-s-[3px] border-s-[#C0912F]' : ''}`}>
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0"><span className="block font-medium text-ink">{r.contact_name || 'מגיש לא ידוע'}</span>{r.contact_phone && <span dir="ltr" className="block text-end text-xs text-ink-soft">{r.contact_phone}</span>}</span>
              <StatusPill status={r.status} />
            </span>
            <NamesCell r={r} />
            <span className="flex items-center justify-between text-xs text-ink-faint"><span>{dateFmt.format(new Date(r.submitted_at))} · {hebrewDay(r.submitted_at)}</span><ChevronLeft className="h-4 w-4" aria-hidden /></span>
          </button>
        </li>
      ))}
    </ul>
  )
}

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
  const reason = r.status === 'review' ? reviewReason(r) : null
  if (!ls.length) return <span className="text-xs font-semibold text-[#8A5A00]">⚠ לא נקלטו שמות{reason && reason !== 'לא נקלטו שמות' ? ` · ${reason}` : ''}</span>
  return (
    <div className="min-w-48 space-y-0.5 text-ink">
      {ls.slice(0, 2).map(l => (
        <div key={l.id} className={`break-words ${lineMissing(l) ? 'font-medium text-[#8A5A00]' : ''}`}>{lineMissing(l) && '⚠ '}{personOf(l)}</div>
      ))}
      {ls.length > 2 && <div className="text-xs text-ink-faint">ועוד {ls.length - 2} שמות</div>}
      {reason && <div className="text-xs font-semibold text-[#8A5A00]">{reason}</div>}
    </div>
  )
}

// מגיש: שם, ומתחתיו טלפון ומייל. פס זהב בצד לבקשה שדורשת בדיקה.
function ContactCell({ r }: { r: KvitelRequestRow }) {
  return (
    <div className={`-my-3 -ms-3 min-w-36 px-3 py-3 ${r.status === 'review' ? 'border-s-[3px] border-[#C0912F]' : ''}`}>
      <div className="font-medium text-ink">{r.contact_name || 'מגיש לא ידוע'}</div>
      {r.contact_phone && <div dir="ltr" className="text-end text-xs tabular-nums text-ink-soft">{r.contact_phone}</div>}
      {r.contact_email && <div dir="ltr" className="break-all text-end text-xs text-ink-faint">{r.contact_email}</div>}
    </div>
  )
}

const dayFmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })
function DateCell({ iso }: { iso: string }) {
  const d = new Date(iso)
  return (
    <div className="tabular-nums text-ink-soft">
      <div>{dayFmt.format(d)} · {timeFmt.format(d)}</div>
      <div className="text-xs text-ink-faint">{hebrewDay(iso)}</div>
    </div>
  )
}

export default function KvitelClient({ allRows, filters, canEdit, isAdmin }: { allRows: KvitelRequestRow[]; filters: KvitelFilters; canEdit: boolean; isAdmin: boolean }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [previewRow, setPreviewRow] = useState<KvitelRequestRow | null>(null)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const counts = useMemo(() => countByStatus(allRows), [allRows])
  // הלשונית הראשונה: מה שנבחר בכתובת, ובברירת מחדל "דורש בדיקה" כשיש, אחרת "כל הבקשות".
  const [tab, setTab] = useState<Tab>(filters.status === 'open' ? (counts.review ? 'review' : 'all') : filters.status)
  const rows = useMemo(() => (tab === 'all' ? allRows : allRows.filter(r => r.status === tab)), [allRows, tab])
  const emptyCount = allRows.filter(r => r.status !== 'cancelled' && r.status !== 'done' && !r.kvitel_request_lines.length).length
  const tc = useTableColumns<ColKey, KvitelRequestRow>('kvitel', COLUMNS, { sortFilter: { mode: 'client', rows } })
  const pg = useTablePagination(tc.rows)

  const lineCount = useMemo(() => rows.reduce((n, r) => n + r.kvitel_request_lines.length, 0), [rows])
  const filtersActive = !!(filters.from || filters.to || filters.channel || filters.type || filters.q)
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

  async function reprocess() {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin/kvitel/nedarim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'reprocess' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMessage(d.error || 'העיבוד מחדש נכשל'); return }
      setMessage(`נבדקו ${d.checked} בקשות בלי שמות: ${d.fixed} הושלמו · ${d.stillEmpty} עדיין בלי שמות · ${d.missing} לא נמצאו בנדרים`)
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

  const exportHref = `/api/admin/kvitel/export?${filtersToQuery({ ...filters, status: tab }, selected.size ? { ids: [...selected].join(',') } : {})}`
  const ids = [...selected]
  const exportRows = selected.size ? rows.filter(r => selected.has(r.id)) : rows

  return (
    <div className="space-y-5">
      <form method="get" className="rounded-xl border border-line bg-white p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

      <div role="tablist" aria-label="סינון לפי סטטוס" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {TABS.map(t => {
          const on = tab === t.key
          const gold = t.key === 'review'
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => { setTab(t.key); setSelected(new Set()) }}
              className={`rounded-xl border px-4 py-3 text-start transition-colors ${on ? (gold ? 'border-[#C0912F] bg-[#F3E9CF]' : 'border-navy bg-navy text-white') : 'border-line bg-white hover:bg-sand'}`}>
              <div className={`text-[13px] ${on && !gold ? 'text-white/80' : 'text-ink-soft'}`}>{t.label}</div>
              <div className={`text-2xl font-bold tabular-nums ${on ? (gold ? 'text-navy' : 'text-white') : gold && counts.review ? 'text-[#8A5A00]' : 'text-navy'}`}>{counts[t.key]}</div>
            </button>
          )
        })}
      </div>

      {emptyCount > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#C0912F]/40 bg-[#F3E9CF] px-4 py-3 text-sm text-navy">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#8A5A00]" aria-hidden />
          <span className="font-semibold">{emptyCount} בקשות נקלטו בלי שמות</span>
          {isAdmin && (
            <button type="button" onClick={() => void reprocess()} disabled={busy}
              className="ms-auto flex items-center gap-1.5 rounded-lg border border-[#C0912F] bg-white px-3 py-1.5 font-semibold text-navy disabled:opacity-40">
              <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden /> עיבוד מחדש
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
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

      <div className="hidden md:block">
      <ListTable tc={tc} rows={pg.rows} pg={pg} empty="אין בקשות בסינון הזה."
        onOpen={r => setOpenIdx(tc.rows.findIndex(x => x.id === r.id))}
        toolbar={<h2 className="font-bold text-navy">בקשות קוויטל <span className="text-sm font-normal text-ink-faint">· {rows.length} בקשות · {lineCount} שמות</span></h2>}
        renderCell={(c, r) => {
          switch (c.key) {
            case 'status': return <StatusPill status={r.status} />
            case 'channel': return <span className="text-ink-soft">{KVITEL_CHANNELS[r.channel]}</span>
            case 'date': return <DateCell iso={r.submitted_at} />
            case 'contact': return <ContactCell r={r} />
            case 'phone': return <span dir="ltr" className="tabular-nums text-ink-soft">{r.contact_phone || '—'}</span>
            case 'email': return <span dir="ltr" className="break-all text-ink-soft">{r.contact_email || '—'}</span>
            case 'names': return <NamesCell r={r} />
            case 'request': return requestsOf(r) ? <span className="inline-block rounded-full bg-sand px-2.5 py-0.5 text-xs text-navy">{requestsOf(r)}</span> : <span className="text-ink-faint">—</span>
            case 'count': return <span className="tabular-nums text-ink-soft">{r.kvitel_request_lines.length}</span>
          }
        }}
        actions={canEdit ? r => (
          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4"
            aria-label={`בחירת הבקשה של ${r.contact_name || dateFmt.format(new Date(r.submitted_at))}`} />
        ) : undefined}
        actionsHead="בחירה" />
      </div>
      <MobileCards rows={pg.rows} onOpen={r => setOpenIdx(tc.rows.findIndex(x => x.id === r.id))} />
      {openIdx !== null && tc.rows[openIdx] && (
        <KvitelCardModal rows={tc.rows} index={openIdx} onIndex={setOpenIdx} onClose={() => setOpenIdx(null)}
          canEdit={canEdit} busy={busy} setStatus={setStatus} approveWithDictionary={approveWithDictionary} onPreview={setPreviewRow}
          onSaved={m => { setMessage(m); router.refresh() }} />
      )}
    </div>
  )
}
