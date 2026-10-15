'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, FileUp, Inbox, Loader2, MapPin, Megaphone, Pencil, Plus, Search, Settings, Trash2, Truck, Undo2, UserMinus, UserPlus, UtensilsCrossed, X } from 'lucide-react'
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

export interface HilulaRequestView {
  id: string
  distributor_id: string | null
  full_name: string | null
  phone: string | null
  city: string | null
  synagogue: string | null
  guests: number
  channel: EventChannel
  priority: boolean
  details: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export interface DistributorApplicationView {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  city: string | null
  synagogue: string | null
  address: string | null
  quantity: number | null
  reason: string
  reason_label: string
  conflict_name: string | null
  created_at: string
}

// ההגדרות של טופס המפיצים בנדרים (בלי המפתח: הוא משותף ונשמר בהגדרות הנרשמים)
export interface DistNedarimView {
  config: { tofesId: string; nameField: string; phoneField: string; emailField: string; cityField: string; synagogueField: string; addressField: string; quantityField: string }
  state: { lastId: number; lastRunAt: string | null; lastAdded: number; lastHeld: number; lastError: string | null }
  connected: boolean
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
type Section = 'list' | 'requests' | 'hilula' | 'nedarim' | 'broadcast' | 'settings'

export default function Distributors(props: {
  rows: DistributorView[]
  events: DistributorEventView[]
  messages: DistributorMessageView[]
  settings: DistributorSettingsView
  hilula: HilulaRequestView[]
  applications: DistributorApplicationView[]
  nedarim: DistNedarimView
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
    { key: 'hilula', label: 'סעודת ההילולא', icon: UtensilsCrossed, count: props.hilula.filter(h => h.status === 'pending').length },
    ...(props.canEdit ? [
      { key: 'nedarim' as const, label: 'נרשמים מנדרים', icon: UserPlus, count: props.applications.length },
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
      {section === 'hilula' && <Hilula requests={props.hilula} canEdit={props.canEdit} />}
      {section === 'nedarim' && <NedarimApplications applications={props.applications} view={props.nedarim} />}
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
          <legend className="text-sm font-semibold text-slate-900">נציג אנושי בקו הטלפוני</legend>
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

// ─── סעודת ההילולא ───────────────────────────────────────────────────────────

const HILULA_STATUS: Record<HilulaRequestView['status'], { label: string; tone: Tone }> = {
  pending: { label: 'ממתין', tone: 'amber' },
  approved: { label: 'אושר', tone: 'green' },
  rejected: { label: 'נדחה', tone: 'rose' },
}

function Hilula({ requests, canEdit }: { requests: HilulaRequestView[]; canEdit: boolean }) {
  const router = useRouter()
  const [filter, setFilter] = useState<HilulaRequestView['status'] | 'all'>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg>(null)
  // הסדר מגיע מהשרת: קודם מפיצים פעילים (קדימות), ואז לפי זמן הבקשה
  const shown = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const sum = (list: HilulaRequestView[]) => list.reduce((s, r) => s + r.guests, 0)
  const approved = requests.filter(r => r.status === 'approved')
  const pending = requests.filter(r => r.status === 'pending')

  async function handle(r: HilulaRequestView, status: HilulaRequestView['status']) {
    setBusy(r.id); setMsg(null)
    try {
      await api('/api/admin/gilyonot/distributors/hilula', json('PATCH', { id: r.id, status }))
      setMsg({ ok: true, text: `הבקשה של ${r.full_name ?? r.phone ?? 'המבקש'} ${status === 'approved' ? 'אושרה' : status === 'rejected' ? 'נדחתה' : 'הוחזרה להמתנה'}` })
      router.refresh()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'הפעולה נכשלה' }) }
    finally { setBusy(null) }
  }

  function exportXlsx() {
    downloadXlsx({
      filename: `gilyonot-hilula-${todayStamp()}.xlsx`,
      sheetName: 'סעודת ההילולא',
      columns: ['שם', 'טלפון', 'עיר', 'בית כנסת', 'משתתפים', 'מפיץ (קדימות)', 'ערוץ', 'סטטוס', 'תאריך הבקשה'].map(header => ({ header })),
      rows: shown.map(r => [r.full_name ?? '', r.phone ?? '', r.city ?? '', r.synagogue ?? '', r.guests, r.priority ? 'כן' : 'לא', CHANNEL_LABELS[r.channel], HILULA_STATUS[r.status].label, fmtDate(r.created_at)]),
    }).catch(e => setMsg({ ok: false, text: e instanceof Error ? e.message : 'הייצוא נכשל' }))
  }

  const th = 'px-4 py-3 text-start text-xs font-semibold text-slate-500'
  const filters: { key: typeof filter; label: string }[] = [
    { key: 'pending', label: `ממתינים (${num(pending.length)})` },
    { key: 'approved', label: `אושרו (${num(approved.length)})` },
    { key: 'rejected', label: 'נדחו' },
    { key: 'all', label: 'הכול' },
  ]

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="בקשות ממתינות" value={num(pending.length)} />
        <Stat label="משתתפים בהמתנה" value={num(sum(pending))} />
        <Stat label="בקשות שאושרו" value={num(approved.length)} />
        <Stat label="משתתפים שאושרו" value={num(sum(approved))} />
      </dl>
      <Card>
        <Head icon={<UtensilsCrossed className="h-5 w-5" aria-hidden />} title="בקשות להשתתף בסעודת ההילולא"
          hint="בקשות מהקו הטלפוני וממשק המפיץ. מפיצים פעילים מקבלים קדימות ומופיעים ראשונים." />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4">
          <div className="flex flex-wrap gap-1">
            {filters.map(f => (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
                className={`min-h-9 rounded-lg px-3 text-sm font-medium ${filter === f.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <button type="button" className={btnGhost} disabled={!shown.length} onClick={exportXlsx}><FileUp className="h-4 w-4 rotate-180" aria-hidden />ייצוא לאקסל</button>
        </div>
        <div className="px-5"><Notice msg={msg} /></div>
        {shown.length ? (
          <div>
            <table className="w-full text-sm">
              <thead className="border-y border-slate-100 bg-slate-50/60">
                <tr><th className={th}>שם</th><th className={`${th} hidden md:table-cell`}>טלפון</th><th className={`${th} hidden lg:table-cell`}>מקום</th><th className={th}>משתתפים</th><th className={`${th} hidden sm:table-cell`}>סטטוס</th><th className={`${th} hidden xl:table-cell`}>תאריך</th>{canEdit && <th className={th}><span className="sr-only">פעולות</span></th>}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(r => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{r.full_name ?? '—'}</span>
                        {r.priority && <Badge tone="navy">מפיץ · קדימות</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 lg:hidden"><span dir="ltr" className="md:hidden">{r.phone ?? ''}</span> {[r.city, r.synagogue].filter(Boolean).join(' · ')}</p>
                      {r.details && <p className="mt-1 text-xs text-slate-500">{r.details}</p>}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-slate-700 md:table-cell" dir="ltr">{r.phone ?? '—'}</td>
                    <td className="hidden px-4 py-3 text-slate-700 lg:table-cell">{[r.city, r.synagogue].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">{num(r.guests)}</td>
                    <td className="hidden px-4 py-3 sm:table-cell"><Badge tone={HILULA_STATUS[r.status].tone}>{HILULA_STATUS[r.status].label}</Badge></td>
                    <td className="hidden px-4 py-3 text-xs text-slate-500 xl:table-cell">{fmtDate(r.created_at)}<br />{CHANNEL_LABELS[r.channel]}</td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {r.status === 'pending' ? (<>
                            <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => handle(r, 'approved')}>
                              {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}אישור
                            </button>
                            <button type="button" className={btnGhost} disabled={!!busy} onClick={() => handle(r, 'rejected')}>דחייה</button>
                          </>) : (
                            <button type="button" className={btnGhost} disabled={!!busy} onClick={() => handle(r, 'pending')}><Undo2 className="h-4 w-4" aria-hidden />החזרה להמתנה</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p-10 text-center text-sm text-slate-500">אין בקשות</p>}
      </Card>
    </div>
  )
}

// ─── נרשמים מנדרים פלוס ──────────────────────────────────────────────────────

const NEDARIM_FIELDS: { key: Exclude<keyof DistNedarimView['config'], 'tofesId'>; label: string; required?: boolean }[] = [
  { key: 'nameField', label: 'שם', required: true },
  { key: 'phoneField', label: 'טלפון', required: true },
  { key: 'synagogueField', label: 'בית כנסת', required: true },
  { key: 'cityField', label: 'עיר' },
  { key: 'addressField', label: 'כתובת למשלוח' },
  { key: 'quantityField', label: 'כמות גיליונות' },
  { key: 'emailField', label: 'מייל' },
]

function NedarimApplications({ applications, view }: { applications: DistributorApplicationView[]; view: DistNedarimView }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg>(null)
  const [cfg, setCfg] = useState(view.config)
  const [sample, setSample] = useState<Record<string, string>[] | null>(null)

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key); setMsg(null)
    try { setMsg({ ok: true, text: await fn() }); router.refresh() }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'הפעולה נכשלה' }) }
    finally { setBusy(null) }
  }

  const handle = (a: DistributorApplicationView, status: 'approved' | 'dismissed') => run(a.id, async () => {
    await api('/api/admin/gilyonot/distributors/applications', json('PATCH', { id: a.id, status }))
    return status === 'approved' ? `${a.full_name} נוסף כמפיץ` : 'הבקשה נדחתה'
  })
  const save = (e: React.FormEvent) => { e.preventDefault(); void run('save', async () => { await api('/api/admin/gilyonot/distributors/nedarim', json('POST', { mode: 'save', ...cfg })); return 'ההגדרות נשמרו' }) }
  const loadSample = () => run('sample', async () => {
    const res = await api('/api/admin/gilyonot/distributors/nedarim', json('POST', { mode: 'sample' }))
    setSample(Array.isArray(res.rows) ? res.rows as Record<string, string>[] : [])
    return 'אלה הרשומות האחרונות בטופס. בחרו מהן את שמות העמודות.'
  })
  const pull = () => run('pull', async () => {
    const res = await api('/api/admin/gilyonot/distributors/nedarim', json('POST', { mode: 'pull' }))
    return `נוספו ${num(Number(res.added) || 0)} מפיצים, ${num(Number(res.held) || 0)} ממתינים לבדיקה, ${num(Number(res.exists) || 0)} כבר רשומים`
  })

  const columns = sample?.length ? Object.keys(sample[0]) : []
  const st = view.state

  return (
    <div className="space-y-6">
      <Notice msg={msg} />
      <Card>
        <Head icon={<UserPlus className="h-5 w-5" aria-hidden />} title="ממתינים לבדיקה"
          hint="נרשמים מהטופס בנדרים פלוס שלא נכנסו אוטומטית: יש כבר מפיץ בבית הכנסת, או שחסר פרט חובה. מי שאין לו מפיץ בבית הכנסת נכנס לבד." />
        {applications.length ? (
          <ul className="divide-y divide-slate-100">
            {applications.map(a => (
              <li key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={a.reason === 'synagogue_taken' ? 'amber' : 'rose'}>{a.reason_label}</Badge>
                    <span className="font-medium text-slate-900">{a.full_name ?? 'ללא שם'}</span>
                    {a.phone && <span className="text-sm tabular-nums text-slate-600" dir="ltr">{a.phone}</span>}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-700">
                    {[a.city, a.synagogue, a.address].filter(Boolean).join(' · ') || '—'}
                    {a.quantity !== null && <> · {num(a.quantity)} גיליונות</>}
                  </p>
                  {a.conflict_name && <p className="mt-1 text-sm text-amber-800">המפיץ הקיים בבית הכנסת: {a.conflict_name}</p>}
                  <p className="mt-1 text-xs text-slate-500">{fmtDate(a.created_at)}{a.email && <> · <span dir="ltr">{a.email}</span></>}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={btnPrimary} disabled={!!busy || !a.full_name} onClick={() => handle(a, 'approved')}>
                    {busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}הוספה כמפיץ
                  </button>
                  <button type="button" className={btnGhost} disabled={!!busy} onClick={() => handle(a, 'dismissed')}>דחייה</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="p-10 text-center text-sm text-slate-500">אין נרשמים שממתינים לבדיקה</p>}
      </Card>

      <Card>
        <Head icon={<Settings className="h-5 w-5" aria-hidden />} title="טופס המפיצים בנדרים פלוס"
          hint="המערכת בודקת את הטופס כל שעה. מספר המוסד והמפתח משותפים למשיכת הנרשמים לגיליונות (לשונית נדרים פלוס)." />
        <div className="space-y-5 px-5 pb-5">
          {!view.connected && <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">עדיין לא הוגדרו מספר מוסד ומפתח. הגדירו אותם קודם בלשונית ״נדרים פלוס״.</p>}
          <p className="text-sm text-slate-600">
            ריצה אחרונה: {fmtDate(st.lastRunAt)}
            {st.lastRunAt && <> · נוספו {num(st.lastAdded)} · לבדיקה {num(st.lastHeld)}</>}
          </p>
          {st.lastError && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{st.lastError}</p>}
          <form className="space-y-4" onSubmit={save}>
            <label className="block max-w-xs">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">מספר הטופס בנדרים</span>
              <input className={input} dir="ltr" inputMode="numeric" value={cfg.tofesId} onChange={e => setCfg({ ...cfg, tofesId: e.target.value })} required />
            </label>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {NEDARIM_FIELDS.map(f => (
                <label key={f.key} className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">עמודת {f.label}{f.required && <span className="text-rose-600"> *</span>}</span>
                  <input className={input} list="dist-nedarim-columns" value={cfg[f.key]} required={f.required} onChange={e => setCfg({ ...cfg, [f.key]: e.target.value })} />
                </label>
              ))}
            </div>
            <datalist id="dist-nedarim-columns">{columns.map(c => <option key={c} value={c} />)}</datalist>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={btnPrimary} disabled={!!busy}>{busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}שמירה</button>
              <button type="button" className={btnGhost} disabled={!!busy || !view.connected || !view.config.tofesId} onClick={loadSample}>{busy === 'sample' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}הצגת רשומות לדוגמה</button>
              <button type="button" className={btnGhost} disabled={!!busy || !view.connected || !view.config.tofesId} onClick={pull}>{busy === 'pull' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}בדיקה עכשיו</button>
            </div>
          </form>
          {sample && (sample.length ? (
            <ul className="space-y-2">
              {sample.map((r, i) => (
                <li key={i} className="rounded-lg border border-slate-200 p-3">
                  <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    {columns.map(c => <div key={c} className="flex min-w-0 gap-2"><dt className="shrink-0 font-semibold text-slate-600" dir="ltr">{c}</dt><dd className="min-w-0 break-words text-slate-700">{r[c] || '—'}</dd></div>)}
                  </dl>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">אין עדיין רשומות בטופס</p>)}
        </div>
      </Card>
    </div>
  )
}
