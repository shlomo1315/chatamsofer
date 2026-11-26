'use client'

import { useMemo, useState, type ReactNode } from 'react'
import KvitelRecordingPanel from './KvitelRecordingPanel'
import KvitelPlayButton from './KvitelPlayButton'
import { recordingPlayable } from './useRecordingSrc'
import { Printer, Check, RotateCcw, X, Filter, Link2, ChevronLeft, ChevronDown, Search, CalendarDays, Pencil, FileText, Trash2 } from 'lucide-react'
import { KVITEL_CHANNELS, KVITEL_REQUEST_OPTIONS, KVITEL_STATUSES, requestTypeLabel, type KvitelStatus } from '@/lib/kvitel'
import { kvitelRequestLines, type KvitelFilters, type KvitelLineRow, type KvitelRequestRow } from '@/lib/kvitelQuery'
import { ListTable } from '@/components/admin/system/ListTable'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'
import { useTablePagination } from '@/lib/useTablePagination'
import { asApproved, bulkApproval, bulkApprovalMessage, byKvitelTab, countByStatus, hebrewDay, KVITEL_DEFAULT_TAB, kvitelRowActions, kvitelRowTone, needsApproval, nextToApprove, patchKvitelStatus, scopeKvitelRows, type KvitelTab } from '@/lib/kvitelView'
import { InlineText, InlineRequest } from './KvitelInlineCell'
import { saveInlineEdit, personText, PERSON_HINT, type InlineEdit } from '@/lib/kvitelInlineEdit'
import KvitelRowDetails from './KvitelRowDetails'
import PrintNewDialog from './PrintNewDialog'
import KvitelPreview from './KvitelPreview'
import KvitelDuplicates, { DupBadge, DupContext } from './KvitelDuplicates'
import { duplicateIndex, findDuplicateGroups } from '@/lib/kvitelDuplicates'

// כל סטטוס: צבע רקע וטקסט של הגלולה + צבע הנקודה
const STATUS_STYLE: Record<KvitelStatus, { pill: string; dot: string }> = {
  review: { pill: 'bg-[#E4EBF6] text-[#2C4A7A]', dot: 'bg-[#2C4A7A]' },
  pending: { pill: 'bg-[#E4EBF6] text-[#2C4A7A]', dot: 'bg-[#2C4A7A]' },
  done: { pill: 'bg-[#E3F0E9] text-[#2F6B4F]', dot: 'bg-[#2F6B4F]' },
  cancelled: { pill: 'bg-line text-[#7A7F8C]', dot: 'bg-[#7A7F8C]' },
}
type Tab = KvitelTab
// רקע כל השורה לפי kvitelRowTone: מאושרת — כחול בהיר (כמו תגית "לא נשלח"); נשלחה לציון (אחרי ייצוא לקוויטל) — ירוק בהיר
const ROW_TONE = { approved: 'bg-[#EEF3FA] hover:bg-[#E4EBF6]', sent: 'bg-[#F1F8F3] hover:bg-[#E3F0E9]' } as const
const CARD_TONE = { approved: 'bg-[#EEF3FA]', sent: 'bg-[#F1F8F3]' } as const
const rowTone = (r: KvitelRequestRow) => { const t = kvitelRowTone(r); return t ? ROW_TONE[t] : undefined }

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
// לחיצה על הכרטיס מרחיבה את הפרטים מתחתיו, ולחיצה נוספת מכווצת.
function MobileCards({ rows, canEdit, openId, details, onOpen, onApprove, onRemove }: {
  rows: KvitelRequestRow[]; canEdit: boolean; openId: string | null; details: (r: KvitelRequestRow) => ReactNode
  onOpen: (r: KvitelRequestRow, editing?: boolean) => void
  onApprove: (r: KvitelRequestRow) => void; onRemove: (r: KvitelRequestRow) => void
}) {
  if (!rows.length) return <p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-ink-faint md:hidden">אין בקשות בסינון הזה.</p>
  return (
    <ul className="space-y-2 md:hidden">
      {rows.map(r => {
        const open = openId === r.id
        const tone = kvitelRowTone(r)
        return (
          <li key={r.id} className={`rounded-xl border border-line ${tone ? CARD_TONE[tone] : 'bg-white'}`}>
            {/* בבקשה עם הקלטה: משולש השמעה במקום החץ (לחיצה על הכרטיס עדיין פותחת אותו) */}
            <div className="relative">
              <button type="button" onClick={() => onOpen(r)} aria-expanded={open} className="grid w-full gap-2 p-4 text-start">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1"><NamesCell r={r} /></span>
                  <StatusCell r={r} />
                </span>
                <span className="flex items-center justify-between text-xs text-ink-faint"><span>{KVITEL_CHANNELS[r.channel]} · {r.contact_name || 'מגיש לא ידוע'} · {dateFmt.format(new Date(r.submitted_at))}</span>
                  {recordingPlayable(r.recording_url) ? <span className="h-4 w-9" aria-hidden />
                    : open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronLeft className="h-4 w-4" aria-hidden />}</span>
              </button>
              {r.recording_url && <KvitelPlayButton url={r.recording_url} who={whoOf(r)} className="absolute bottom-2.5 left-3" />}
            </div>
            <RowActions r={r} canEdit={canEdit} onApprove={onApprove} onEdit={rr => onOpen(rr, true)} onRemove={onRemove} className="flex gap-2 px-4 pb-3" />
            {open && <div className="border-t border-line px-4 py-4">{details(r)}</div>}
          </li>
        )
      })}
    </ul>
  )
}

const rowBtn = 'flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:border-[#cfc8bb] disabled:opacity-40'
const whoOf = (r: KvitelRequestRow) => r.contact_name || dateFmt.format(new Date(r.submitted_at))

// אישור, תיקון ומחיקה בכל שורה — בטבלה ובכרטיסים במובייל, לפי kvitelRowActions.
// כפתור "אישור" רק בבקשה "לבדיקה"; בבקשה שכבר אושרה או נשלחה מוצגת תווית מצב (לא כפתור), באותו מקום.
function RowActions({ r, canEdit, busy, onApprove, onEdit, onRemove, className }: {
  r: KvitelRequestRow; canEdit: boolean; busy?: boolean; className: string
  onApprove: (r: KvitelRequestRow) => void; onEdit: (r: KvitelRequestRow) => void; onRemove: (r: KvitelRequestRow) => void
}) {
  const a = kvitelRowActions(r, canEdit)
  if (!a.edit) return null
  return (
    <div className={className}>
      {a.approve === 'button' && (
        <button type="button" disabled={busy} onClick={() => onApprove(r)} data-approve={r.id} className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[#17663F] px-3 text-[13px] font-semibold text-white hover:bg-[#12532F] disabled:opacity-40"
          aria-label={`אישור הבקשה של ${whoOf(r)}`}>
          <Check className="h-4 w-4" aria-hidden /> אישור
        </button>
      )}
      {(a.approve === 'approved' || a.approve === 'sent') && (
        <span className={`flex h-9 items-center gap-1.5 px-1 text-[13px] font-semibold ${a.approve === 'sent' ? 'text-[#17663F]' : 'text-ink-soft'}`}>
          <Check className="h-4 w-4" aria-hidden /> {a.approve === 'sent' ? 'נשלח לציון' : 'מאושר'}
        </span>
      )}
      <button type="button" disabled={busy} onClick={() => onEdit(r)} className={rowBtn} aria-label={`תיקון הבקשה של ${whoOf(r)}`}>
        <Pencil className="h-4 w-4" aria-hidden /> תיקון
      </button>
      {a.remove && (
        <button type="button" disabled={busy} onClick={() => onRemove(r)} className={`${rowBtn} text-[#9B2C2C]`} aria-label={`מחיקת הבקשה של ${whoOf(r)}`}>
          <Trash2 className="h-4 w-4" aria-hidden /> מחיקה
        </button>
      )}
    </div>
  )
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
        {ls.slice(0, 3).map(l => <div key={l.id} className="break-words">{personOf(l)}<DupBadge lineId={l.id} /></div>)}
        {ls.length > 3 && <div className="text-xs text-ink-faint">ועוד {ls.length - 3}</div>}
      </div>
    )
  }
  return (
    <div className="min-w-52 space-y-0.5 text-ink">
      {ls.map((l, i) => (
        <div key={l.id} className="flex flex-wrap items-center">
          <InlineText label={`השם ${personText(l)}`} value={personText(l)} placeholder={PERSON_HINT}
            onSave={text => save({ kind: 'line', index: i, text })}>
            <span className="break-words">{personText(l)}</span>
          </InlineText>
          <DupBadge lineId={l.id} />
        </div>
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
const CHANNEL_SEG: { key: string; label: string }[] = [
  { key: '', label: 'הכול' }, { key: 'web', label: 'לינק' }, { key: 'phone', label: 'טלפון' }, { key: 'email', label: 'מייל' }, { key: 'nedarim', label: 'נדרים' },
]
const STATUS_SEG: { key: Tab; label: string }[] = [
  { key: 'review', label: 'לבדיקה' }, { key: 'pending', label: 'לא נשלח' }, { key: 'done', label: 'נשלח לציון' }, { key: 'cancelled', label: 'בוטלו' }, { key: 'all', label: 'הכול' },
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
  // הפעולה האחרונה מהשורה (מחיקה או אישור) — "ביטול" בהודעה מחזיר את הבקשות לסטטוס שהיו בו
  const [undo, setUndo] = useState<{ ids: string[]; status: KvitelStatus; msg: string; undone: string } | null>(null)
  // בקשות שאושרו כאן: מוצגות מאושרות מיד, גם אם טעינה מהשרת שיצאה לפני האישור חוזרת אחריו
  const [approvedHere, setApprovedHere] = useState<Set<string>>(new Set())
  const [printOpen, setPrintOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [previewRow, setPreviewRow] = useState<KvitelRequestRow | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)   // הבקשה שמורחבת מתחת לשורה
  const [openEditing, setOpenEditing] = useState(false)
  // שורות שנשמרו בעריכה בתוך הטבלה — מוצגות מיד, עד שהרשימה נטענת מחדש מהשרת
  const [saved, setSaved] = useState<Record<string, KvitelRequestRow>>({})
  const [savedFor, setSavedFor] = useState(allRows)
  if (savedFor !== allRows) { setSavedFor(allRows); setSaved({}) }
  const liveRows = useMemo(() => allRows.map(r => {
    const x = saved[r.id] ?? r
    return approvedHere.has(r.id) && needsApproval(x) ? asApproved(x) : x
  }), [allRows, saved, approvedHere])
  // שמות כפולים בבקשות שעוד לא נשלחו — תגית ליד השם ולוח מיזוג ידני (KvitelDuplicates)
  const dupGroups = useMemo(() => findDuplicateGroups(liveRows), [liveRows])
  const [dupOpen, setDupOpen] = useState<string | null>(null)
  const dupCtx = useMemo(() => ({ index: duplicateIndex(dupGroups), open: setDupOpen }), [dupGroups])
  const [recordingId, setRecordingId] = useState<string | null>(null)   // הקלטה ותמלול inline בשורה
  const [datesOpen, setDatesOpen] = useState(false)
  const [q, setQ] = useState(filters.q ?? '')
  const [channelOwn, setChannelOwn] = useState<string>(filters.channel ?? '')
  const channel = channelIn ?? channelOwn
  const setChannel = onChannel ?? setChannelOwn
  const [type, setType] = useState<string>(filters.type ?? '')
  // הלשונית הראשונה: מה שנבחר בכתובת. בברירת מחדל "לבדיקה" כשיש בקשות שמחכות לאישור, ואחרת "לא נשלח".
  const [tab, setTab] = useState<Tab>(() => filters.status === 'review' || (filters.status === 'open' && allRows.some(needsApproval)) ? 'review'
    : filters.status === 'open' ? KVITEL_DEFAULT_TAB : filters.status)

  // חיפוש, ערוץ וסוג מסוננים בדפדפן; התאריכים דרך הכתובת (השרת).
  const scoped = useMemo(() => scopeKvitelRows(liveRows, { channel, type, q }), [liveRows, q, channel, type])
  const counts = useMemo(() => countByStatus(scoped), [scoped])
  // מה שאושר כאן נשאר ב"לבדיקה" במקומו, צבוע כמאושר — לא נעלם ולא מקפיץ את הרשימה
  const rows = useMemo(() => byKvitelTab(scoped, tab, approvedHere), [scoped, tab, approvedHere])
  // תיבת הבחירה בראש השורה (צרה) ועמודת הפעולות בסופה. ':v2' מאפס רוחב שנשמר לפני הסידור החדש
  const tc = useTableColumns<ColKey, KvitelRequestRow>('kvitel', COLUMNS, { sortFilter: { mode: 'client', rows }, leadCol: canEdit, extraCols: 1, extraWeight: 0.5, idSuffix: ':v2' })
  const pg = useTablePagination(tc.rows)

  const stageLines = (st: KvitelStatus) => scoped.filter(r => r.status === st).reduce((n, r) => n + r.kvitel_request_lines.length, 0)
  const lineCount = useMemo(() => rows.reduce((n, r) => n + r.kvitel_request_lines.length, 0), [rows])
  const tabTitle = tab === 'all' ? 'כל הבקשות' : tab === 'review' ? 'לבדיקה' : tab === 'pending' ? 'לא נשלח' : tab === 'done' ? 'נשלח לציון' : 'בוטלו'

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
  // לחיצה על השורה מכווצת ומרחיבה; "תיקון" תמיד פותח את השורה במצב עריכה
  const openRow = (r: KvitelRequestRow, editing = false) => {
    setOpenEditing(editing)
    setOpenId(id => (id === r.id && !editing ? null : r.id))
  }
  const details = (r: KvitelRequestRow) => (
    <KvitelRowDetails key={r.id} r={r} canEdit={canEdit} editing={openEditing} onEditing={setOpenEditing} busy={busy} setStatus={setStatus}
      onPreview={setPreviewRow} onSaved={m => { setMessage(m); router.refresh() }} />
  )
  const pickTab = (t: Tab) => { setTab(t); setSelected(new Set()) }

  async function setStatus(ids: string[], status: KvitelStatus, doneMessage?: string): Promise<boolean> {
    if (!ids.length) return false
    setBusy(true)
    setMessage('')
    setUndo(null)
    try {
      const res = await patchKvitelStatus(ids, status)
      if ('error' in res) { setMessage(res.error); return false }
      setMessage(doneMessage ?? `עודכנו ${res.updated} בקשות ל"${KVITEL_STATUSES[status]}"`)
      setSelected(new Set())
      setApprovedHere(s => (ids.some(id => s.has(id)) ? new Set([...s].filter(id => !ids.includes(id))) : s))
      router.refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  // מחיקה מהשורה: מיד, בלי חלון אישור. הבקשה עוברת ל"בוטלו", ו"ביטול" בהודעה מחזיר אותה למצב שהייתה בו
  async function removeRow(r: KvitelRequestRow) {
    const prev: KvitelStatus = r.needsReview ? 'review' : r.status
    const msg = `הבקשה של ${whoOf(r)} נמחקה`
    if (await setStatus([r.id], 'cancelled', msg)) setUndo({ ids: [r.id], status: prev, msg, undone: 'המחיקה בוטלה' })
  }
  async function undoLast() {
    if (undo) await setStatus(undo.ids, undo.status, undo.undone)
  }

  // אישור מהיר: השורה מאושרת מיד והפוקוס עובר ל"אישור" של הבקשה הבאה, והשמירה רצה ברקע.
  // בלי חלון ובלי לנעול את המסך, כדי שאפשר לאשר שם אחרי שם. נכשל — השורה חוזרת לבדיקה עם הודעה.
  async function approve(list: KvitelRequestRow[], skipped = 0) {
    const { todo } = bulkApproval(list)
    if (!todo.length) return
    const ids = todo.map(r => r.id)
    const next = todo.length === 1 && !skipped ? nextToApprove(pg.rows, ids[0]) : null
    const msg = todo.length === 1 && !skipped ? `הבקשה של ${whoOf(todo[0])} אושרה` : bulkApprovalMessage(todo.length, skipped)
    setApprovedHere(s => new Set([...s, ...ids]))
    setSelected(s => (s.size ? new Set([...s].filter(id => !ids.includes(id))) : s))
    setMessage(msg)
    setUndo({ ids, status: 'review', msg, undone: 'האישור בוטל, הבקשה חזרה לבדיקה' })
    if (next) requestAnimationFrame(() => {
      const btn = [...document.querySelectorAll<HTMLButtonElement>(`[data-approve="${next}"]`)].find(b => b.offsetParent !== null)
      btn?.focus()
    })
    const res = await patchKvitelStatus(ids, 'pending')
    if ('error' in res) {
      setApprovedHere(s => new Set([...s].filter(id => !ids.includes(id))))
      setUndo(u => (u?.msg === msg ? null : u))
      setMessage(res.error)
      return
    }
    router.refresh()
  }
  const bulk = bulkApproval(liveRows.filter(r => selected.has(r.id)))
  const toApprove = bulk.todo
  function approveSelected() {
    if (!window.confirm(`לאשר ${toApprove.length} בקשות?`)) return
    void approve(toApprove, bulk.skipped)
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

  return (
    <DupContext.Provider value={dupCtx}>
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
            <p className="min-h-5 text-[13px] text-ink-soft">אפשר להוריד כל אחד מחדש מתוך הבקשה.</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4 text-[13px] text-ink-soft">
          <button type="button" onClick={() => pickTab('review')} className={`underline underline-offset-[3px] ${tab === 'review' ? 'font-bold text-navy' : ''}`}>לבדיקה ({counts.review})</button>
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

      <KvitelDuplicates groups={dupGroups} canEdit={canEdit} openKey={dupOpen} onOpenKey={setDupOpen}
        onDone={m => { setDupOpen(null); setMessage(m); router.refresh() }} />

      {message && (
        <p role="status" className="flex items-center gap-3 rounded-lg bg-sand px-4 py-2.5 text-sm text-navy">
          <span>{message}</span>
          {undo?.msg === message && <button type="button" disabled={busy} onClick={() => void undoLast()} className="font-semibold underline underline-offset-[3px] disabled:opacity-40">ביטול</button>}
        </p>
      )}

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
            {/* ⚠️ ירוק מלא כמו "אישור" בשורה: הגרסה הלבנה נראתה בחי כמלבן ריק בלי טקסט */}
            {toApprove.length > 0 && (
              <button type="button" disabled={busy} onClick={approveSelected} data-bulk-approve className="flex h-9 items-center gap-2 rounded-[10px] bg-[#1F8A54] px-3 text-[13px] font-semibold text-white ring-1 ring-white/40 hover:bg-[#17663F] disabled:opacity-40">
                <Check className="h-4 w-4" aria-hidden /> אישור {toApprove.length === selected.size ? `${toApprove.length}` : `${toApprove.length} מתוך ${selected.size}`}
              </button>
            )}
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
            rowClass={rowTone}
            expandedRow={r => recordingId === r.id && r.recording_url ? (
              <KvitelRecordingPanel key={r.id} requestId={r.id} recordingUrl={r.recording_url} transcript={r.raw_text} needsReview={!!r.needsReview}
                editable={canEdit} onSaved={m => { setMessage(m); router.refresh() }} />
            ) : openId === r.id ? details(r) : null}
            actions={r => (
              <div className="flex items-center gap-3">
                {/* משולש: השמעה ישר מהשורה, והשמות נערכים בתאים תוך כדי. "תמלול" פותח את ההקלטה והתמלול מתחת לשורה */}
                {r.recording_url && <KvitelPlayButton url={r.recording_url} who={whoOf(r)} />}
                {r.recording_url && (
                  <button type="button" onClick={() => setRecordingId(id => (id === r.id ? null : r.id))} aria-expanded={recordingId === r.id} className="flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:border-[#cfc8bb]"
                    aria-label={`תמלול ההקלטה של הבקשה של ${whoOf(r)}`}>
                    <FileText className="h-4 w-4" aria-hidden /> תמלול
                  </button>
                )}
                <RowActions r={r} canEdit={canEdit} busy={busy} className="flex items-center gap-2"
                  onApprove={x => void approve([x])} onEdit={x => openRow(x, true)} onRemove={x => void removeRow(x)} />
              </div>
            )}
            actionsHead="" />
        </div>
      </div>
      <MobileCards rows={pg.rows} canEdit={canEdit} openId={openId} details={details} onOpen={(r, editing) => openRow(r, editing)} onApprove={r => void approve([r])}
        onRemove={r => void removeRow(r)} />
    </div>
    </DupContext.Provider>
  )
}
