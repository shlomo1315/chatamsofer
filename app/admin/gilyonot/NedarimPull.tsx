'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, RefreshCw, Save } from 'lucide-react'
import { detectColumns } from '@/lib/gilyonotDetect'
import type { NedarimPullView, NedarimRow } from '@/lib/gilyonotNedarimPull'

// לשונית "נדרים פלוס": הגדרות המשיכה מטופס הגיליונות, בחירת העמודות לפי רשומות לדוגמה,
// ומשיכה ידנית. המשיכה האוטומטית רצה כל שעה (instrumentation.ts).

const NAVY = '#1B3256'
const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1B3256] focus:outline-none focus:ring-2 focus:ring-[#1B3256]/20'
const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50'
const btnGhost = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`
const FIELDS = [...Array.from({ length: 100 }, (_, i) => `Field${i + 1}`), ...Array.from({ length: 10 }, (_, i) => `Field${i + 1}Max`)]
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : 'עוד לא')

async function post(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch('/api/admin/gilyonot/nedarim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'הפעולה נכשלה')
  return data
}

export default function NedarimPull({ view: initial }: { view: NedarimPullView }) {
  const router = useRouter()
  const [view, setView] = useState(initial)
  const [f, setF] = useState({
    mosadId: initial.mosadId, tofesId: initial.tofesId, apiKey: '',
    emailField: initial.emailField, nameField: initial.nameField, consentField: initial.consentField,
  })
  const [sample, setSample] = useState<NedarimRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(p => ({ ...p, [k]: e.target.value }))

  async function run(fn: () => Promise<string>) {
    setBusy(true); setMsg(null)
    try { setMsg({ ok: true, text: await fn() }) } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'הפעולה נכשלה' }) }
    finally { setBusy(false) }
  }

  const save = () => run(async () => {
    const d = await post({ mode: 'save', ...f })
    setView(d.view as NedarimPullView); setF(p => ({ ...p, apiKey: '' }))
    return 'ההגדרות נשמרו'
  })
  const loadSample = () => run(async () => {
    const d = await post({ mode: 'sample' })
    const rows = d.rows as NedarimRow[]
    setSample(rows)
    const d2 = detectColumns(rows)
    setF(p => ({ ...p, emailField: p.emailField || d2.emailField, nameField: p.nameField || d2.nameField }))
    return rows.length ? `נטענו ${rows.length} רשומות אחרונות. בחרו למטה איזו עמודה היא המייל ואיזו השם, ושמרו.` : 'בטופס אין עדיין רשומות'
  })
  const pull = () => run(async () => {
    const d = await post({ mode: 'pull' })
    setView(d.view as NedarimPullView); router.refresh()
    const n = (k: string) => Number(d[k] ?? 0)
    return `נקלטו ${n('added')} חדשים · ${n('exists')} כבר ברשימה · ${n('blocked')} הסירו את עצמם בעבר · ${n('invalid')} בלי מייל תקין${n('noConsent') ? ` · ${n('noConsent')} בלי אישור קבלת מייל` : ''}`
  })

  const cols = sample ? Object.keys(sample[0] ?? {}).filter(k => /^Field\d/.test(k) && sample.some(r => r[k])) : []
  const st = view.state

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-bold" style={{ color: NAVY }}>משיכה מטופס הגיליונות בנדרים פלוס</h2>
          <p className="mt-1 text-sm text-slate-600">כל מי שממלא את הטופס בנדרים נכנס לרשימת התפוצה. המשיכה רצה לבד כל שעה, ואפשר גם להפעיל אותה עכשיו.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">מספר מוסד</span>
            <input className={input} inputMode="numeric" dir="ltr" maxLength={7} value={f.mosadId} onChange={set('mosadId')} /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">מספר טופס</span>
            <input className={input} inputMode="numeric" dir="ltr" value={f.tofesId} onChange={set('tofesId')} /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">מפתח API</span>
            <input className={input} type="password" dir="ltr" autoComplete="off" value={f.apiKey} onChange={set('apiKey')}
              placeholder={view.hasKey ? 'מפתח מוגדר. להחלפה הקלידו חדש' : 'npk_...'} /></label>
        </div>
        <p className="text-xs text-slate-500">את המפתח יוצרים בנדרים פלוס במסך הגדרות &gt; API &gt; מפתחות API (מספיק מפתח מוגבל עם הרשאת &quot;משיכת רשומות טופס&quot;). אחרי השמירה הוא לא מוצג שוב.</p>

        <div className="grid gap-4 sm:grid-cols-3">
          {([['emailField', 'עמודת המייל', true], ['nameField', 'עמודת השם', false], ['consentField', 'עמודת אישור קבלת מייל', false]] as const).map(([k, label, req]) => (
            <label key={k} className="block space-y-1 text-sm"><span className="font-medium text-slate-700">{label}{!req && <span className="font-normal text-slate-500"> (לא חובה)</span>}</span>
              <select className={input} dir="ltr" value={f[k]} onChange={set(k)}>
                <option value="">{req ? 'בחרו עמודה' : 'אין'}</option>
                {FIELDS.map(x => <option key={x} value={x}>{x}{sample?.[0]?.[x] ? ` · ${sample[0][x].slice(0, 30)}` : ''}</option>)}
              </select></label>
          ))}
        </div>
        {f.consentField && <p className="text-xs text-slate-500">רשומה שבה עמודת האישור ריקה, 0 או &quot;לא&quot; לא תיכנס לרשימה.</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={save} disabled={busy} className={`${btn} text-white`} style={{ background: NAVY }}><Save size={16} aria-hidden />שמירה</button>
          <button type="button" onClick={loadSample} disabled={busy || !view.hasKey} className={btnGhost}><Download size={16} aria-hidden />טעינת דוגמה מהטופס</button>
          <button type="button" onClick={pull} disabled={busy || !view.hasKey} className={btnGhost}><RefreshCw size={16} aria-hidden className={busy ? 'animate-spin' : ''} />משיכה עכשיו</button>
        </div>
        {msg && <p role="status" className={`rounded-lg px-4 py-3 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{msg.text}</p>}
      </section>

      {sample && sample.length > 0 && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold" style={{ color: NAVY }}>הרשומות האחרונות בטופס</h3>
          <p className="text-sm text-slate-600">מוצגות רק עמודות שיש בהן ערך. אתרו את עמודת המייל ואת עמודת השם, ובחרו אותן למעלה.</p>
          <ul className="space-y-3">
            {sample.map(r => (
              <li key={r.ID} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {cols.filter(c => r[c]).map(c => (
                    <div key={c} className="flex min-w-0 gap-2">
                      <dt className="shrink-0 font-mono text-xs leading-5 text-slate-500" dir="ltr">{c}</dt>
                      <dd className="min-w-0 break-words" dir="auto">{r[c]}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <h3 className="mb-3 font-bold" style={{ color: NAVY }}>מצב המשיכה</h3>
        <dl className="grid gap-3 sm:grid-cols-4">
          <div><dt className="text-slate-500">משיכה אחרונה</dt><dd className="font-medium">{fmtDate(st.lastRunAt)}</dd></div>
          <div><dt className="text-slate-500">נקלטו במשיכה האחרונה</dt><dd className="font-medium">{st.lastAdded.toLocaleString('he-IL')}</dd></div>
          <div><dt className="text-slate-500">נקלטו בסך הכול</dt><dd className="font-medium">{st.totalAdded.toLocaleString('he-IL')}</dd></div>
          <div><dt className="text-slate-500">רשומה אחרונה שנקראה</dt><dd className="font-medium">{st.lastId || '—'}</dd></div>
        </dl>
        {st.lastError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-rose-800">שגיאה במשיכה האחרונה: {st.lastError}</p>}
      </section>
    </div>
  )
}
