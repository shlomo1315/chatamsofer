'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Copy, Download, Eye, FileSpreadsheet, FileText, Loader2, Plus, Search, Send, Trash2, Upload, Users, X } from 'lucide-react'
import { downloadXlsx, todayStamp } from '@/lib/downloadXlsx'
import { defaultSubject } from '@/lib/gilyonotMail'
import type { NedarimPullView } from '@/lib/gilyonotNedarimPull'
import NedarimPull from './NedarimPull'

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
const NAVY = '#1B3256'
const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1B3256] focus:outline-none focus:ring-2 focus:ring-[#1B3256]/20'
const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50'
const btnPrimary = `${btn} text-white`
const btnGhost = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const pct = (n: number, of: number) => (of ? ` (${Math.round((n / of) * 100)}%)` : '')

async function api(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'הפעולה נכשלה')
  return data
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export default function GilyonotClient(props: {
  tab: 'subscribers' | 'issues' | 'nedarim'
  subscribers: SubscriberView[]
  nedarim: NedarimPullView | null
  issues: IssueView[]
  defaultParasha: string
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
}) {
  const active = props.subscribers.filter(s => s.status === 'active').length
  const tabs = [
    { key: 'subscribers', label: `רשימת תפוצה (${active.toLocaleString('he-IL')})` },
    { key: 'issues', label: `גיליונות (${props.issues.length})` },
    ...(props.nedarim ? [{ key: 'nedarim', label: 'נדרים פלוס' }] : []),
  ]
  return (
    <div className="space-y-5">
      <nav className="flex gap-1 border-b border-slate-200" aria-label="לשוניות">
        {tabs.map(t => (
          <Link
            key={t.key} href={`?tab=${t.key}`} scroll={false}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${props.tab === t.key ? 'border-[#1B3256] text-[#1B3256]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >{t.label}</Link>
        ))}
      </nav>
      {props.tab === 'nedarim' && props.nedarim
        ? <NedarimPull view={props.nedarim} />
        : props.tab !== 'issues'
        ? <Subscribers rows={props.subscribers} canAdd={props.canAdd} canEdit={props.canEdit} canDelete={props.canDelete} />
        : <Issues rows={props.issues} activeCount={active} defaultParasha={props.defaultParasha} canAdd={props.canAdd} canEdit={props.canEdit} canDelete={props.canDelete} />}
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

  const th = 'px-4 py-3 text-right text-xs font-semibold text-slate-600'

  return (
    <div className="space-y-5">
      <input ref={fileRef} type="file" accept={IMPORT_ACCEPT} className="hidden" aria-hidden tabIndex={-1}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadFile(f) }} />

      {canAdd && <UploadCard busy={busy} onPick={pickFile} onFile={uploadFile} onPaste={() => setPanel(panel === 'paste' ? '' : 'paste')} />}
      {summary && <ImportResult s={summary} onClose={() => setSummary(null)} />}
      {panel === 'paste' && <PasteForm busy={busy} onClose={() => setPanel('')} onSubmit={text => importWith(json('POST', { mode: 'import', text }))} />}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">קישור ההרשמה לציבור</p>
          <p dir="ltr" className="truncate text-right text-sm text-slate-500">{signupUrl}</p>
        </div>
        <button type="button" className={`${btnGhost} shrink-0 self-start sm:self-auto`} onClick={() => { navigator.clipboard?.writeText(signupUrl); setMsg({ ok: true, text: 'הקישור הועתק' }) }}>
          <Copy className="h-4 w-4" aria-hidden />העתקת הקישור
        </button>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative lg:flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className={`${input} pr-9`} placeholder="חיפוש לפי שם או מייל" value={q} onChange={e => setQ(e.target.value)} aria-label="חיפוש" />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex">
          <select className={`${field} w-full lg:w-40`} value={source} onChange={e => setSource(e.target.value)} aria-label="מקור">
            <option value="">כל המקורות</option>
            {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className={`${field} w-full lg:w-32`} value={status} onChange={e => setStatus(e.target.value)} aria-label="סטטוס">
            <option value="active">פעילים</option>
            <option value="unsubscribed">הוסרו</option>
            <option value="">הכול</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAdd && <>
            <button type="button" className={btnPrimary} style={{ background: NAVY }} onClick={() => setPanel(panel === 'add' ? '' : 'add')}><Plus className="h-4 w-4" aria-hidden />הוספה</button>
            <button type="button" className={btnGhost} disabled={busy} onClick={pickFile}><Upload className="h-4 w-4" aria-hidden />יבוא</button>
          </>}
          <button type="button" className={btnGhost} onClick={exportXlsx} disabled={!filtered.length}><Download className="h-4 w-4" aria-hidden />ייצוא</button>
        </div>
      </div>

      {panel === 'add' && <AddForm busy={busy} onClose={() => setPanel('')} onSubmit={(email, name) => run(async () => {
        const d = await api('/api/admin/gilyonot/subscribers', json('POST', { mode: 'add', email, name }))
        const o = d.outcome
        return o === 'exists' ? 'המייל כבר ברשימה' : o === 'blocked_unsubscribed' ? 'המייל הוסר בעבר לבקשת הנמען, ולכן לא הוחזר. אפשר להחזיר אותו ידנית מסינון "הוסרו".' : 'נוסף לרשימה'
      })} />}

      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{msg.text}</p>}

      {!rows.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <Users className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
          <p className="mt-3 font-semibold text-slate-900">עוד אין נרשמים</p>
          <p className="mt-1 text-sm text-slate-600">העלו רשימה מקובץ, או שתפו את קישור ההרשמה.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">{filtered.length.toLocaleString('he-IL')} נרשמים מוצגים</p>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className={`${th} w-[34%] sm:w-[24%]`}>שם</th>
                  <th className={th}>מייל</th>
                  <th className={`${th} hidden w-28 sm:table-cell`}>מקור</th>
                  <th className={`${th} hidden w-36 md:table-cell`}>נרשם</th>
                  <th className={`${th} w-24`}><span className="sr-only">פעולות</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.slice(0, 500).map(r => (
                  <tr key={r.id} className={r.status === 'unsubscribed' ? 'text-slate-400' : 'text-slate-900'}>
                    <td className="break-words px-4 py-3">{r.full_name || <span className="text-slate-400">—</span>}</td>
                    <td className="break-all px-4 py-3 text-right" dir="ltr">{r.email}<span className="block text-xs text-slate-500 sm:hidden" dir="rtl">{SOURCES[r.source]}{r.status === 'unsubscribed' && ' · הוסר'}</span></td>
                    <td className="hidden px-4 py-3 sm:table-cell">{SOURCES[r.source]}{r.status === 'unsubscribed' && <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">הוסר</span>}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 md:table-cell">{fmtDate(r.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-left">
                      {canEdit && (r.status === 'active'
                        ? <button type="button" disabled={busy} className="text-sm text-slate-600 hover:text-rose-700" onClick={() => setRowStatus(r, 'unsubscribed')}>הסרה</button>
                        : <button type="button" disabled={busy} className="text-sm text-slate-600 hover:text-emerald-700" onClick={() => setRowStatus(r, 'active')}>החזרה</button>)}
                      {canDelete && <button type="button" disabled={busy} className="mr-3 text-slate-400 hover:text-rose-700" onClick={() => remove(r)} aria-label={`מחיקת ${r.email}`}><Trash2 className="inline h-4 w-4" /></button>}
                    </td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">אין נרשמים שמתאימים לחיפוש או לסינון</td></tr>}
              </tbody>
            </table>
          </div>
          {filtered.length > 500 && <p className="text-xs text-slate-500">מוצגים 500 הראשונים. כדי לראות את כולם, צמצמו בחיפוש או ייצאו לאקסל.</p>}
        </div>
      )}
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
    <section
      aria-label="העלאת רשימת תפוצה"
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) onFile(f) }}
      className={`rounded-xl border-2 border-dashed p-5 transition-colors sm:p-6 ${over ? 'border-[#1B3256] bg-[#1B3256]/5' : 'border-slate-300 bg-white'}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1B3256]/10">
          <FileSpreadsheet className="h-6 w-6 text-[#1B3256]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">העלאת רשימת תפוצה</h2>
          <p className="mt-1 text-sm text-slate-600">גררו לכאן קובץ Excel או CSV, או בחרו קובץ. צריך עמודת מייל, ועמודת שם אם יש. מי שכבר ברשימה לא ייכנס פעמיים.</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <button type="button" className="font-medium text-[#1B3256] underline-offset-4 hover:underline" onClick={downloadSample}>הורדת קובץ לדוגמה</button>
            <button type="button" className="font-medium text-[#1B3256] underline-offset-4 hover:underline" onClick={onPaste}>או הדבקת רשימה</button>
          </div>
        </div>
        <button type="button" disabled={busy} onClick={onPick} className={`${btnPrimary} justify-center px-5 py-2.5 sm:shrink-0`} style={{ background: NAVY }}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          {busy ? 'מעלה...' : 'בחירת קובץ'}
        </button>
      </div>
    </section>
  )
}

function ImportResult({ s, onClose }: { s: ImportSummary; onClose: () => void }) {
  const items: [string, number, string][] = [
    ['נקלטו', s.added, 'text-emerald-700'],
    ['כבר ברשימה', s.exists, 'text-slate-900'],
    ['הסירו את עצמם בעבר', s.blocked, 'text-slate-900'],
    ['שורות לא תקינות', s.invalid, s.invalid ? 'text-rose-700' : 'text-slate-900'],
  ]
  return (
    <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-emerald-900"><CheckCircle2 className="h-4 w-4" aria-hidden />היבוא הסתיים</h2>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800" aria-label="סגירת הסיכום"><X className="h-4 w-4" /></button>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map(([k, v, cls]) => (
          <div key={k} className="flex flex-col-reverse rounded-lg bg-white px-3 py-2">
            <dt className="text-xs text-slate-600">{k}</dt>
            <dd className={`text-xl font-bold ${cls}`}>{v.toLocaleString('he-IL')}</dd>
          </div>
        ))}
      </dl>
      {s.blocked > 0 && <p className="mt-2 text-xs text-slate-600">מי שהסיר את עצמו מהרשימה לא מוחזר ביבוא. אם צריך, אפשר להחזיר ידנית מסינון &quot;הוסרו&quot;.</p>}
    </section>
  )
}

function AddForm({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (email: string, name: string) => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  return (
    <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={e => { e.preventDefault(); onSubmit(email, name); setEmail(''); setName('') }}>
      <input className={input} placeholder="שם (לא חובה)" value={name} onChange={e => setName(e.target.value)} aria-label="שם" />
      <input className={input} type="email" dir="ltr" placeholder="email@example.com" required value={email} onChange={e => setEmail(e.target.value)} aria-label="מייל" />
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !email.trim()} className={btnPrimary} style={{ background: NAVY }}>הוספה</button>
        <button type="button" className={btnGhost} onClick={onClose} aria-label="סגירה"><X className="h-4 w-4" /></button>
      </div>
    </form>
  )
}

function PasteForm({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <form className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" onSubmit={e => { e.preventDefault(); onSubmit(text) }}>
      <p className="text-sm text-slate-600">הדביקו רשימה מאקסל או מהייצוא של נדרים: שורה לכל נרשם, מייל ושם (בכל סדר, מופרדים בטאב, פסיק או נקודה-פסיק).</p>
      <textarea className={`${input} h-40 font-mono`} dir="ltr" value={text} onChange={e => setText(e.target.value)} aria-label="רשימה לייבוא" />
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !text.trim()} className={btnPrimary} style={{ background: NAVY }}>{busy ? 'מייבא...' : 'יבוא'}</button>
        <button type="button" className={btnGhost} onClick={onClose}>ביטול</button>
      </div>
    </form>
  )
}

// ─── גיליונות: העלאה, תצוגה מקדימה, שליחה וארכיון ───────────────────────────

const STATUS: Record<IssueView['status'], { label: string; cls: string }> = {
  draft: { label: 'טיוטה', cls: 'bg-amber-50 text-amber-800' },
  sending: { label: 'בשליחה', cls: 'bg-sky-50 text-sky-800' },
  sent: { label: 'נשלח', cls: 'bg-emerald-50 text-emerald-800' },
}

function Issues({ rows, activeCount, defaultParasha, canAdd, canEdit, canDelete }: {
  rows: IssueView[]; activeCount: number; defaultParasha: string; canAdd: boolean; canEdit: boolean; canDelete: boolean
}) {
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(rows.find(r => r.status === 'draft')?.id ?? null)
  const open = rows.find(r => r.id === openId) ?? null

  return (
    <div className="space-y-5">
      {canAdd && !creating && (
        <button type="button" className={btnPrimary} style={{ background: NAVY }} onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />גיליון חדש
        </button>
      )}
      {creating && <NewIssue defaultParasha={defaultParasha} onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setOpenId(id) }} />}
      {open && <IssueDetail key={open.id} issue={open} activeCount={activeCount} canEdit={canEdit} canDelete={canDelete} onClose={() => setOpenId(null)} />}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-right text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">גיליון</th><th className="hidden px-3 py-2 font-medium sm:table-cell">פרשה</th>
              <th className="px-3 py-2 font-medium">נשלח</th><th className="hidden px-3 py-2 font-medium md:table-cell">נמענים</th>
              <th className="px-3 py-2 font-medium">פתחו</th><th className="px-3 py-2 font-medium">הורידו</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">נכשלו</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <tr key={r.id} className={r.id === openId ? 'bg-slate-50' : ''}>
                <td className="px-3 py-2 font-medium text-slate-900">{r.title}</td>
                <td className="hidden px-3 py-2 sm:table-cell">{r.parasha}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  {r.status !== 'draft' && <span className="mr-2 text-slate-600">{fmtDate(r.completed_at ?? r.started_at)}</span>}
                </td>
                <td className="hidden px-3 py-2 md:table-cell">{r.status === 'draft' ? '—' : `${r.sent_count}/${r.total_count ?? 0}`}</td>
                <td className="px-3 py-2">{r.status === 'draft' ? '—' : `${r.opened_count}${pct(r.opened_count, r.sent_count)}`}</td>
                <td className="px-3 py-2">{r.status === 'draft' ? '—' : `${r.downloaded_count}${pct(r.downloaded_count, r.sent_count)}`}</td>
                <td className="hidden px-3 py-2 md:table-cell">{r.failed_count || '—'}</td>
                <td className="px-3 py-2 text-left"><button type="button" className="text-sm font-medium text-[#1B3256] hover:underline" onClick={() => setOpenId(r.id)}>פתיחה</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">עוד לא הועלו גיליונות</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">עמודת &quot;פתחו&quot; נספרת לפי טעינת תמונה במייל, ולכן הוא הערכה: חלק מתוכנות המייל חוסמות תמונות. מי שהוריד את הקובץ נספר גם כמי שפתח.</p>
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

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold" style={{ color: NAVY }}>גיליון חדש</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">פרשה</span>
          <input className={input} value={parasha} onChange={e => setParasha(e.target.value)} required maxLength={60} />
          <span className="mt-1 block text-xs text-slate-500">הוצע לפי השבוע הנוכחי. אפשר לשנות.</span>
        </label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">שם הגיליון</span>
          <input className={input} value={title} onChange={e => setTitle(e.target.value)} required maxLength={120} />
        </label>
      </div>
      <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">נושא המייל</span>
        <input className={input} value={subject} onChange={e => setSubject(e.target.value)} placeholder={defaultSubject(title, parasha)} maxLength={200} />
      </label>
      <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">פתיח למייל (לא חובה)</span>
        <textarea className={`${input} h-24`} value={intro} onChange={e => setIntro(e.target.value)} maxLength={4000} />
      </label>
      <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">קובץ הגיליון (PDF, Word או תמונה, עד 25MB)</span>
        <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files?.[0] ?? null)} className="block text-sm" />
      </label>
      {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimary} style={{ background: NAVY }}><Upload className="h-4 w-4" aria-hidden />{busy ? 'מעלה...' : 'העלאה והמשך לתצוגה מקדימה'}</button>
        <button type="button" className={btnGhost} onClick={onClose}>ביטול</button>
      </div>
    </form>
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
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: NAVY }}>{issue.title} · {issue.parasha}</h2>
          <p className="text-sm text-slate-600">נושא: {issue.subject}</p>
          <a href={`${base}/file`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-[#1B3256] hover:underline">
            <FileText className="h-4 w-4" aria-hidden />{issue.file_name}
          </a>
        </div>
        <button type="button" className={btnGhost} onClick={onClose} aria-label="סגירה"><X className="h-4 w-4" /></button>
      </div>

      {!draft && (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {[
            ['נמענים', issue.total_count ?? 0], ['נשלחו', issue.sent_count], ['ממתינים', issue.pending_count],
            ['פתחו', `${issue.opened_count}${pct(issue.opened_count, issue.sent_count)}`],
            ['הורידו', `${issue.downloaded_count}${pct(issue.downloaded_count, issue.sent_count)}`],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-lg bg-slate-50 px-3 py-2"><dt className="text-slate-500">{k}</dt><dd className="text-lg font-bold text-slate-900">{v}</dd></div>
          ))}
        </dl>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><Eye className="h-4 w-4" aria-hidden />תצוגה מקדימה של המייל</h3>
          <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setFrameKey(k => k + 1)}>רענון</button>
        </div>
        <iframe key={frameKey} src={`${base}/preview`} title="תצוגה מקדימה" className="h-[560px] w-full rounded-lg border border-slate-200 bg-slate-50" />
      </div>

      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{msg.text}</p>}

      {draft && canEdit && (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${input} max-w-xs`} type="email" dir="ltr" placeholder="המייל שלי (ברירת מחדל)" value={testTo} onChange={e => setTestTo(e.target.value)} aria-label="כתובת לניסיון" />
            <button type="button" disabled={busy} className={btnGhost} onClick={sendTest}><Send className="h-4 w-4" aria-hidden />שליחת ניסיון</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || !activeCount} className={btnPrimary} style={{ background: NAVY }} onClick={sendAll}>
              <Send className="h-4 w-4" aria-hidden />שליחה ל-{activeCount.toLocaleString('he-IL')} נרשמים
            </button>
            {canDelete && <button type="button" disabled={busy} className={`${btnGhost} text-rose-700`} onClick={remove}><Trash2 className="h-4 w-4" aria-hidden />מחיקת הטיוטה</button>}
          </div>
        </div>
      )}
    </section>
  )
}
