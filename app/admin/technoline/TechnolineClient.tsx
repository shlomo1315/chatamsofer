'use client'
import { useEffect, useState } from 'react'
import { Loader2, Check, X, Upload, Hammer } from 'lucide-react'

type Sys = {
  id: string; label: string; hasSecret: boolean; hasApiKey: boolean; hasNumber: boolean; missing: string[]
  callsReady: boolean; urls: { ext: string; label: string; digit: string; url: string }[]
}
type Status = {
  systems: Sys[]
  account: { hasKey: boolean; monthlyCap: number; outboundEnabled: boolean; overview: { name: string; monthlyCap: number; monthSpent: number } | null; overviewError: string | null }
}
type Step = { ext: string; label: string; ok: boolean; error?: string }

const Badge = ({ ok, text }: { ok: boolean; text: string }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
    {ok ? <Check size={12} /> : <X size={12} />}{text}
  </span>
)

function SystemTab({ s }: { s: Sys }) {
  const [rootId, setRootId] = useState('')
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [extId, setExtId] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function build() {
    setBusy(true); setSteps(null); setMsg('')
    const r = await fetch('/api/admin/technoline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'tree', system: s.id, rootId }) })
    const j = await r.json(); setBusy(false)
    if (j.steps) setSteps(j.steps); else setMsg(j.error ?? 'שגיאה')
  }
  async function upload(file: File) {
    setBusy(true); setMsg('')
    const f = new FormData()
    f.set('system', s.id); f.set('extensionId', extId); f.set('name', file.name.replace(/\.[^.]+$/, '')); f.set('file', file)
    const r = await fetch('/api/admin/technoline', { method: 'POST', body: f })
    const j = await r.json(); setBusy(false)
    setMsg(j.ok ? 'ההקלטה הועלתה' : j.error ?? 'שגיאה')
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <Badge ok={s.hasSecret} text="סוד נתיב" /><Badge ok={s.hasApiKey} text="מפתח API" />
        <Badge ok={s.hasNumber} text="מספר" /><Badge ok={s.callsReady} text="שיחות יוצאות" />
      </div>
      {s.missing.length > 0 && <p className="text-[13px] text-slate-500">חסרים: <span dir="ltr">{s.missing.join(', ')}</span></p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-extrabold text-slate-900">עץ שלוחות</h2>
        <ul className="mb-3 flex flex-col gap-1 text-[13px] text-slate-600">
          {s.urls.map((u) => <li key={u.ext}>{u.label}{u.digit && ` (מקש ${u.digit})`}: <span dir="ltr" className="text-slate-400">{u.url}</span></li>)}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <input dir="ltr" value={rootId} onChange={(e) => setRootId(e.target.value.replace(/\D/g, ''))} placeholder="מזהה שלוחת אב"
            className="h-10 w-44 rounded-xl border border-slate-200 px-3 text-sm" />
          <button disabled={busy || !rootId || !s.hasApiKey} onClick={build}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-bold text-white disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Hammer size={14} />}בנה / עדכן שלוחות
          </button>
        </div>
        {steps && <ul className="mt-3 flex flex-col gap-1 text-[13px]">
          {steps.map((x) => <li key={x.ext} className={x.ok ? 'text-emerald-700' : 'text-red-600'}>{x.label}: {x.ok ? 'עודכן' : x.error}</li>)}
        </ul>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-extrabold text-slate-900">העלאת הקלטה (עד 2MB)</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input dir="ltr" value={extId} onChange={(e) => setExtId(e.target.value.replace(/\D/g, ''))} placeholder="מזהה שלוחה"
            className="h-10 w-44 rounded-xl border border-slate-200 px-3 text-sm" />
          <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 ${!extId || busy || !s.hasApiKey ? 'pointer-events-none opacity-40' : ''}`}>
            <Upload size={14} />בחר קובץ
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
          </label>
        </div>
        {msg && <p className="mt-3 text-[13px] text-slate-600">{msg}</p>}
      </section>
    </div>
  )
}

function AccountTab({ a }: { a: Status['account'] }) {
  const [form, setForm] = useState({ systemId: '', groupId: '', number: '', price: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function buy() {
    setBusy(true); setMsg('')
    const r = await fetch('/api/admin/technoline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'buy', ...form, price: Number(form.price) || 0 }) })
    const j = await r.json(); setBusy(false)
    setMsg(j.ok ? 'המספר נרכש' : j.error ?? 'שגיאה')
  }
  const ov = a.overview
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ['תקרה חודשית', a.monthlyCap ? `${a.monthlyCap} ₪` : 'לא הוגדרה'],
          ['הוצא החודש', ov ? `${ov.monthSpent} ₪` : '—'],
          ['שיחות יוצאות', a.outboundEnabled ? 'פעילות' : 'כבויות'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{k}</p><p className="mt-1 text-lg font-extrabold text-slate-900">{v}</p>
          </div>
        ))}
      </div>
      {!a.hasKey && <p className="text-[13px] text-amber-700">חסר מפתח חשבון (TECHNOLINE_ACCOUNT_KEY).</p>}
      {a.overviewError && <p className="text-[13px] text-red-600">{a.overviewError}</p>}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-extrabold text-slate-900">רכישת מספר</h2>
        <p className="mb-3 text-[13px] text-slate-500">הרכישה נחסמת אם לא הוגדרה תקרה חודשית או שהיא מוצתה.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          {([['systemId', 'מזהה מערכת'], ['groupId', 'מזהה קבוצה'], ['number', 'מספר'], ['price', 'מחיר (₪)']] as const).map(([k, ph]) => (
            <input key={k} dir="ltr" placeholder={ph} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
          ))}
        </div>
        <button disabled={busy || !form.number || !form.systemId || !form.groupId} onClick={buy}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-bold text-white disabled:opacity-40">
          {busy && <Loader2 size={14} className="animate-spin" />}רכוש מספר
        </button>
        {msg && <p className="mt-3 text-[13px] text-slate-600">{msg}</p>}
      </section>
    </div>
  )
}

export default function TechnolineClient() {
  const [st, setSt] = useState<Status | null>(null)
  const [tab, setTab] = useState('main')
  const [err, setErr] = useState('')
  useEffect(() => {
    fetch('/api/admin/technoline')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then(setSt)
      .catch(() => setErr('לא ניתן לטעון את המצב'))
  }, [])

  if (err) return <p className="text-sm text-red-600">{err}</p>
  if (!st) return <Loader2 className="animate-spin text-slate-400" />
  const tabs = [...st.systems.map((s) => ({ id: s.id, label: s.label })), { id: 'account', label: 'חשבון ומספרים' }]
  const cur = st.systems.find((s) => s.id === tab)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-bold ${tab === t.id ? 'border-b-2 border-teal-600 text-teal-700' : 'text-slate-500'}`}>{t.label}</button>
        ))}
      </div>
      {cur ? <SystemTab key={cur.id} s={cur} /> : <AccountTab a={st.account} />}
    </div>
  )
}
