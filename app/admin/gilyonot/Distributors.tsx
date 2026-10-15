'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, FileUp, Inbox, Loader2, MapPin, Megaphone, Pencil, Plus, Search, Settings, Trash2, Truck, Undo2, UserMinus, X } from 'lucide-react'
import { downloadXlsx, todayStamp } from '@/lib/downloadXlsx'
import {
  CHANNEL_LABELS, EVENT_LABELS, NO_CITY, SOURCE_LABELS, summarizeByCity,
  type AgentWindow, type DistributorFields, type DistributorSource, type DistributorStatus, type EventChannel, type EventKind,
} from '@/lib/gilyonotDistributors'
import { Badge, btnDanger, btnGhost, btnPrimary, Card, CardHeader, input, link, Notice, Stat, type Tone } from './ui'

// לשונית "מפיצים" באגף הגיליונות: רשימה לפי עיר, פניות מהמפיצים, הודעות והגדרות.
// הכללים ב-lib/gilyonotDistributors.ts · ה-API ב-app/api/admin/gilyonot/distributors

export interface DistributorView extends DistributorFields {
  id: string
  status: DistributorStatus
  source: DistributorSource
  removed_at: string | null
  removed_reason: string | null
  created_at: string
}

export interface DistributorEventView {
  id: string
  distributor_id: string
  distributor_name: string
  kind: EventKind
  channel: EventChannel
  quantity: number | null
  details: string | null
  status: 'open' | 'done' | 'rejected'
  created_at: string
}

export interface DistributorMessageView {
  id: string
  subject: string
  city: string | null
  recipients: number
  sent_count: number
  failed_count: number
  skipped_count: number
  created_at: string
}

export interface DistributorSettingsView {
  courier_name: string | null
  courier_email: string | null
  agent_phone: string | null
  agent_hours: AgentWindow[]
}

const num = (n: number) => n.toLocaleString('he-IL')
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const KIND_TONE: Partial<Record<EventKind, Tone>> = { issue: 'rose', leave: 'rose', increase: 'sky', decrease: 'amber', received: 'green', address: 'navy' }
const IMPORT_ACCEPT = '.xlsx,.csv,.txt'

async function api(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'הפעולה נכשלה')
  return data
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const Head = (p: React.ComponentProps<typeof CardHeader>) => <div className="p-5 pb-4"><CardHeader {...p} /></div>

type Msg = { ok: boolean; text: string } | null
type Section = 'list' | 'requests' | 'broadcast' | 'settings'

export default function Distributors(props: {
  rows: DistributorView[]
  events: DistributorEventView[]
  messages: DistributorMessageView[]
  settings: DistributorSettingsView
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
}) {
  const [section, setSection] = useState<Section>('list')
  const active = props.rows.filter(r => r.status === 'active')
  const byCity = useMemo(() => summarizeByCity(props.rows), [props.rows])
  const total = active.reduce((s, r) => s + r.quantity, 0)
  const cities = byCity.map(c => c.city).filter(c => c !== NO_CITY)

  const sections: { key: Section; label: string; icon: typeof Inbox; count?: number }[] = [
    { key: 'list', label: 'מפיצים', icon: Truck },
    { key: 'requests', label: 'פניות', icon: Inbox, count: props.events.length },
    ...(props.canEdit ? [
      { key: 'broadcast' as const, label: 'הודעה למפיצים', icon: Megaphone },
      { key: 'settings' as const, label: 'הגדרות', icon: Settings },
    ] : []),
  ]

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="מפיצים פעילים" value={num(active.length)} />
        <Stat label="גיליונות בשבוע" value={num(total)} />
        <Stat label="ערים" value={num(cities.length)} />
        <Stat label="פניות פתוחות" value={num(props.events.length)} tone={props.events.length ? 'rose' : undefined} />
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="מפיצים" className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {sections.map(s => (
            <button
              key={s.key} type="button" role="tab" aria-selected={section === s.key} onClick={() => setSection(s.key)}
              className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${section === s.key ? 'bg-[#1B3256] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <s.icon className="h-4 w-4" aria-hidden />{s.label}
              {!!s.count && <span className={`rounded-full px-1.5 text-xs tabular-nums ${section === s.key ? 'bg-white/20' : 'bg-rose-100 text-rose-700'}`}>{num(s.count)}</span>}
            </button>
          ))}
        </div>
        <a href="/gilyonot/mefitz" target="_blank" rel="noopener noreferrer" className={`${link} inline-flex items-center gap-1 text-sm`}>
          ממשק המפיץ <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      {section === 'list' && <DistributorList rows={props.rows} byCity={byCity} canAdd={props.canAdd} canEdit={props.canEdit} canDelete={props.canDelete} />}
      {section === 'requests' && <Requests events={props.events} canEdit={props.canEdit} />}
      {section === 'broadcast' && <Broadcast cities={cities} rows={active} messages={props.messages} />}
      {section === 'settings' && <SettingsForm settings={props.settings} />}
    </div>
  )
}

// ─── רשימת המפיצים ───────────────────────────────────────────────────────────

function DistributorList({ rows, byCity, canAdd, canEdit, canDelete }: {
  rows: DistributorView[]; byCity: ReturnType<typeof summarizeByCity>; canAdd: boolean; canEdit: boolean; canDelete: boolean
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [city, setCity] = useState('')
  const [showRemoved, setShowRemoved] = useState(false)
  const [panel, setPanel] = useState<'' | 'add' | 'paste'>('')
  const [editing, setEditing] = useState<DistributorView | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter(r =>
      (showRemoved || r.status === 'active') &&
      (!city || (city === NO_CITY ? !r.city : r.city === city)) &&
      (!term || [r.full_name, r.phone, r.phone2, r.email, r.synagogue, r.address, r.city].some(v => v?.toLowerCase().includes(term))))
  }, [rows, q, city, showRemoved])
  const shownQty = shown.filter(r => r.status === 'active').reduce((s, r) => s + r.quantity, 0)

  async function run(fn: () => Promise<string>) {
    setBusy(true); setMsg(null)
    try { setMsg({ ok: true, text: await fn() }); router.refresh() }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'הפעולה נכשלה' }) }
    finally { setBusy(false) }
  }

  const importWith = (init: RequestInit) => run(async () => {
    const r = await api('/api/admin/gilyonot/distributors', init)
    setPanel('')
    const parts = [`נוספו ${num(Number(r.added ?? 0))} מפיצים`]
    if (Number(r.exists)) parts.push(`${num(Number(r.exists))} כבר היו ברשימה`)
    if (Number(r.invalidCount)) {
      const inv = (r.invalid as { line: number; error: string }[]).slice(0, 5).map(i => `שורה ${i.line}: ${i.error}`).join(' · ')
      parts.push(`${num(Number(r.invalidCount))} שורות לא נקלטו (${inv})`)
    }
    return parts.join('. ')
  })

  function uploadFile(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    importWith({ method: 'POST', body: fd })
  }

  function exportXlsx() {
    downloadXlsx({
      filename: `gilyonot-distributors-${todayStamp()}.xlsx`,
      sheetName: 'מפיצים',
      columns: ['שם', 'עיר', 'בית כנסת', 'כתובת', 'טלפון', 'טלפון 2', 'מייל', 'כמות', 'סטטוס', 'הערות'].map(header => ({ header })),
      rows: shown.map(r => [r.full_name, r.city ?? '', r.synagogue ?? '', r.address ?? '', r.phone ?? '', r.phone2 ?? '', r.email ?? '', r.quantity, r.status === 'active' ? 'פעיל' : 'הוסר', r.notes ?? '']),
    }).catch(e => setMsg({ ok: false, text: e instanceof Error ? e.message : 'הייצוא נכשל' }))
  }

  const th = 'px-4 py-3 text-start text-xs font-semibold text-slate-500'

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0 space-y-4">
        <input ref={fileRef} type="file" accept={IMPORT_ACCEPT} className="hidden" aria-hidden tabIndex={-1}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadFile(f) }} />

        {canAdd && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={() => { setEditing(null); setPanel(panel === 'add' ? '' : 'add') }}><Plus className="h-4 w-4" aria-hidden />מפיץ חדש</button>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" aria-hidden />ייבוא מקובץ</button>
            <button type="button" className={btnGhost} onClick={() => setPanel(panel === 'paste' ? '' : 'paste')}>הדבקת רשימה</button>
          </div>
        )}
        <Notice msg={msg} />

        {panel === 'add' && (
          <DistributorForm busy={busy} onClose={() => setPanel('')} onSubmit={fields => run(async () => {
            await api('/api/admin/gilyonot/distributors', json('POST', { mode: 'add', ...fields }))
            setPanel('')
            return 'המפיץ נוסף'
          })} />
        )}
        {panel === 'paste' && <PasteForm busy={busy} onClose={() => setPanel('')} onSubmit={text => importWith(json('POST', { mode: 'import', text }))} />}
        {editing && (
          <DistributorForm key={editing.id} initial={editing} busy={busy} canDelete={canDelete} onClose={() => setEditing(null)}
            onSubmit={fields => run(async () => {
              await api('/api/admin/gilyonot/distributors', json('PATCH', { id: editing.id, fields }))
              setEditing(null)
              return 'הפרטים נשמרו'
            })}
            onStatus={(status, reason) => run(async () => {
              await api('/api/admin/gilyonot/distributors', json('PATCH', { id: editing.id, status, reason }))
              setEditing(null)
              return status === 'removed' ? 'המפיץ הוסר מהמערך' : 'המפיץ הוחזר למערך'
            })}
            onDelete={() => run(async () => {
              await api(`/api/admin/gilyonot/distributors?id=${editing.id}`, { method: 'DELETE' })
              setEditing(null)
              return 'המפיץ נמחק'
            })} />
        )}

        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
            <label className="relative min-w-48 flex-1">
              <span className="sr-only">חיפוש</span>
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-slate-400" aria-hidden />
              <input className={`${input} ps-9`} placeholder="שם, טלפון, בית כנסת או כתובת" value={q} onChange={e => setQ(e.target.value)} />
            </label>
            <label className="w-40">
              <span className="sr-only">עיר</span>
              <select className={input} value={city} onChange={e => setCity(e.target.value)}>
                <option value="">כל הערים</option>
                {byCity.map(c => <option key={c.city} value={c.city}>{c.city}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showRemoved} onChange={e => setShowRemoved(e.target.checked)} className="h-4 w-4 accent-[#1B3256]" />
              כולל שהוסרו
            </label>
            <button type="button" className={`${btnGhost} ms-auto`} onClick={exportXlsx} disabled={!shown.length}>ייצוא</button>
          </div>
          <p className="px-4 pt-3 text-xs text-slate-500">{num(shown.length)} מפיצים · {num(shownQty)} גיליונות בשבוע</p>

          {shown.length ? (
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={th}>מפיץ</th>
                    <th className={`${th} hidden sm:table-cell`}>עיר</th>
                    <th className={`${th} hidden md:table-cell`}>טלפון</th>
                    <th className={th}>כמות</th>
                    {canEdit && <th className={`${th} w-12`}><span className="sr-only">עריכה</span></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.slice(0, 500).map(r => (
                    <tr key={r.id} className={r.status === 'removed' ? 'bg-slate-50/60 text-slate-400' : ''}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{r.full_name}{r.status === 'removed' && <span className="ms-2"><Badge tone="rose">הוסר</Badge></span>}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{[r.synagogue, r.address].filter(Boolean).join(' · ') || '—'}</p>
                        <p className="mt-0.5 text-xs text-slate-500 sm:hidden">{r.city ?? NO_CITY}{r.phone ? ` · ${r.phone}` : ''}</p>
                      </td>
                      <td className="hidden px-4 py-3 text-slate-700 sm:table-cell">{r.city ?? '—'}</td>
                      <td className="hidden px-4 py-3 tabular-nums text-slate-700 md:table-cell" dir="ltr">{r.phone ?? '—'}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">{num(r.quantity)}</td>
                      {canEdit && (
                        <td className="px-2 py-3">
                          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-[#1B3256]" aria-label={`עריכת ${r.full_name}`}
                            onClick={() => { setPanel(''); setEditing(r); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length > 500 && <p className="p-4 text-center text-xs text-slate-500">מוצגים 500 הראשונים. צמצמו בחיפוש או בעיר.</p>}
            </div>
          ) : (
            <p className="p-10 text-center text-sm text-slate-500">{rows.length ? 'אין מפיצים שמתאימים לחיפוש' : 'עוד אין מפיצים. הוסיפו מפיץ או ייבאו רשימה מקובץ.'}</p>
          )}
        </Card>
      </div>

      <Card className="h-fit">
        <Head icon={<MapPin className="h-5 w-5" aria-hidden />} title="לפי עיר" hint="מפיצים פעילים וגיליונות בשבוע" />
        {byCity.length ? (
          <ul className="divide-y divide-slate-100">
            {byCity.map(c => (
              <li key={c.city}>
                <button type="button" onClick={() => setCity(city === c.city ? '' : c.city)}
                  className={`flex w-full items-center justify-between gap-3 px-5 py-2.5 text-start text-sm transition-colors hover:bg-slate-50 ${city === c.city ? 'bg-[#1B3256]/[0.06] font-semibold text-[#1B3256]' : 'text-slate-700'}`}>
                  <span className="truncate">{c.city}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">{num(c.distributors)} · <b className="text-slate-900">{num(c.quantity)}</b></span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 pb-5 text-sm text-slate-500">אין נתונים עדיין</p>}
      </Card>
    </div>
  )
}

const FIELDS: { key: keyof DistributorFields; label: string; type?: string; dir?: 'ltr'; required?: boolean; wide?: boolean }[] = [
  { key: 'full_name', label: 'שם מלא', required: true },
  { key: 'city', label: 'עיר' },
  { key: 'synagogue', label: 'בית כנסת' },
  { key: 'address', label: 'כתובת למסירה' },
  { key: 'phone', label: 'טלפון', type: 'tel', dir: 'ltr' },
  { key: 'phone2', label: 'טלפון נוסף', type: 'tel', dir: 'ltr' },
  { key: 'email', label: 'מייל', type: 'email', dir: 'ltr' },
  { key: 'id_number', label: 'תעודת זהות', dir: 'ltr' },
  { key: 'quantity', label: 'כמות גיליונות בשבוע', type: 'number', dir: 'ltr' },
  { key: 'notes', label: 'הערות', wide: true },
]

function DistributorForm({ initial, busy, canDelete, onClose, onSubmit, onStatus, onDelete }: {
  initial?: DistributorView; busy: boolean; canDelete?: boolean; onClose: () => void
  onSubmit: (f: Record<string, string>) => void
  onStatus?: (status: 'removed' | 'active', reason?: string) => void
  onDelete?: () => void
}) {
  const [f, setF] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map(x => [x.key, initial ? String(initial[x.key] ?? '') : ''])))
  const removed = initial?.status === 'removed'

  return (
    <Card>
      <Head title={initial ? `עריכת ${initial.full_name}` : 'מפיץ חדש'}
        hint={initial ? `מקור: ${SOURCE_LABELS[initial.source]} · נוסף ${fmtDate(initial.created_at)}${removed ? ` · הוסר ${fmtDate(initial.removed_at)}${initial.removed_reason ? ` (${initial.removed_reason})` : ''}` : ''}` : undefined}>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="סגירה"><X className="h-4 w-4" aria-hidden /></button>
      </Head>
      <form className="space-y-5 px-5 pb-5" onSubmit={e => { e.preventDefault(); onSubmit(f) }}>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(x => (
            <label key={x.key} className={`block ${x.wide ? 'sm:col-span-2' : ''}`}>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{x.label}{x.required && <span className="text-rose-600"> *</span>}</span>
              {x.wide
                ? <textarea className={input} rows={2} value={f[x.key]} onChange={e => setF({ ...f, [x.key]: e.target.value })} />
                : <input className={input} type={x.type ?? 'text'} dir={x.dir} min={x.type === 'number' ? 0 : undefined} required={x.required}
                    value={f[x.key]} onChange={e => setF({ ...f, [x.key]: e.target.value })} />}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={btnPrimary} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{initial ? 'שמירה' : 'הוספה'}</button>
          <button type="button" className={btnGhost} onClick={onClose}>ביטול</button>
          {initial && onStatus && (removed
            ? <button type="button" className={`${btnGhost} ms-auto`} disabled={busy} onClick={() => onStatus('active')}><Undo2 className="h-4 w-4" aria-hidden />החזרה למערך</button>
            : <button type="button" className={`${btnDanger} ms-auto`} disabled={busy} onClick={() => {
                const reason = window.prompt('סיבת ההסרה (לא חובה)')
                if (reason !== null) onStatus('removed', reason)
              }}><UserMinus className="h-4 w-4" aria-hidden />הסרה מהמערך</button>)}
          {initial && canDelete && onDelete && (
            <button type="button" className={btnDanger} disabled={busy} onClick={() => {
              if (window.confirm(`למחוק את ${initial.full_name} לצמיתות, כולל כל הפניות שלו? בדרך כלל עדיף "הסרה מהמערך".`)) onDelete()
            }}><Trash2 className="h-4 w-4" aria-hidden />מחיקה</button>
          )}
        </div>
      </form>
    </Card>
  )
}

function PasteForm({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <Card>
      <Head title="הדבקת רשימת מפיצים" hint="העתיקו מ-Excel כולל שורת הכותרות (שם, עיר, טלפון, כתובת, בית כנסת, כמות...). העמודות מזוהות לפי הכותרות.">
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="סגירה"><X className="h-4 w-4" aria-hidden /></button>
      </Head>
      <form className="space-y-3 px-5 pb-5" onSubmit={e => { e.preventDefault(); onSubmit(text) }}>
        <label className="block">
          <span className="sr-only">הרשימה</span>
          <textarea className={`${input} font-mono`} rows={8} dir="auto" value={text} onChange={e => setText(e.target.value)} placeholder={'שם\tעיר\tטלפון\tכמות'} />
        </label>
        <button type="submit" className={btnPrimary} disabled={busy || !text.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}ייבוא</button>
      </form>
    </Card>
  )
}

// ─── פניות פתוחות מהמפיצים ───────────────────────────────────────────────────

function Requests({ events, canEdit }: { events: DistributorEventView[]; canEdit: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg>(null)

  async function handle(ev: DistributorEventView, status: 'done' | 'rejected') {
    setBusy(ev.id); setMsg(null)
    try {
      await api('/api/admin/gilyonot/distributors/events', json('PATCH', { id: ev.id, status }))
      const changed = status === 'done' && (ev.kind === 'increase' || ev.kind === 'decrease')
      setMsg({ ok: true, text: changed ? `הכמות של ${ev.distributor_name} עודכנה ל-${num(ev.quantity ?? 0)}` : 'הפנייה עודכנה' })
      router.refresh()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'הפעולה נכשלה' }) }
    finally { setBusy(null) }
  }

  return (
    <Card>
      <Head icon={<Inbox className="h-5 w-5" aria-hidden />} title="פניות פתוחות"
        hint="דיווחים ובקשות מהמפיצים שממתינים לטיפול. אישור בקשת תוספת או הפחתה מעדכן את הכמות. עדכון כתובת והתנתקות מתבצעים מיד, והשליח מקבל הודעה." />
      <div className="px-5"><Notice msg={msg} /></div>
      {events.length ? (
        <ul className="divide-y divide-slate-100">
          {events.map(ev => {
            const change = ev.kind === 'increase' || ev.kind === 'decrease'
            return (
              <li key={ev.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={KIND_TONE[ev.kind] ?? 'neutral'}>{EVENT_LABELS[ev.kind]}</Badge>
                    <span className="font-medium text-slate-900">{ev.distributor_name}</span>
                    {ev.quantity !== null && <span className="text-sm tabular-nums text-slate-600">{change ? 'כמות מבוקשת' : 'התקבלו'}: <b>{num(ev.quantity)}</b></span>}
                  </div>
                  {ev.details && <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">{ev.details}</p>}
                  <p className="mt-1 text-xs text-slate-500">{fmtDate(ev.created_at)} · {CHANNEL_LABELS[ev.channel]}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => handle(ev, 'done')}>
                      {busy === ev.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}{change ? 'אישור' : 'טופל'}
                    </button>
                    {change && <button type="button" className={btnGhost} disabled={!!busy} onClick={() => handle(ev, 'rejected')}>דחייה</button>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ) : <p className="p-10 text-center text-sm text-slate-500">אין פניות פתוחות</p>}
    </Card>
  )
}

// ─── הודעה לכל המפיצים או לעיר ───────────────────────────────────────────────

function Broadcast({ cities, rows, messages }: { cities: string[]; rows: DistributorView[]; messages: DistributorMessageView[] }) {
  const router = useRouter()
  const [city, setCity] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const target = rows.filter(r => !city || r.city === city)
  const withMail = new Set(target.map(r => r.email).filter(Boolean)).size

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!window.confirm(`לשלוח את ההודעה ל-${num(withMail)} מפיצים${city ? ` ב${city}` : ''}?`)) return
    setBusy(true); setMsg(null)
    try {
      const r = await api('/api/admin/gilyonot/distributors/broadcast', json('POST', { subject, body, city: city || null }))
      const parts = [`נשלחו ${num(Number(r.sent))} הודעות`]
      if (Number(r.failed)) parts.push(`${num(Number(r.failed))} נכשלו`)
      if (Number(r.skipped)) parts.push(`${num(Number(r.skipped))} מפיצים בלי מייל`)
      setMsg({ ok: !Number(r.failed), text: parts.join(' · ') })
      setSubject(''); setBody('')
      router.refresh()
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'השליחה נכשלה' }) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <Card>
        <Head icon={<Megaphone className="h-5 w-5" aria-hidden />} title="הודעה למפיצים" hint="נשלחת במייל לכל המפיצים הפעילים, או רק למפיצי עיר אחת. מפיץ בכמה בתי כנסת מקבל הודעה אחת." />
        <form className="space-y-4 px-5 pb-5" onSubmit={send}>
          <label className="block max-w-xs">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">למי</span>
            <select className={input} value={city} onChange={e => setCity(e.target.value)}>
              <option value="">כל המפיצים</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <p className="text-sm text-slate-600">{num(target.length)} מפיצים פעילים, מתוכם <b>{num(withMail)}</b> עם מייל.</p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">נושא</span>
            <input className={input} required maxLength={150} value={subject} onChange={e => setSubject(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">תוכן ההודעה</span>
            <textarea className={input} required rows={6} maxLength={5000} value={body} onChange={e => setBody(e.target.value)} />
          </label>
          <Notice msg={msg} />
          <button type="submit" className={btnPrimary} disabled={busy || !withMail}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}שליחה</button>
        </form>
      </Card>

      {!!messages.length && (
        <Card>
          <Head title="הודעות שנשלחו" />
          <ul className="divide-y divide-slate-100">
            {messages.map(m => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
                <span className="font-medium text-slate-900">{m.subject} <span className="font-normal text-slate-500">· {m.city ?? 'כל המפיצים'}</span></span>
                <span className="tabular-nums text-slate-500">{fmtDate(m.created_at)} · נשלחו {num(m.sent_count)}{m.failed_count ? ` · נכשלו ${num(m.failed_count)}` : ''}{m.skipped_count ? ` · בלי מייל ${num(m.skipped_count)}` : ''}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

// ─── הגדרות: שליח, ונציג טלפוני (לשלב ימות המשיח) ────────────────────────────

function SettingsForm({ settings }: { settings: DistributorSettingsView }) {
  const router = useRouter()
  const [s, setS] = useState({ courier_name: settings.courier_name ?? '', courier_email: settings.courier_email ?? '', agent_phone: settings.agent_phone ?? '' })
  const [hours, setHours] = useState<AgentWindow[]>(settings.agent_hours)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      await api('/api/admin/gilyonot/distributors/settings', json('PUT', { ...s, agent_hours: hours }))
      setMsg({ ok: true, text: 'ההגדרות נשמרו' })
      router.refresh()
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'השמירה נכשלה' }) }
    finally { setBusy(false) }
  }

  const setHour = (i: number, patch: Partial<AgentWindow>) => setHours(hours.map((h, j) => (j === i ? { ...h, ...patch } : h)))

  return (
    <Card>
      <Head icon={<Settings className="h-5 w-5" aria-hidden />} title="הגדרות מערך המפיצים" />
      <form className="space-y-6 px-5 pb-5" onSubmit={save}>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">השליח</legend>
          <p className="text-sm text-slate-600">כשמפיץ מתנתק או מעדכן כתובת, נשלח לשליח מייל עם הפרטים.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">שם השליח</span>
              <input className={input} value={s.courier_name} onChange={e => setS({ ...s, courier_name: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">מייל השליח</span>
              <input className={input} type="email" dir="ltr" value={s.courier_email} onChange={e => setS({ ...s, courier_email: e.target.value })} />
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-slate-100 pt-5">
          <legend className="text-sm font-semibold text-slate-900">נציג אנושי (לקו הטלפוני, בשלב הבא)</legend>
          <label className="block max-w-xs">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">טלפון הנציג</span>
            <input className={input} type="tel" dir="ltr" value={s.agent_phone} onChange={e => setS({ ...s, agent_phone: e.target.value })} />
          </label>
          <p className="text-sm text-slate-600">שעות שבהן אפשר להעביר מפיץ לנציג (שעון ישראל):</p>
          <ul className="space-y-2">
            {hours.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <select className={`${input} w-28`} aria-label="יום" value={h.day} onChange={e => setHour(i, { day: Number(e.target.value) })}>
                  {DAYS.map((d, n) => <option key={n} value={n}>{d}</option>)}
                </select>
                <input className={`${input} w-28`} type="time" aria-label="משעה" value={h.from} onChange={e => setHour(i, { from: e.target.value })} />
                <span className="text-sm text-slate-500">עד</span>
                <input className={`${input} w-28`} type="time" aria-label="עד שעה" value={h.to} onChange={e => setHour(i, { to: e.target.value })} />
                <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="הסרת השעות" onClick={() => setHours(hours.filter((_, j) => j !== i))}><X className="h-4 w-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
          <button type="button" className={btnGhost} onClick={() => setHours([...hours, { day: 0, from: '09:00', to: '13:00' }])}><Plus className="h-4 w-4" aria-hidden />הוספת שעות</button>
        </fieldset>

        <Notice msg={msg} />
        <button type="submit" className={btnPrimary} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}שמירה</button>
      </form>
    </Card>
  )
}
