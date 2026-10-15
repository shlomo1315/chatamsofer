'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Copy, Download, ExternalLink, Eye, FileSpreadsheet, FileText, FileUp, Inbox, Link2, Loader2, MailCheck, Newspaper, Plus, RefreshCw, Search, Send, ShieldAlert, Trash2, Truck, Upload, UserPlus, Users, X } from 'lucide-react'
import { downloadXlsx, todayStamp } from '@/lib/downloadXlsx'
import { defaultSubject } from '@/lib/gilyonotMail'
import type { NedarimPullView } from '@/lib/gilyonotNedarimPull'
import NedarimPull from './NedarimPull'
import Distributors from './Distributors'
import { Badge, btnDanger, btnGhost, btnPrimary, Card, CardHeader, input, link, Meter, Notice, Stat, StepNum, type Tone } from './ui'

export interface SubscriberView {
  id: string
  email: string
  full_name: string | null
  source: 'web' | 'nedarim' | 'manual' | 'import'
  status: 'active' | 'unsubscribed'
  created_at: string
  unsubscribed_at: string | null
}

export interface IssueView {
  id: string
  title: string
  parasha: string
  subject: string
  intro: string | null
  file_name: string
  file_size: number | null
  status: 'draft' | 'sending' | 'sent'
  total_count: number | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  sent_count: number
  failed_count: number
  pending_count: number
  opened_count: number
  downloaded_count: number
}

const SOURCES: Record<SubscriberView['source'], string> = { web: 'אתר', nedarim: 'נדרים פלוס', manual: 'ידני', import: 'ייבוא' }
const SOURCE_TONE: Record<SubscriberView['source'], Tone> = { web: 'navy', nedarim: 'sky', manual: 'neutral', import: 'neutral' }
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const pct = (n: number, of: number) => (of ? ` (${Math.round((n / of) * 100)}%)` : '')
const num = (n: number) => n.toLocaleString('he-IL')

async function api(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'הפעולה נכשלה')
  return data
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export default function GilyonotClient(props: {
  tab: 'subscribers' | 'issues' | 'nedarim' | 'distributors'
  subscribers: SubscriberView[]
  nedarim: NedarimPullView | null
  distributors: Omit<React.ComponentProps<typeof Distributors>, 'canAdd' | 'canEdit' | 'canDelete'> | null
  issues: IssueView[]
  defaultParasha: string
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
}) {
  const active = props.subscribers.filter(s => s.status === 'active').length
  const tabs = [
    { key: 'subscribers', label: 'רשימת תפוצה', count: active, icon: Users },
    { key: 'issues', label: 'גיליונות ושליחה', count: props.issues.length, icon: Newspaper },
    { key: 'distributors', label: 'מפיצים', count: props.distributors ? props.distributors.rows.filter(r => r.status === 'active').length : null, icon: Truck },
    ...(props.nedarim ? [{ key: 'nedarim', label: 'נדרים פלוס', count: null, icon: RefreshCw }] : []),
  ]
  return (
    <div className="space-y-6">
      <Overview subscribers={props.subscribers} active={active} issues={props.issues} />

      <nav aria-label="לשוניות">
        <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-200/60 p-1 sm:inline-flex">
          {tabs.map(t => {
            const on = props.tab === t.key
            return (
              <Link
                key={t.key} href={`?tab=${t.key}`} scroll={false} aria-current={on ? 'page' : undefined}
                className={`flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-150 sm:flex-none ${on ? 'bg-white text-[#1B3256] shadow-sm ring-1 ring-slate-900/5' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <t.icon className="h-4 w-4" aria-hidden />{t.label}
                {t.count !== null && <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${on ? 'bg-[#1B3256] text-white' : 'bg-white/70 text-slate-600'}`}>{num(t.count)}</span>}
              </Link>
            )
          })}
        </div>
      </nav>

      {props.tab === 'distributors'
        ? (props.distributors ? <Distributors {...props.distributors} canAdd={props.canAdd} canEdit={props.canEdit} canDelete={props.canDelete} /> : null)
        : props.tab === 'nedarim' && props.nedarim
        ? <NedarimPull view={props.nedarim} />
        : props.tab !== 'issues'
        ? <Subscribers rows={props.subscribers} canAdd={props.canAdd} canEdit={props.canEdit} canDelete={props.canDelete} />
        : <Issues rows={props.issues} activeCount={active} defaultParasha={props.defaultParasha} canAdd={props.canAdd} canEdit={props.canEdit} canDelete={props.canDelete} />}
    </div>
  )
}

// ─── תמונת מצב בראש העמוד ────────────────────────────────────────────────────

function Overview({ subscribers, active, issues }: { subscribers: SubscriberView[]; active: number; issues: IssueView[] }) {
  const [now] = useState(() => Date.now())
  const { recent, removed } = useMemo(() => {
    const since = now - 30 * 86_400_000
    return {
      recent: subscribers.filter(s => s.status === 'active' && new Date(s.created_at).getTime() >= since).length,
      removed: subscribers.length - active,
    }
  }, [subscribers, active, now])
  const lastSent = issues.find(i => i.status !== 'draft')
  const draft = issues.find(i => i.status === 'draft')

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <OverviewTile label="נרשמים פעילים" value={num(active)} sub={removed ? `${num(removed)} הסירו את עצמם` : 'אף אחד לא הסיר את עצמו'} />
      <OverviewTile label="הצטרפו ב-30 יום" value={num(recent)} sub="מכל המקורות" />
      <OverviewTile
        label="גיליון אחרון"
        value={lastSent ? `פרשת ${lastSent.parasha}` : '—'}
        sub={lastSent ? (lastSent.status === 'sending' ? 'בשליחה עכשיו' : `נשלח ${fmtDate(lastSent.completed_at ?? lastSent.started_at)}`) : 'עוד לא נשלח גיליון'}
      />
      <OverviewTile
        label={draft ? 'ממתין לשליחה' : 'פתחו את האחרון'}
        value={draft ? `פרשת ${draft.parasha}` : lastSent ? `${lastSent.sent_count ? Math.round((lastSent.opened_count / lastSent.sent_count) * 100) : 0}%` : '—'}
        sub={draft ? 'טיוטה מוכנה, בלשונית הגיליונות' : lastSent ? `${num(lastSent.opened_count)} מתוך ${num(lastSent.sent_count)}` : ''}
        accent={!!draft}
      />
    </dl>
  )
}

function OverviewTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl px-4 py-4 sm:px-5 ${accent ? 'bg-[#1B3256] text-white shadow-md shadow-[#1B3256]/20' : 'bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-900/[0.06]'}`}>
      <dt className={`text-xs font-medium ${accent ? 'text-white/70' : 'text-slate-500'}`}>{label}</dt>
      <dd className={`mt-1.5 truncate text-xl font-bold tabular-nums sm:text-2xl ${accent ? 'text-white' : 'text-slate-900'}`}>{value}</dd>
      {sub && <dd className={`mt-1 truncate text-xs ${accent ? 'text-white/75' : 'text-slate-500'}`}>{sub}</dd>}
    </div>
  )
}

// ─── רשימת התפוצה ────────────────────────────────────────────────────────────

function Subscribers({ rows, canAdd, canEdit, canDelete }: { rows: SubscriberView[]; canAdd: boolean; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [source, setSource] = useState('')
  const [status, setStatus] = useState('active')
  const [panel, setPanel] = useState<'' | 'add' | 'paste'>('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r =>
      (!source || r.source === source) && (!status || r.status === status) &&
      (!needle || r.email.includes(needle) || (r.full_name ?? '').toLowerCase().includes(needle)))
  }, [rows, q, source, status])

  const signupUrl = typeof window === 'undefined' ? '/gilyonot' : `${window.location.origin}/gilyonot`

  async function run(fn: () => Promise<string>) {
    setBusy(true); setMsg(null); setSummary(null)
    try { setMsg({ ok: true, text: await fn() }); router.refresh() }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'הפעולה נכשלה' }) }
    finally { setBusy(false) }
  }

  // יבוא מקובץ או מהדבקה: אותו מסלול בשרת, והתוצאה מוצגת כסיכום
  async function importWith(init: RequestInit) {
    setBusy(true); setMsg(null); setSummary(null)
    try {
      const d = await api('/api/admin/gilyonot/subscribers', init)
      setSummary({ added: Number(d.added) || 0, exists: Number(d.exists) || 0, blocked: Number(d.blocked) || 0, invalid: Number(d.invalid) || 0 })
      setPanel('')
      router.refresh()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'היבוא נכשל' }) }
    finally { setBusy(false) }
  }
  function uploadFile(file: File) {
    const fd = new FormData()
    fd.set('file', file)
    importWith({ method: 'POST', body: fd })
  }
  const pickFile = () => fileRef.current?.click()

  const setRowStatus = (r: SubscriberView, next: SubscriberView['status']) =>
    run(async () => { await api('/api/admin/gilyonot/subscribers', json('PATCH', { id: r.id, status: next })); return next === 'active' ? `${r.email} הוחזר לרשימה` : `${r.email} הוסר מהרשימה` })
  const remove = (r: SubscriberView) => {
    if (!confirm(`למחוק לגמרי את ${r.email}? (עדיף "הסרה", שמונעת הוספה חוזרת בייבוא)`)) return
    run(async () => { await api(`/api/admin/gilyonot/subscribers?id=${r.id}`, { method: 'DELETE' }); return `${r.email} נמחק` })
  }

  function exportXlsx() {
    downloadXlsx({
      filename: `gilyonot-subscribers-${todayStamp()}.xlsx`,
      sheetName: 'רשימת תפוצה',
      columns: [{ header: 'שם', width: 24 }, { header: 'מייל', width: 32 }, { header: 'מקור' }, { header: 'סטטוס' }, { header: 'נרשם', kind: 'date' }],
      rows: filtered.map(r => [r.full_name ?? '', r.email, SOURCES[r.source], r.status === 'active' ? 'פעיל' : 'הוסר', new Date(r.created_at)]),
    }).catch(e => setMsg({ ok: false, text: e instanceof Error ? e.message : 'הייצוא נכשל' }))
  }

  const th = 'px-4 py-3 text-right text-xs font-semibold text-slate-500'
  const filteredOut = rows.length > 0 && !filtered.length

  return (
    <div className="space-y-5">
      <input ref={fileRef} type="file" accept={IMPORT_ACCEPT} className="hidden" aria-hidden tabIndex={-1}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadFile(f) }} />

      <div className={`grid grid-cols-1 gap-4 [&>*]:min-w-0 ${canAdd ? 'lg:grid-cols-3' : ''}`}>
        {canAdd && <div className="lg:col-span-2"><UploadCard busy={busy} onPick={pickFile} onFile={uploadFile} onPaste={() => setPanel(panel === 'paste' ? '' : 'paste')} /></div>}
        <Card className="flex flex-col justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1B3256]/[0.07] text-[#1B3256]"><Link2 className="h-5 w-5" aria-hidden /></div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">קישור ההרשמה לציבור</h2>
              <p className="mt-0.5 text-sm text-slate-600">מי שנרשם דרכו נכנס לרשימה מיד.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-1.5 ring-1 ring-inset ring-slate-900/[0.05]">
            <span dir="ltr" className="min-w-0 flex-1 truncate px-2 text-right text-sm text-slate-600">{signupUrl}</span>
            <a href={signupUrl} target="_blank" rel="noreferrer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900" aria-label="פתיחת דף ההרשמה">
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
            <button type="button" className={`${btnGhost} min-h-9 shrink-0 px-3`} onClick={() => { navigator.clipboard?.writeText(signupUrl); setMsg({ ok: true, text: 'הקישור הועתק' }) }}>
              <Copy className="h-4 w-4" aria-hidden />העתקה
            </button>
          </div>
        </Card>
      </div>

      {summary && <ImportResult s={summary} onClose={() => setSummary(null)} />}
      {panel === 'paste' && <PasteForm busy={busy} onClose={() => setPanel('')} onSubmit={text => importWith(json('POST', { mode: 'import', text }))} />}

      <Card className="overflow-hidden">
        <div className="space-y-4 p-4 sm:p-5">
          <CardHeader
            icon={<Users className="h-5 w-5" aria-hidden />}
            title="הנרשמים"
            hint={rows.length ? `${num(filtered.length)} מוצגים מתוך ${num(rows.length)}` : 'כאן יופיעו כל מי שנרשם לקבל את הגיליון'}
          >
            {canAdd && <button type="button" className={btnPrimary} onClick={() => setPanel(panel === 'add' ? '' : 'add')}><UserPlus className="h-4 w-4" aria-hidden />הוספת נרשם</button>}
            <button type="button" className={btnGhost} onClick={exportXlsx} disabled={!filtered.length}><Download className="h-4 w-4" aria-hidden />ייצוא לאקסל</button>
          </CardHeader>

          {panel === 'add' && <AddForm busy={busy} onClose={() => setPanel('')} onSubmit={(email, name) => run(async () => {
            const d = await api('/api/admin/gilyonot/subscribers', json('POST', { mode: 'add', email, name }))
            const o = d.outcome
            return o === 'exists' ? 'המייל כבר ברשימה' : o === 'blocked_unsubscribed' ? 'המייל הוסר בעבר לבקשת הנמען, ולכן לא הוחזר. אפשר להחזיר אותו ידנית מסינון "הוסרו".' : 'נוסף לרשימה'
          })} />}

          {rows.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative sm:flex-1">
                <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input className={`${input} pr-10`} placeholder="חיפוש לפי שם או מייל" value={q} onChange={e => setQ(e.target.value)} aria-label="חיפוש" />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <select className={`${field} w-full sm:w-40`} value={source} onChange={e => setSource(e.target.value)} aria-label="מקור">
                  <option value="">כל המקורות</option>
                  {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select className={`${field} w-full sm:w-32`} value={status} onChange={e => setStatus(e.target.value)} aria-label="סטטוס">
                  <option value="active">פעילים</option>
                  <option value="unsubscribed">הוסרו</option>
                  <option value="">הכול</option>
                </select>
              </div>
            </div>
          )}

          <Notice msg={msg} />
        </div>

        {!rows.length ? (
          <div className="border-t border-slate-100 px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1B3256]/[0.07] text-[#1B3256]"><Inbox className="h-7 w-7" aria-hidden /></div>
            <p className="mt-4 font-bold text-slate-900">עוד אין נרשמים</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">העלו רשימה מקובץ, חברו את טופס נדרים פלוס, או שתפו את קישור ההרשמה.</p>
          </div>
        ) : (
          <>
            <div className="border-t border-slate-100">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-slate-50/70">
                  <tr>
                    <th className={`${th} w-[40%] sm:w-[28%]`}>שם</th>
                    <th className={th}>מייל</th>
                    <th className={`${th} hidden w-32 sm:table-cell`}>מקור</th>
                    <th className={`${th} hidden w-36 md:table-cell`}>נרשם</th>
                    <th className={`${th} w-24 sm:w-28`}><span className="sr-only">פעולות</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.slice(0, 500).map(r => {
                    const off = r.status === 'unsubscribed'
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:flex ${off ? 'bg-slate-100 text-slate-400' : 'bg-[#1B3256]/[0.08] text-[#1B3256]'}`} aria-hidden>
                              {(r.full_name || r.email).trim().charAt(0).toUpperCase()}
                            </span>
                            <span className={`min-w-0 break-words font-medium ${off ? 'text-slate-400' : 'text-slate-900'}`}>{r.full_name || <span className="font-normal text-slate-400">ללא שם</span>}</span>
                          </div>
                        </td>
                        <td className={`break-all px-4 py-3 text-right ${off ? 'text-slate-400' : 'text-slate-700'}`} dir="ltr">
                          {r.email}
                          <span className="mt-1 flex flex-wrap gap-1 sm:hidden" dir="rtl"><Badge tone={SOURCE_TONE[r.source]}>{SOURCES[r.source]}</Badge>{off && <Badge tone="rose">הוסר</Badge>}</span>
                        </td>
                        <td className="hidden px-4 py-3 sm:table-cell">
                          <span className="flex flex-wrap gap-1"><Badge tone={SOURCE_TONE[r.source]}>{SOURCES[r.source]}</Badge>{off && <Badge tone="rose">הוסר</Badge>}</span>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-slate-500 md:table-cell">{fmtDate(r.created_at)}</td>
                        <td className="px-2 py-2 text-left sm:px-4">
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && (r.status === 'active'
                              ? <button type="button" disabled={busy} className="min-h-9 rounded-lg px-2.5 text-sm text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50" onClick={() => setRowStatus(r, 'unsubscribed')}>הסרה</button>
                              : <button type="button" disabled={busy} className="min-h-9 rounded-lg px-2.5 text-sm text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50" onClick={() => setRowStatus(r, 'active')}>החזרה</button>)}
                            {canDelete && <button type="button" disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50" onClick={() => remove(r)} aria-label={`מחיקת ${r.email}`}><Trash2 className="h-4 w-4" /></button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filteredOut && (
              <div className="border-t border-slate-100 px-6 py-10 text-center">
                <Search className="mx-auto h-6 w-6 text-slate-300" aria-hidden />
                <p className="mt-2 text-sm text-slate-600">אין נרשמים שמתאימים לחיפוש או לסינון</p>
                <button type="button" className={`${link} mt-2 text-sm`} onClick={() => { setQ(''); setSource(''); setStatus('') }}>ניקוי הסינון</button>
              </div>
            )}
            {filtered.length > 500 && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">מוצגים 500 הראשונים. כדי לראות את כולם, צמצמו בחיפוש או ייצאו לאקסל.</p>}
          </>
        )}
      </Card>
    </div>
  )
}

interface ImportSummary { added: number; exists: number; blocked: number; invalid: number }
const IMPORT_ACCEPT = '.xlsx,.csv,.txt'
// שדה בלי w-full: בסרגל הסינון הרוחב נקבע לפי המקום
const field = input.replace('w-full ', '')

function downloadSample() {
  const csv = '﻿שם,מייל\nישראל ישראלי,israel@example.com\nמשה כהן,moshe@example.com\n'
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'gilyonot-sample.csv'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function UploadCard({ busy, onPick, onFile, onPaste }: { busy: boolean; onPick: () => void; onFile: (f: File) => void; onPaste: () => void }) {
  const [over, setOver] = useState(false)
  return (
    <Card
      aria-label="העלאת רשימת תפוצה"
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) onFile(f) }}
      className="h-full p-2"
    >
      <div className={`flex h-full flex-col gap-4 rounded-xl border-2 border-dashed p-4 transition-colors duration-150 sm:flex-row sm:items-center sm:p-5 ${over ? 'border-[#1B3256] bg-[#1B3256]/[0.04]' : 'border-slate-200'}`}>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1B3256]/[0.07] text-[#1B3256]">
          <FileSpreadsheet className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">העלאת רשימה מקובץ</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">גררו לכאן Excel או CSV עם עמודת מייל (ושם, אם יש). מי שכבר ברשימה לא ייכנס פעמיים.</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <button type="button" className={link} onClick={downloadSample}>קובץ לדוגמה</button>
            <button type="button" className={link} onClick={onPaste}>הדבקת רשימה</button>
          </div>
        </div>
        <button type="button" disabled={busy} onClick={onPick} className={`${btnPrimary} sm:shrink-0`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          {busy ? 'מעלה...' : 'בחירת קובץ'}
        </button>
      </div>
    </Card>
  )
}

function ImportResult({ s, onClose }: { s: ImportSummary; onClose: () => void }) {
  return (
    <Card role="status" className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />היבוא הסתיים</h2>
        <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="סגירת הסיכום"><X className="h-4 w-4" /></button>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="נקלטו" value={num(s.added)} tone="green" />
        <Stat label="כבר ברשימה" value={num(s.exists)} />
        <Stat label="הסירו את עצמם בעבר" value={num(s.blocked)} />
        <Stat label="שורות לא תקינות" value={num(s.invalid)} tone={s.invalid ? 'rose' : undefined} />
      </dl>
      {s.blocked > 0 && <p className="mt-3 text-xs text-slate-600">מי שהסיר את עצמו מהרשימה לא מוחזר ביבוא. אם צריך, אפשר להחזיר ידנית מסינון &quot;הוסרו&quot;.</p>}
    </Card>
  )
}

function AddForm({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (email: string, name: string) => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  return (
    <form className="grid gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-900/[0.05] sm:grid-cols-[1fr_1fr_auto]" onSubmit={e => { e.preventDefault(); onSubmit(email, name); setEmail(''); setName('') }}>
      <input className={input} placeholder="שם (לא חובה)" value={name} onChange={e => setName(e.target.value)} aria-label="שם" />
      <input className={input} type="email" dir="ltr" placeholder="email@example.com" required value={email} onChange={e => setEmail(e.target.value)} aria-label="מייל" />
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !email.trim()} className={`${btnPrimary} flex-1 sm:flex-none`}><Plus className="h-4 w-4" aria-hidden />הוספה</button>
        <button type="button" className={btnGhost} onClick={onClose} aria-label="סגירה"><X className="h-4 w-4" /></button>
      </div>
    </form>
  )
}

function PasteForm({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <Card className="p-5">
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); onSubmit(text) }}>
        <CardHeader icon={<Copy className="h-5 w-5" aria-hidden />} title="הדבקת רשימה" hint="מאקסל או מהייצוא של נדרים: שורה לכל נרשם, מייל ושם בכל סדר, מופרדים בטאב, פסיק או נקודה-פסיק." />
        <textarea className={`${input} h-40 font-mono`} dir="ltr" value={text} onChange={e => setText(e.target.value)} aria-label="רשימה לייבוא" />
        <div className="flex gap-2">
          <button type="submit" disabled={busy || !text.trim()} className={btnPrimary}>{busy ? 'מייבא...' : 'יבוא לרשימה'}</button>
          <button type="button" className={btnGhost} onClick={onClose}>ביטול</button>
        </div>
      </form>
    </Card>
  )
}

// ─── גיליונות: העלאה, תצוגה מקדימה, שליחה וארכיון ───────────────────────────

const STATUS: Record<IssueView['status'], { label: string; tone: Tone }> = {
  draft: { label: 'טיוטה', tone: 'amber' },
  sending: { label: 'בשליחה', tone: 'sky' },
  sent: { label: 'נשלח', tone: 'green' },
}

function Issues({ rows, activeCount, defaultParasha, canAdd, canEdit, canDelete }: {
  rows: IssueView[]; activeCount: number; defaultParasha: string; canAdd: boolean; canEdit: boolean; canDelete: boolean
}) {
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(rows.find(r => r.status === 'draft')?.id ?? null)
  const open = rows.find(r => r.id === openId) ?? null
  const th = 'px-4 py-3 text-right text-xs font-semibold text-slate-500'

  return (
    <div className="space-y-5">
      {!creating && (
        <Card className="p-5">
          <CardHeader icon={<Newspaper className="h-5 w-5" aria-hidden />} title="הגיליון השבועי" hint="שלושה צעדים, ואפשר לעצור בכל אחד מהם.">
            {canAdd && <button type="button" className={btnPrimary} onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden />גיליון חדש</button>}
          </CardHeader>
          <ol className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ['העלאת הקובץ', 'PDF, Word או תמונה, עם פרשה ונושא למייל.'],
              ['בדיקה', 'תצוגה מקדימה של המייל, ומייל ניסיון אליכם.'],
              ['שליחה לכל הרשימה', `${num(activeCount)} נרשמים פעילים. יוצא במנות, לא בשבת ובחג.`],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3 rounded-xl bg-slate-50/80 p-3.5 ring-1 ring-inset ring-slate-900/[0.04]">
                <StepNum n={i + 1} />
                <div><p className="text-sm font-semibold text-slate-900">{t}</p><p className="mt-0.5 text-xs leading-relaxed text-slate-600">{d}</p></div>
              </li>
            ))}
          </ol>
        </Card>
      )}
      {creating && <NewIssue defaultParasha={defaultParasha} onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setOpenId(id) }} />}
      {open && <IssueDetail key={open.id} issue={open} activeCount={activeCount} canEdit={canEdit} canDelete={canDelete} onClose={() => setOpenId(null)} />}

      <Card className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <CardHeader icon={<FileText className="h-5 w-5" aria-hidden />} title="ארכיון הגיליונות" hint={rows.length ? `${num(rows.length)} גיליונות, מהחדש לישן` : undefined} />
        </div>
        {!rows.length ? (
          <div className="border-t border-slate-100 px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1B3256]/[0.07] text-[#1B3256]"><Newspaper className="h-7 w-7" aria-hidden /></div>
            <p className="mt-4 font-bold text-slate-900">עוד לא הועלו גיליונות</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">לחצו &quot;גיליון חדש&quot; כדי להעלות את הגיליון של השבוע.</p>
          </div>
        ) : (
          <div className="border-t border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className={th}>פרשה</th>
                  <th className={th}>סטטוס</th>
                  <th className={`${th} hidden md:table-cell`}>נמענים</th>
                  <th className={`${th} hidden sm:table-cell`}>פתחו</th>
                  <th className={`${th} hidden sm:table-cell`}>הורידו</th>
                  <th className={`${th} hidden lg:table-cell`}>נכשלו</th>
                  <th className={th}><span className="sr-only">פעולות</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => {
                  const draft = r.status === 'draft'
                  return (
                    <tr key={r.id} className={`transition-colors ${r.id === openId ? 'bg-[#1B3256]/[0.03]' : 'hover:bg-slate-50/60'}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">פרשת {r.parasha}</p>
                        <p className="text-xs text-slate-500">{r.title}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS[r.status].tone} dot>{STATUS[r.status].label}</Badge>
                        {!draft && <p className="mt-1 text-xs tabular-nums text-slate-500">{fmtDate(r.completed_at ?? r.started_at)}</p>}
                      </td>
                      <td className="hidden px-4 py-3 tabular-nums text-slate-700 md:table-cell">{draft ? '—' : `${num(r.sent_count)} / ${num(r.total_count ?? 0)}`}</td>
                      <td className="hidden px-4 py-3 sm:table-cell" title={draft ? undefined : `${r.opened_count}${pct(r.opened_count, r.sent_count)}`}>{draft ? '—' : <Meter value={r.opened_count} of={r.sent_count} />}</td>
                      <td className="hidden px-4 py-3 sm:table-cell" title={draft ? undefined : `${r.downloaded_count}${pct(r.downloaded_count, r.sent_count)}`}>{draft ? '—' : <Meter value={r.downloaded_count} of={r.sent_count} />}</td>
                      <td className={`hidden px-4 py-3 tabular-nums lg:table-cell ${r.failed_count ? 'text-rose-700' : 'text-slate-400'}`}>{r.failed_count || '—'}</td>
                      <td className="px-4 py-3 text-left">
                        <button type="button" className={`${btnGhost} min-h-9 px-3`} onClick={() => setOpenId(r.id)}>
                          <Eye className="h-4 w-4" aria-hidden />{draft ? 'המשך' : 'פרטים'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && <p className="border-t border-slate-100 px-5 py-3 text-xs leading-relaxed text-slate-500">&quot;פתחו&quot; נספר לפי טעינת תמונה במייל, ולכן הוא הערכה: חלק מתוכנות המייל חוסמות תמונות. מי שהוריד את הקובץ נספר גם כמי שפתח.</p>}
      </Card>
    </div>
  )
}

function NewIssue({ defaultParasha, onClose, onCreated }: { defaultParasha: string; onClose: () => void; onCreated: (id: string) => void }) {
  const router = useRouter()
  const [title, setTitle] = useState('גיליון החתם סופר')
  const [parasha, setParasha] = useState(defaultParasha)
  const [subject, setSubject] = useState('')
  const [intro, setIntro] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setErr('בחרו את קובץ הגיליון'); return }
    setBusy(true); setErr('')
    const fd = new FormData()
    fd.set('file', file); fd.set('title', title); fd.set('parasha', parasha); fd.set('intro', intro)
    fd.set('subject', subject.trim() || defaultSubject(title, parasha))
    try {
      const d = await api('/api/admin/gilyonot/issues', { method: 'POST', body: fd })
      router.refresh()
      onCreated(String(d.id))
    } catch (e) { setErr(e instanceof Error ? e.message : 'ההעלאה נכשלה') }
    finally { setBusy(false) }
  }

  const label = 'mb-1.5 block text-sm font-medium text-slate-800'
  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-5">
        <CardHeader icon={<FileUp className="h-5 w-5" aria-hidden />} title="גיליון חדש" hint="אחרי ההעלאה תראו בדיוק איך המייל ייראה, לפני שהוא נשלח למישהו." />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={label}>פרשה</span>
            <input className={input} value={parasha} onChange={e => setParasha(e.target.value)} required maxLength={60} />
            <span className="mt-1 block text-xs text-slate-500">הוצע לפי השבוע הנוכחי. אפשר לשנות.</span>
          </label>
          <label className="block"><span className={label}>שם הגיליון</span>
            <input className={input} value={title} onChange={e => setTitle(e.target.value)} required maxLength={120} />
          </label>
        </div>
        <label className="block"><span className={label}>נושא המייל</span>
          <input className={input} value={subject} onChange={e => setSubject(e.target.value)} placeholder={defaultSubject(title, parasha)} maxLength={200} />
          <span className="mt-1 block text-xs text-slate-500">אם תשאירו ריק, יישלח הנושא שמוצג באפור.</span>
        </label>
        <label className="block"><span className={label}>פתיח למייל <span className="font-normal text-slate-500">(לא חובה)</span></span>
          <textarea className={`${input} h-24`} value={intro} onChange={e => setIntro(e.target.value)} maxLength={4000} />
        </label>
        <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors duration-150 focus-within:ring-4 focus-within:ring-[#1B3256]/10 ${file ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 hover:border-[#1B3256]/40 hover:bg-slate-50'}`}>
          {file ? <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden /> : <Upload className="h-7 w-7 text-[#1B3256]" aria-hidden />}
          <span className="text-sm font-semibold text-slate-900">{file ? file.name : 'בחירת קובץ הגיליון'}</span>
          <span className="text-xs text-slate-500">{file ? 'לחצו כדי להחליף' : 'PDF, Word או תמונה, עד 25MB'}</span>
          <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files?.[0] ?? null)} className="sr-only" />
        </label>
        {err && <Notice msg={{ ok: false, text: err }} />}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
          <button type="submit" disabled={busy} className={btnPrimary}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}{busy ? 'מעלה...' : 'העלאה והמשך לתצוגה מקדימה'}</button>
          <button type="button" className={btnGhost} onClick={onClose}>ביטול</button>
        </div>
      </form>
    </Card>
  )
}

function IssueDetail({ issue, activeCount, canEdit, canDelete, onClose }: { issue: IssueView; activeCount: number; canEdit: boolean; canDelete: boolean; onClose: () => void }) {
  const router = useRouter()
  const base = `/api/admin/gilyonot/issues/${issue.id}`
  const draft = issue.status === 'draft'
  const [testTo, setTestTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [frameKey, setFrameKey] = useState(0)

  async function run(fn: () => Promise<string>) {
    setBusy(true); setMsg(null)
    try { setMsg({ ok: true, text: await fn() }); router.refresh() }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'הפעולה נכשלה' }) }
    finally { setBusy(false) }
  }

  const sendTest = () => run(async () => {
    const d = await api(`${base}/test`, json('POST', { email: testTo }))
    return `מייל ניסיון נשלח אל ${d.to}`
  })
  const sendAll = () => {
    if (!confirm(`לשלוח את "${issue.title}" ל-${activeCount.toLocaleString('he-IL')} נרשמים פעילים? אי אפשר לבטל אחרי השליחה.`)) return
    run(async () => {
      const d = await api(`${base}/send`, { method: 'POST' })
      return `השליחה התחילה ל-${Number(d.total).toLocaleString('he-IL')} נמענים. המיילים יוצאים במנות בדקות הקרובות (לא בשבת ובחג).`
    })
  }
  const remove = () => {
    if (!confirm('למחוק את הטיוטה ואת הקובץ?')) return
    run(async () => { await api(base, { method: 'DELETE' }); onClose(); return 'הטיוטה נמחקה' })
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">פרשת {issue.parasha}</h2>
            <Badge tone={STATUS[issue.status].tone} dot>{STATUS[issue.status].label}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600"><span className="text-slate-500">נושא:</span> {issue.subject}</p>
          <a href={`${base}/file`} target="_blank" rel="noreferrer" className={`${link} mt-1.5 inline-flex items-center gap-1.5 text-sm`}>
            <FileText className="h-4 w-4" aria-hidden />{issue.file_name}
          </a>
        </div>
        <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={onClose} aria-label="סגירה"><X className="h-5 w-5" /></button>
      </div>

      {!draft && (
        <dl className="grid grid-cols-2 gap-3 border-b border-slate-100 p-5 sm:grid-cols-5">
          <Stat label="נמענים" value={num(issue.total_count ?? 0)} />
          <Stat label="נשלחו" value={num(issue.sent_count)} sub={issue.failed_count ? `${num(issue.failed_count)} נכשלו` : undefined} />
          <Stat label="ממתינים" value={num(issue.pending_count)} />
          <Stat label="פתחו" value={num(issue.opened_count)} sub={pct(issue.opened_count, issue.sent_count).trim().replace(/[()]/g, '') || undefined} />
          <Stat label="הורידו" value={num(issue.downloaded_count)} sub={pct(issue.downloaded_count, issue.sent_count).trim().replace(/[()]/g, '') || undefined} />
        </dl>
      )}

      <div className={`grid gap-5 p-5 ${draft && canEdit ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Eye className="h-4 w-4" aria-hidden />כך המייל ייראה אצל הנמען</h3>
            <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={() => setFrameKey(k => k + 1)}><RefreshCw className="h-3.5 w-3.5" aria-hidden />רענון</button>
          </div>
          <div className="overflow-hidden rounded-xl bg-slate-100 p-2 ring-1 ring-inset ring-slate-900/[0.05]">
            <iframe key={frameKey} src={`${base}/preview`} title="תצוגה מקדימה" className="h-[560px] w-full rounded-lg bg-white" />
          </div>
          {!(draft && canEdit) && <div className="mt-4"><Notice msg={msg} /></div>}
        </div>

        {draft && canEdit && (
          <aside className="space-y-4">
            <div className="rounded-xl bg-slate-50/80 p-4 ring-1 ring-inset ring-slate-900/[0.04]">
              <div className="flex items-center gap-2.5"><StepNum n={1} /><h3 className="text-sm font-semibold text-slate-900">מייל ניסיון</h3></div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">שלחו לעצמכם ובדקו שהכול נראה טוב. בלי כתובת, יישלח למייל שלכם.</p>
              <input className={`${input} mt-3`} type="email" dir="ltr" placeholder="המייל שלי (ברירת מחדל)" value={testTo} onChange={e => setTestTo(e.target.value)} aria-label="כתובת לניסיון" />
              <button type="button" disabled={busy} className={`${btnGhost} mt-2 w-full`} onClick={sendTest}><MailCheck className="h-4 w-4" aria-hidden />שליחת ניסיון</button>
            </div>

            <div className="rounded-xl p-4 ring-1 ring-inset ring-[#1B3256]/15">
              <div className="flex items-center gap-2.5"><StepNum n={2} /><h3 className="text-sm font-semibold text-slate-900">שליחה לכל הרשימה</h3></div>
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />אחרי שליחה אי אפשר לבטל. המיילים יוצאים במנות, לא בשבת ובחג.</p>
              <button type="button" disabled={busy || !activeCount} className={`${btnPrimary} mt-3 w-full py-2.5`} onClick={sendAll}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}שליחה ל-{num(activeCount)} נרשמים
              </button>
            </div>

            <Notice msg={msg} />

            {canDelete && <button type="button" disabled={busy} className={`${btnDanger} w-full`} onClick={remove}><Trash2 className="h-4 w-4" aria-hidden />מחיקת הטיוטה</button>}
          </aside>
        )}
      </div>
    </Card>
  )
}
