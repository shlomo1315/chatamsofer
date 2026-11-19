'use client'

import { useMemo, useState, type ReactNode } from 'react'
import KvitelRecordingPanel from './KvitelRecordingPanel'
import { FileDown, Printer, Check, RotateCcw, X, Filter, Link2, ChevronLeft, Search, CalendarDays, Pencil, Mic } from 'lucide-react'
import { KVITEL_CHANNELS, KVITEL_REQUEST_OPTIONS, KVITEL_STATUSES, requestTypeLabel, type KvitelStatus } from '@/lib/kvitel'
import { kvitelRequestLines, type KvitelFilters, type KvitelLineRow, type KvitelRequestRow } from '@/lib/kvitelQuery'
import { ListTable } from '@/components/admin/system/ListTable'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'
import { useTablePagination } from '@/lib/useTablePagination'
import { byKvitelTab, countByStatus, hebrewDay, KVITEL_DEFAULT_TAB, scopeKvitelRows, type KvitelTab } from '@/lib/kvitelView'
import { InlineText, InlineRequest } from './KvitelInlineCell'
import { saveInlineEdit, personText, PERSON_HINT, type InlineEdit } from '@/lib/kvitelInlineEdit'
import KvitelCardModal from './KvitelCardModal'
import ExportDialog from './ExportDialog'
import PrintNewDialog from './PrintNewDialog'
import KvitelPreview from './KvitelPreview'

// כל סטטוס: צבע רקע וטקסט של הגלולה + צבע הנקודה
const STATUS_STYLE: Record<KvitelStatus, { pill: string; dot: string }> = {
  review: { pill: 'bg-[#E4EBF6] text-[#2C4A7A]', dot: 'bg-[#2C4A7A]' },
  pending: { pill: 'bg-[#E4EBF6] text-[#2C4A7A]', dot: 'bg-[#2C4A7A]' },
  done: { pill: 'bg-[#E3F0E9] text-[#2F6B4F]', dot: 'bg-[#2F6B4F]' },
  cancelled: { pill: 'bg-line text-[#7A7F8C]', dot: 'bg-[#7A7F8C]' },
}
type Tab = KvitelTab

export function StatusPill({ status }: { status: KvitelStatus }) {
  const st = STATUS_STYLE[status]
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} aria-hidden />{KVITEL_STATUSES[status]}</span>
}

type ColKey = 'status' | 'channel' | 'date' | 'contact' | 'phone' | 'email' | 'names' | 'request' | 'count'
const personOf = (l: KvitelLineRow) => `${l.name} ${l.relation === 'bat' ? 'בת' : 'בן'} ${l.parent_name}`.trim()
const requestsOf = (r: KvitelRequestRow) => [...new Set(r.kvitel_request_lines.map(l => (l.request_type === 'other' ? l.request_note || 'אחר' : requestTypeLabel(l.request_type))))].join(', ')
const COLUMNS: ColDef<ColKey, KvitelRequestRow>[] = [
  { key: 'names', label: 'שמות', def: true, weight: 2.4, value: r => r.kvitel_request_lines.map(personOf).join(' · ') || null },
  { key: 'request', label: 'בקשה', def: true, weight: 1, value: r => requestsOf(r) || null },
  { key: 'contact', label: 'מגיש', def: true, weight: 1.3, value: r => r.contact_name || null },
  { key: 'channel', label: 'ערוץ', def: true, weight: 0.7, kind: 'enum', filterable: true, value: r => KVITEL_CHANNELS[r.channel] },
  { key: 'date', label: 'הוגשה', def: true, weight: 0.9, value: r => r.submitted_at },
  { key: 'status', label: 'סטטוס', def: true, weight: 1, kind: 'enum', filterable: true, value: r => KVITEL_STATUSES[r.status] },
  { key: 'phone', label: 'טלפון', def: false, value: r => r.contact_phone },
  { key: 'email', label: 'מייל', def: false, value: r => r.contact_email },
  { key: 'count', label: 'מס׳ שמות', def: false, kind: 'number', value: r => r.kvitel_request_lines.length },
]

// עמודות שנערכות בתוך התא: לחיצה בהן לא פותחת את הכרטסת
const INLINE_COLS = new Set<ColKey>(['names', 'request', 'contact', 'phone', 'email'])

const field = 'w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm text-ink'
const label = 'flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-soft'
const dateFmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' })

// במובייל: כרטיס לכל בקשה (מגיש וסטטוס, שמות, תאריך). הטבלה מוסתרת מתחת ל-md.
function MobileCards({ rows, canEdit, onOpen, onApprove }: { rows: KvitelRequestRow[]; canEdit: boolean; onOpen: (r: KvitelRequestRow, editing?: boolean) => void; onApprove: (r: KvitelRequestRow) => void }) {
  if (!rows.length) return <p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-ink-faint md:hidden">אין בקשות בסינון הזה.</p>
  return (
    <ul className="space-y-2 md:hidden">
      {rows.map(r => (
        <li key={r.id}>
          <button type="button" onClick={() => onOpen(r)} className={`grid w-full gap-2 rounded-xl border border-line bg-white p-4 text-start`}>
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 flex-1"><NamesCell r={r} /></span>
              <StatusCell r={r} />
            </span>
            <span className="flex items-center justify-between text-xs text-ink-faint"><span>{KVITEL_CHANNELS[r.channel]} · {r.contact_name || 'מגיש לא ידוע'} · {dateFmt.format(new Date(r.submitted_at))}</span><ChevronLeft className="h-4 w-4" aria-hidden /></span>
          </button>
          {canEdit && (
            <div className="mt-1 flex gap-2">
              {r.needsReview && <button type="button" onClick={() => onApprove(r)} className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[#17663F] px-3 text-[13px] font-semibold text-white"><Check className="h-4 w-4" aria-hidden /> אישור</button>}
              <button type="button" onClick={() => onOpen(r, true)} className="flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-white px-3 text-[13px] font-semibold text-navy"><Pencil className="h-4 w-4" aria-hidden /> תיקון</button>
            </div>
          )}
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

type Save = (edit: InlineEdit) => Promise<string | null>
// "הוספה" בתא ריק: מופיע רק בריחוף על השורה, כדי שתאים ריקים לא יעמיסו על הטבלה
const addHint = (text = 'הוספה') => <span className="text-xs text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">+ {text}</span>

// במובייל: עד שלושה שמות, והשאר בספירה. בטבלה (save): כל השמות, כל שם בשורה משלו ונפתח לעריכה בלחיצה.
function NamesCell({ r, save }: { r: KvitelRequestRow; save?: Save }) {
  const ls = r.kvitel_request_lines
  if (!save) {
    if (!ls.length) return <span className="text-sm text-ink-faint">לא נקלטו שמות</span>
    return (
      <div className="min-w-48 space-y-0.5 text-ink">
        {ls.slice(0, 3).map(l => <div key={l.id} className="break-words">{personOf(l)}</div>)}
        {ls.length > 3 && <div className="text-xs text-ink-faint">ועוד {ls.length - 3}</div>}
      </div>
    )
  }
  return (
    <div className="min-w-52 space-y-0.5 text-ink">
      {ls.map((l, i) => (
        <InlineText key={l.id} label={`השם ${personText(l)}`} value={personText(l)} placeholder={PERSON_HINT}
          onSave={text => save({ kind: 'line', index: i, text })}>
          <span className="break-words">{personText(l)}</span>
        </InlineText>
      ))}
      <InlineText label="שם חדש" value="" placeholder={PERSON_HINT} onSave={text => save({ kind: 'add', text })}>
        {ls.length ? addHint('הוספת שם') : <span className="text-sm text-ink-faint">לא נקלטו שמות · הוספה</span>}
      </InlineText>
    </div>
  )
}

function RequestCell({ r, save }: { r: KvitelRequestRow; save: Save | null }) {
  const text = requestsOf(r)
  const view = text ? <span className="inline-block rounded-full bg-sand px-2.5 py-0.5 text-xs text-navy">{text}</span> : null
  if (!save || !r.kvitel_request_lines.length) return view
  const first = r.kvitel_request_lines[0]
  return (
    <InlineRequest type={first.request_type} note={first.request_note ?? ''}
      onSave={(requestType, requestNote) => save({ kind: 'request', requestType, requestNote })}>
      {view ?? addHint()}
    </InlineRequest>
  )
}

// מגיש: שם, ומתחתיו טלפון ומייל. כל שדה נפתח לעריכה בנפרד; שדה ריק לא תופס מקום עד הריחוף.
function ContactCell({ r, save }: { r: KvitelRequestRow; save: Save | null }) {
  if (!save) {
    return (
      <div className="min-w-36">
        {r.contact_name && <div className="font-medium text-ink">{r.contact_name}</div>}
        {r.contact_phone && <div dir="ltr" className="text-end text-xs tabular-nums text-ink-soft">{r.contact_phone}</div>}
        {r.contact_email && <div dir="ltr" className="break-all text-end text-xs text-ink-faint">{r.contact_email}</div>}
      </div>
    )
  }
  // בלי שם: רמז ההוספה בסוף התא, כדי שלא תיפתח שורה ריקה מעל הטלפון
  const name = (
    <InlineText label="שם המגיש" value={r.contact_name ?? ''} onSave={value => save({ kind: 'contact', field: 'name', value })}>
      {r.contact_name ? <span className="font-medium text-ink">{r.contact_name}</span> : addHint('שם המגיש')}
    </InlineText>
  )
  return (
    <div className="min-w-36 space-y-0.5">
      {r.contact_name && name}
      {r.contact_phone && <ContactField r={r} save={save} field="phone" />}
      {r.contact_email && <ContactField r={r} save={save} field="email" />}
      {!r.contact_name && name}
    </div>
  )
}

const CONTACT_LABEL = { phone: 'טלפון', email: 'מייל' } as const
function ContactField({ r, save, field, wide }: { r: KvitelRequestRow; save: Save | null; field: 'phone' | 'email'; wide?: boolean }) {
  const value = (field === 'phone' ? r.contact_phone : r.contact_email) ?? ''
  const cls = field === 'phone' ? 'tabular-nums' : 'break-all'
  const view = value ? <span dir="ltr" className={`block ${wide ? '' : 'text-end text-xs'} ${cls} text-ink-soft`}>{value}</span> : null
  if (!save) return view
  return (
    <InlineText label={CONTACT_LABEL[field]} value={value} dir="ltr" onSave={v => save({ kind: 'contact', field, value: v })}>
      {view ?? addHint(CONTACT_LABEL[field])}
    </InlineText>
  )
}

// סטטוס: בקשה שנקלטה כ"לבדיקה" מסומנת בתגית "לבדיקה" עד שמאשרים אותה; שאר הבקשות "לא נשלח" וכו'.
function StatusCell({ r }: { r: KvitelRequestRow }) {
  return <StatusPill status={r.needsReview ? 'review' : r.status} />
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

const stageCls = (on: boolean) => `flex flex-col gap-1.5 rounded-xl p-5 text-start transition-colors ${on ? 'bg-[#F7F0E3]' : 'hover:bg-[#FBFAF7]'}`
const btnPri = 'flex h-9 items-center gap-2 self-start rounded-[10px] bg-navy px-3 text-[13px] font-semibold text-white disabled:pointer-events-none disabled:opacity-40'
const btnSec = 'flex h-9 items-center gap-2 self-start rounded-[10px] border border-line bg-white px-3 text-[13px] font-semibold text-ink disabled:pointer-events-none disabled:opacity-40'
const CHANNEL_SEG: { key: string; label: string }[] = [
  { key: '', label: 'הכול' }, { key: 'web', label: 'לינק' }, { key: 'phone', label: 'טלפון' }, { key: 'email', label: 'מייל' }, { key: 'nedarim', label: 'נדרים' },
]
const STATUS_SEG: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'לא נשלח' }, { key: 'done', label: 'נשלח לציון' }, { key: 'cancelled', label: 'בוטלו' }, { key: 'all', label: 'הכול' },
]
const segBtn = (on: boolean) => `min-h-[38px] whitespace-nowrap rounded-lg px-3 text-sm ${on ? 'bg-white font-semibold text-navy shadow-sm' : 'text-ink-soft'}`

// embedded: הטבלה בתוך מסך "השבוע" — בלי הכותרת וכרטיסי השלבים, עם קוביית סטטוס בשורת הסינון.
// channel/onChannel: מקור שנבחר מבחוץ (פסי הערוצים בכרטיס "נכנסו השבוע").
export default function KvitelClient({ allRows, filters, canEdit, tabs, onReload, embedded, channel: channelIn, onChannel }: {
  allRows: KvitelRequestRow[]; filters: KvitelFilters; canEdit: boolean; tabs?: ReactNode; onReload: () => void
  embedded?: boolean; channel?: string; onChannel?: (channel: string) => void
}) {
  const router = { refresh: onReload }   // רענון = טעינה מחדש של הרשימה המעורבלת (KvitelRequests)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [previewRow, setPreviewRow] = useState<KvitelRequestRow | null>(null)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [openEditing, setOpenEditing] = useState(false)
  // שורות שנשמרו בעריכה בתוך הטבלה — מוצגות מיד, עד שהרשימה נטענת מחדש מהשרת
  const [saved, setSaved] = useState<Record<string, KvitelRequestRow>>({})
  const [savedFor, setSavedFor] = useState(allRows)
  if (savedFor !== allRows) { setSavedFor(allRows); setSaved({}) }
  const liveRows = useMemo(() => allRows.map(r => saved[r.id] ?? r), [allRows, saved])
  const [recordingId, setRecordingId] = useState<string | null>(null)   // הקלטה ותמלול inline בשורה
  const [datesOpen, setDatesOpen] = useState(false)
  const [q, setQ] = useState(filters.q ?? '')
  const [channelOwn, setChannelOwn] = useState<string>(filters.channel ?? '')
  const channel = channelIn ?? channelOwn
  const setChannel = onChannel ?? setChannelOwn
  const [type, setType] = useState<string>(filters.type ?? '')
  // הלשונית הראשונה: מה שנבחר בכתובת, ובברירת מחדל "לא נשלח".
  const [tab, setTab] = useState<Tab>(filters.status === 'open' || filters.status === 'review' ? KVITEL_DEFAULT_TAB : filters.status)

  // חיפוש, ערוץ וסוג מסוננים בדפדפן; התאריכים דרך הכתובת (השרת).
  const scoped = useMemo(() => scopeKvitelRows(liveRows, { channel, type, q }), [liveRows, q, channel, type])
  const counts = useMemo(() => countByStatus(scoped), [scoped])
  const rows = useMemo(() => byKvitelTab(scoped, tab), [scoped, tab])
  // תיבת הבחירה בראש השורה (צרה) ועמודת הפעולות בסופה. ':v2' מאפס רוחב שנשמר לפני הסידור החדש
  const tc = useTableColumns<ColKey, KvitelRequestRow>('kvitel', COLUMNS, { sortFilter: { mode: 'client', rows }, leadCol: canEdit, extraCols: 1, extraWeight: 0.5, idSuffix: ':v2' })
  const pg = useTablePagination(tc.rows)

  const stageLines = (st: KvitelStatus) => scoped.filter(r => r.status === st).reduce((n, r) => n + r.kvitel_request_lines.length, 0)
  const lineCount = useMemo(() => rows.reduce((n, r) => n + r.kvitel_request_lines.length, 0), [rows])
  const tabTitle = tab === 'all' ? 'כל הבקשות' : tab === 'pending' ? 'לא נשלח' : tab === 'done' ? 'נשלח לציון' : 'בוטלו'

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  // עריכה בתא: אותו נתיב שמירה (PUT /api/admin/kvitel/lines) — מחזיר שגיאה או null
  async function saveEdit(r: KvitelRequestRow, edit: InlineEdit): Promise<string | null> {
    const res = await saveInlineEdit(r, edit)
    if ('error' in res) return res.error
    setSaved(s => ({ ...s, [r.id]: res.row }))
    setMessage('התיקון נשמר')
    router.refresh()
    return null
  }
  const saveFor = (r: KvitelRequestRow): Save | null => (canEdit ? e => saveEdit(r, e) : null)
  const openRow = (r: KvitelRequestRow, editing = false) => { setOpenEditing(editing); setOpenIdx(tc.rows.findIndex(x => x.id === r.id)) }
  const pickTab = (t: Tab) => { setTab(t); setSelected(new Set()) }

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

  const ids = [...selected]
  // ייצוא: מה שנבחר, ואחרת כל מה שבתצוגה (הקובץ כולל רק בקשות שלא בוטלו)
  const exportRows = selected.size ? rows.filter(r => selected.has(r.id)) : scoped.filter(r => r.status !== 'cancelled')
  const exportHref = `/api/admin/kvitel/export?${filtersToQuery({ ...filters, status: 'all', channel: (channel || null) as KvitelFilters['channel'], type: type || null, q })}`

  return (
    <div className="space-y-5">
      {!embedded && <>
      <div className="border-b border-line pb-5">
        <p className="text-[13px] text-ink-soft">מחלקות / קוויטלאך</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[2.125rem] font-extrabold leading-[1.1] text-navy">קוויטלאך</h1>
            <p className="mt-1 text-sm text-ink-soft">שמות ובקשות לתפילה בציון, מכל הערוצים</p>
          </div>
          <button type="button" onClick={copyFormLink}
            className="flex h-11 items-center gap-2 rounded-[10px] border border-line bg-white px-[18px] text-sm font-semibold text-ink">
            {linkCopied ? <Check className="h-[18px] w-[18px]" aria-hidden /> : <Link2 className="h-[18px] w-[18px]" aria-hidden />}
            {linkCopied ? 'הקישור הועתק' : 'העתקת קישור לטופס'}
          </button>
        </div>
      </div>

      {tabs}

      <div>
        <div className="grid grid-cols-1 items-stretch rounded-[14px] border border-line bg-white sm:grid-cols-[1fr_auto_1fr]">
          <div role="button" tabIndex={0} onClick={() => pickTab('pending')} onKeyDown={e => { if (e.key === 'Enter') pickTab('pending') }} className={`${stageCls(tab === 'pending')} cursor-pointer`}>
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-soft"><span className="h-[9px] w-[9px] rounded-full bg-[#2C4A7A]" />לא נשלח<span className="text-[11px] text-ink-faint">שלב 1</span></span>
            <b className="text-[44px] font-extrabold leading-none tabular-nums text-navy">{counts.pending}</b>
            <p className="min-h-5 text-[13px] text-ink-soft">{stageLines('pending')} שמות מוכנים לקובץ.</p>
            <button type="button" disabled={!counts.pending} onClick={e => { e.stopPropagation(); setMessage(''); setPrintOpen(true) }} className={`${btnPri} mt-auto`}>
              <Printer className="h-[18px] w-[18px]" aria-hidden /> הדפסת {counts.pending} החדשים
            </button>
          </div>
          <div className="hidden place-items-center px-0.5 text-[#cfc8bb] sm:grid"><ChevronLeft className="h-[22px] w-[22px]" aria-hidden /></div>
          <div role="button" tabIndex={0} onClick={() => pickTab('done')} onKeyDown={e => { if (e.key === 'Enter') pickTab('done') }} className={`${stageCls(tab === 'done')} cursor-pointer`}>
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-soft"><span className="h-[9px] w-[9px] rounded-full bg-[#2F6B4F]" />נשלח לציון<span className="text-[11px] text-ink-faint">שלב 2</span></span>
            <b className="text-[44px] font-extrabold leading-none tabular-nums text-navy">{counts.done}</b>
            <p className="min-h-5 text-[13px] text-ink-soft">אפשר להוריד כל אחד מחדש.</p>
            <button type="button" disabled={!exportRows.length} onClick={e => { e.stopPropagation(); setMessage(''); setExportOpen(true) }} className={`${btnSec} mt-auto`}>
              <FileDown className="h-[18px] w-[18px]" aria-hidden /> {selected.size ? `ייצוא ${selected.size} שנבחרו` : 'ייצוא'}
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4 text-[13px] text-ink-soft">
          <button type="button" onClick={() => pickTab('all')} className={`underline underline-offset-[3px] ${tab === 'all' ? 'font-bold text-navy' : ''}`}>כל הבקשות ({counts.all})</button>
          <button type="button" onClick={() => pickTab('cancelled')} className={`underline underline-offset-[3px] ${tab === 'cancelled' ? 'font-bold text-navy' : ''}`}>בוטלו ({counts.cancelled})</button>
        </div>
      </div>
      </>}

      <div className="rounded-[14px] border border-line bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-11 min-w-0 flex-[1_1_260px] items-center gap-2.5 rounded-[10px] bg-[#F7F5F1] px-3.5 text-ink-soft">
            <Search className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="שם, שם האם, מגיש או טלפון" aria-label="חיפוש"
              className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none" />
          </label>
          {embedded && (
            <div role="group" aria-label="סטטוס" className="flex flex-wrap rounded-[10px] bg-[#F7F5F1] p-[3px]">
              {STATUS_SEG.map(t => (
                <button key={t.key} type="button" onClick={() => pickTab(t.key)} aria-pressed={tab === t.key} className={segBtn(tab === t.key)}>
                  {t.label} <span className="tabular-nums text-ink-faint">{counts[t.key]}</span>
                </button>
              ))}
            </div>
          )}
          <div role="group" aria-label="ערוץ" className="flex flex-wrap rounded-[10px] bg-[#F7F5F1] p-[3px]">
            {CHANNEL_SEG.map(c => (
              <button key={c.key} type="button" onClick={() => setChannel(c.key)} aria-pressed={channel === c.key} className={segBtn(channel === c.key)}>{c.label}</button>
            ))}
          </div>
          <select value={type} onChange={e => setType(e.target.value)} aria-label="סוג בקשה" className="h-11 rounded-[10px] border border-line bg-white px-3 text-sm text-ink">
            <option value="">כל סוגי הבקשות</option>
            {KVITEL_REQUEST_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <button type="button" onClick={() => setDatesOpen(o => !o)} aria-expanded={datesOpen}
            className="flex h-11 items-center gap-2 rounded-[10px] border border-line bg-white px-[18px] text-sm font-semibold text-ink">
            <CalendarDays className="h-[18px] w-[18px]" aria-hidden /> תאריכים{(filters.from || filters.to) ? ' •' : ''}
          </button>
        </div>
        {datesOpen && (
          <form method="get" className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
            <input type="hidden" name="tab" value="requests" />
            {channel && <input type="hidden" name="channel" value={channel} />}
            {type && <input type="hidden" name="type" value={type} />}
            {q && <input type="hidden" name="q" value={q} />}
            <label className={label}>מתאריך<input type="date" name="from" defaultValue={filters.from ?? ''} className={field} /></label>
            <label className={label}>עד תאריך<input type="date" name="to" defaultValue={filters.to ?? ''} className={field} /></label>
            <button type="submit" className="flex h-10 items-center gap-1.5 rounded-lg bg-navy px-4 text-sm font-semibold text-white"><Filter className="h-4 w-4" aria-hidden /> סינון</button>
            {(filters.from || filters.to) && <a href="/admin/kvitel?tab=requests" className="text-sm text-ink-soft underline-offset-4 hover:underline">ניקוי התאריכים</a>}
          </form>
        )}
      </div>

      {message && <p role="status" className="rounded-lg bg-sand px-4 py-2.5 text-sm text-navy">{message}</p>}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} rows={exportRows} exportHref={exportHref} exportIds={ids} canEdit={canEdit}
        onDone={m => { setExportOpen(false); setMessage(m); setSelected(new Set()); router.refresh() }} />
      <PrintNewDialog open={printOpen} onClose={() => setPrintOpen(false)} rows={allRows} canEdit={canEdit}
        onDone={m => { setPrintOpen(false); setMessage(m); router.refresh() }} />
      <KvitelPreview open={!!previewRow} onClose={() => setPreviewRow(null)} lines={previewRow ? kvitelRequestLines(previewRow) : []}
        title={previewRow?.contact_name ? `הבקשה של ${previewRow.contact_name} בקובץ` : 'הבקשה בקובץ'}
        downloadHref={previewRow && previewRow.status !== 'cancelled'
          ? '/api/admin/kvitel/export?status=all' : undefined}
        downloadIds={previewRow ? [previewRow.id] : undefined}
        downloadNote="אפשר להוריד את הקובץ אחרי שהבקשה אושרה." />

      <div className="overflow-hidden rounded-[14px] border border-line bg-white">
        {canEdit && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 bg-navy px-4 py-2.5 text-white">
            <b className="text-sm">נבחרו {selected.size}</b>
            <button disabled={busy} onClick={() => setStatus(ids, 'done')} className="flex h-9 items-center gap-2 rounded-[10px] bg-[#17663F] px-3 text-[13px] font-semibold disabled:opacity-40">
              <Check className="h-4 w-4" aria-hidden /> סימון כנשלח לציון
            </button>
            <button disabled={busy} onClick={() => setStatus(ids, 'pending')} className="flex h-9 items-center gap-2 rounded-[10px] border border-white/25 px-3 text-[13px] font-semibold disabled:opacity-40">
              <RotateCcw className="h-4 w-4" aria-hidden /> החזרה ללא נשלח
            </button>
            <button disabled={busy} onClick={() => setStatus(ids, 'cancelled')} className="flex h-9 items-center gap-2 rounded-[10px] border border-white/25 px-3 text-[13px] font-semibold disabled:opacity-40">
              <X className="h-4 w-4" aria-hidden /> ביטול
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="ms-auto text-[13px] text-[#aab3c5] underline underline-offset-[3px]">ניקוי הבחירה</button>
          </div>
        )}
        <div className="hidden md:block">
          <ListTable tc={tc} rows={pg.rows} pg={pg} empty="אין בקשות בסינון הזה."
            onOpen={r => openRow(r)}
            stopCell={c => canEdit && INLINE_COLS.has(c.key)}
            leadHead={canEdit ? <input type="checkbox" checked={pg.rows.length > 0 && pg.rows.every(r => selected.has(r.id))}
              onChange={e => setSelected(s => { const n = new Set(s); for (const r of pg.rows) { if (e.target.checked) n.add(r.id); else n.delete(r.id) } return n })}
              className="h-4 w-4 accent-navy" aria-label="בחירת כל הבקשות בעמוד" /> : undefined}
            leadCell={canEdit ? r => <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-0.5 h-4 w-4 accent-navy"
              aria-label={`בחירת הבקשה של ${r.contact_name || dateFmt.format(new Date(r.submitted_at))}`} /> : undefined}
            toolbar={<h2 className="font-bold text-navy">{tabTitle} <span className="text-sm font-normal text-ink-faint">· {rows.length} בקשות · {lineCount} שמות</span></h2>}
            renderCell={(c, r) => {
              switch (c.key) {
                case 'status': return <StatusCell r={r} />
                case 'channel': return <span className="text-ink-soft">{KVITEL_CHANNELS[r.channel]}</span>
                case 'date': return <DateCell iso={r.submitted_at} />
                case 'contact': return <ContactCell r={r} save={saveFor(r)} />
                case 'phone': return <ContactField r={r} save={saveFor(r)} field="phone" wide />
                case 'email': return <ContactField r={r} save={saveFor(r)} field="email" wide />
                case 'names': return canEdit ? <NamesCell r={r} save={e => saveEdit(r, e)} /> : <NamesCell r={r} />
                case 'request': return <RequestCell r={r} save={saveFor(r)} />
                case 'count': return <span className="tabular-nums text-ink-soft">{r.kvitel_request_lines.length}</span>
              }
            }}
            expandedRow={r => recordingId === r.id && r.recording_url ? (
              <KvitelRecordingPanel key={r.id} requestId={r.id} recordingUrl={r.recording_url} transcript={r.raw_text} needsReview={!!r.needsReview}
                editable={canEdit} onSaved={m => { setMessage(m); router.refresh() }} />
            ) : null}
            actions={r => (
              <div className="flex items-center gap-3">
                {r.recording_url && (
                  <button type="button" onClick={() => setRecordingId(id => (id === r.id ? null : r.id))} aria-expanded={recordingId === r.id} className="flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:border-[#cfc8bb]"
                    aria-label={`הקלטה ותמלול של הבקשה של ${r.contact_name || dateFmt.format(new Date(r.submitted_at))}`}>
                    <Mic className="h-4 w-4" aria-hidden /> הקלטה
                  </button>
                )}
                {canEdit && r.needsReview && (
                  <button type="button" disabled={busy} onClick={() => void setStatus([r.id], 'pending')} className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[#17663F] px-3 text-[13px] font-semibold text-white disabled:opacity-40"
                    aria-label={`אישור הבקשה של ${r.contact_name || dateFmt.format(new Date(r.submitted_at))}`}>
                    <Check className="h-4 w-4" aria-hidden /> אישור
                  </button>
                )}
              </div>
            )}
            actionsHead="" />
        </div>
      </div>
      <MobileCards rows={pg.rows} canEdit={canEdit} onOpen={(r, editing) => openRow(r, editing)} onApprove={r => void setStatus([r.id], 'pending')} />
      {openIdx !== null && tc.rows[openIdx] && (
        <KvitelCardModal rows={tc.rows} index={openIdx} onIndex={i => { setOpenIdx(i); setOpenEditing(false) }} onClose={() => setOpenIdx(null)} startEditing={openEditing}
          canEdit={canEdit} busy={busy} setStatus={setStatus} onPreview={setPreviewRow}
          onSaved={m => { setMessage(m); router.refresh() }} />
      )}
    </div>
  )
}
