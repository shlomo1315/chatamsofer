'use client'

// המערכת הטלפונית של היריד בטכנוליין: מצב החיבור, בניית השלוחה, ועריכת הנוסחים וההקלטות.
// 🔴 נפרד לגמרי מנוסחי ימות (PhoneMessages): מפתח נוסחים, מפתח API ושלוחה של היריד בלבד.
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Check, X, Hammer, Upload, Trash2, Copy, Search, Save } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

type Msg = { text: string; audio?: string | null }
type Meta = { key: string; label: string; defaultText: string; allowAudio: boolean; placeholders?: string[]; hint?: string }
type Status = { hasSecret: boolean; hasApiKey: boolean; hasNumber: boolean; missing: string[] }
type Data = {
  status: Status; callsReady: boolean
  urls: { ext: string; label: string; url: string }[]
  messages: Record<string, Msg>; meta: Meta[]
}
type Step = { ext: string; label: string; ok: boolean; error?: string }

const API = '/api/admin/book-fair/technoline'
const EXT_STORAGE = 'tl-yerid-ext'

function Stat({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 inline-flex items-center gap-1.5 text-base font-extrabold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>
        {ok ? <Check size={16} /> : <X size={16} />}{value}
      </p>
    </div>
  )
}

export default function TechnolineYerid({ canEdit }: { canEdit: boolean }) {
  const toast = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [rootId, setRootId] = useState('')
  const [steps, setSteps] = useState<Step[] | null>(null)
  // מזהה השלוחה נשמר בדפדפן. בשרת אין localStorage, ושם ממילא מוצג רק סמל הטעינה.
  const [extId, setExtId] = useState(() => (typeof window === 'undefined' ? '' : localStorage.getItem(EXT_STORAGE) ?? ''))
  const [query, setQuery] = useState('')

  function apply(d: Data) {
    setData(d)
    setTexts(Object.fromEntries(Object.entries(d.messages).map(([k, m]) => [k, m.text])))
  }

  useEffect(() => {
    fetch(API)
      .then((r) => r.json().then((j) => (r.ok ? apply(j) : setLoadError(j.error ?? 'שגיאה בטעינה'))))
      .catch(() => setLoadError('שגיאה בטעינה'))
  }, [])

  async function post(tag: string, init: RequestInit, done?: string) {
    setBusy(tag)
    try {
      const r = await fetch(API, init)
      const j = await r.json()
      if (!r.ok) { toast.error(j.error ?? 'שגיאה'); return null }
      if (j.messages) apply(j)
      if (done) toast.success(done)
      return j
    } catch { toast.error('שגיאת רשת'); return null } finally { setBusy(null) }
  }
  const json = (body: object): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  const dirty = useMemo(
    () => !!data && Object.keys(texts).some((k) => texts[k] !== data.messages[k]?.text),
    [texts, data],
  )
  const rows = useMemo(() => {
    const q = query.trim()
    return (data?.meta ?? []).filter((m) => !q || m.label.includes(q) || (texts[m.key] ?? '').includes(q))
  }, [data, texts, query])
  const recorded = data ? Object.values(data.messages).filter((m) => m.audio).length : 0

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>
  if (!data) return <Loader2 className="animate-spin text-slate-400" />
  const { status } = data

  async function build() {
    setSteps(null)
    const j = await post('tree', json({ action: 'tree', rootId }))
    if (j?.steps) setSteps(j.steps)
  }
  function save() {
    const messages = Object.fromEntries(Object.entries(texts).map(([k, text]) => [k, { text }]))
    return post('save', json({ action: 'messages', messages }), 'הנוסחים נשמרו')
  }
  function upload(key: string, file: File) {
    const f = new FormData()
    f.set('key', key); f.set('extensionId', extId); f.set('file', file)
    return post(`up:${key}`, { method: 'POST', body: f }, 'ההקלטה הועלתה לטכנוליין')
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat ok={status.hasSecret} label="סוד הנתיב" value={status.hasSecret ? 'מוגדר' : 'חסר'} />
        <Stat ok={status.hasApiKey} label="מפתח API" value={status.hasApiKey ? 'מוגדר' : 'חסר'} />
        <Stat ok={status.hasNumber} label="מספר טלפון" value={status.hasNumber ? 'מוגדר' : 'חסר'} />
        <Stat ok={recorded > 0} label="הודעות מוקלטות" value={`${recorded} מתוך ${data.meta.length}`} />
      </div>
      {status.missing.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          כדי שהקו יעבוד, יש להוסיף לסוד <span dir="ltr">chasamsofer/prod</span> את: <span dir="ltr" className="font-bold">{status.missing.join(', ')}</span>
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-extrabold text-navy-dark">שלוחת היריד בטכנוליין</h3>
        <p className="mt-1 text-[13px] text-slate-500">מערכת נפרדת מחגים ויולדות, עם מפתח וכתובת משלה.</p>
        <ul className="mt-3 flex flex-col gap-1 text-[13px] text-slate-600">
          {data.urls.map((u) => <li key={u.ext}>{u.label}: <span dir="ltr" className="break-all text-slate-400">{u.url}</span></li>)}
        </ul>
        {canEdit && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input dir="ltr" value={rootId} onChange={(e) => setRootId(e.target.value.replace(/\D/g, ''))} placeholder="מזהה שלוחת אב"
              className="h-10 w-44 rounded-xl border border-slate-200 px-3 text-sm" />
            <button disabled={!!busy || !rootId || !status.hasApiKey} onClick={build}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-navy px-4 text-sm font-bold text-white disabled:opacity-40">
              {busy === 'tree' ? <Loader2 size={14} className="animate-spin" /> : <Hammer size={14} />}בנה / עדכן שלוחה
            </button>
          </div>
        )}
        {steps && <ul className="mt-3 flex flex-col gap-1 text-[13px]">
          {steps.map((x) => <li key={x.ext} className={x.ok ? 'text-emerald-700' : 'text-red-600'}>{x.label}: {x.ok ? 'עודכן' : x.error}</li>)}
        </ul>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          <h3 className="me-auto text-sm font-extrabold text-navy-dark">נוסחי השלוחה ({data.meta.length})</h3>
          <label className="relative">
            <Search size={14} className="absolute start-3 top-3 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש הודעה"
              className="h-10 w-48 rounded-xl border border-slate-200 ps-8 pe-3 text-sm" />
          </label>
          {canEdit && <>
            <input dir="ltr" value={extId} placeholder="מזהה שלוחה להקלטות"
              onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setExtId(v); localStorage.setItem(EXT_STORAGE, v) }}
              className="h-10 w-44 rounded-xl border border-slate-200 px-3 text-sm" />
            <button disabled={!!busy} onClick={() => post('import', json({ action: 'import' }), 'הנוסחים הקודמים הועתקו')}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 disabled:opacity-40">
              {busy === 'import' ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}העתק נוסחים קודמים
            </button>
            <button disabled={!!busy || !dirty} onClick={save}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-navy px-4 text-sm font-bold text-white disabled:opacity-40">
              {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}שמור
            </button>
          </>}
        </div>

        <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="hidden p-3 text-start font-bold md:table-cell">הודעה</th><th className="p-3 text-start font-bold">נוסח</th><th className="p-3 text-start font-bold">הקלטה</th></tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const audio = data.messages[m.key]?.audio
                const hasVar = /\{[^}]+\}/.test(texts[m.key] ?? '')
                return (
                  <tr key={m.key} className="border-t border-slate-100 align-top">
                    <td className="hidden w-48 p-3 md:table-cell">
                      <p className="font-bold text-slate-800">{m.label}</p>
                      {m.hint && <p className="mt-1 text-xs text-slate-500">{m.hint}</p>}
                    </td>
                    <td className="p-3">
                      <p className="mb-1 font-bold text-slate-800 md:hidden">{m.label}</p>
                      <textarea value={texts[m.key] ?? ''} disabled={!canEdit} rows={2}
                        onChange={(e) => setTexts((t) => ({ ...t, [m.key]: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 p-2 text-sm leading-6 disabled:bg-slate-50" />
                      {!!m.placeholders?.length && <p className="text-xs text-slate-500">חובה בנוסח: <span dir="ltr">{m.placeholders.map((p) => `{${p}}`).join(' ')}</span></p>}
                    </td>
                    <td className="w-28 p-3 md:w-44">
                      {!m.allowAudio || hasVar ? <span className="text-xs text-slate-400">מוקרא בקול ממוחשב</span> : (
                        <div className="flex flex-col gap-2">
                          <span className={`text-xs font-bold ${audio ? 'text-emerald-700' : 'text-slate-500'}`}>{audio ? 'מוקלט' : 'קול ממוחשב'}</span>
                          {canEdit && <div className="flex gap-1">
                            <label title={extId ? 'העלאת הקלטה' : 'יש למלא מזהה שלוחה להקלטות'}
                              className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-bold text-slate-700 ${!extId || busy ? 'pointer-events-none opacity-40' : ''}`}>
                              {busy === `up:${m.key}` ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}העלאה
                              <input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(m.key, f); e.target.value = '' }} />
                            </label>
                            {audio && <button title="הסרת ההקלטה" disabled={!!busy} onClick={() => post(`clr:${m.key}`, json({ action: 'clear-audio', key: m.key }), 'ההקלטה הוסרה')}
                              className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2 text-slate-500 disabled:opacity-40"><Trash2 size={12} /></button>}
                          </div>}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
      </section>
    </div>
  )
}
