'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, KeyRound, ListChecks, RefreshCw, Save } from 'lucide-react'
import { detectColumns } from '@/lib/gilyonotDetect'
import type { NedarimPullView, NedarimRow } from '@/lib/gilyonotNedarimPull'
import { btnGhost, btnPrimary, Card, CardHeader, input, Notice, Stat, StepNum } from './ui'

// לשונית "נדרים פלוס": הגדרות המשיכה מטופס הגיליונות, בחירת העמודות לפי רשומות לדוגמה,
// ומשיכה ידנית. המשיכה האוטומטית רצה כל שעה (instrumentation.ts).

const FIELDS = [...Array.from({ length: 100 }, (_, i) => `Field${i + 1}`), ...Array.from({ length: 10 }, (_, i) => `Field${i + 1}Max`)]
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : 'עוד לא')

class ApiError extends Error {
  constructor(message: string, readonly data: Record<string, unknown>) { super(message) }
}

async function post(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch('/api/admin/gilyonot/nedarim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(typeof data.error === 'string' ? data.error : `הפעולה נכשלה (שגיאה ${res.status}). נסו שוב בעוד רגע.`, data)
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
  const [needEmail, setNeedEmail] = useState(false)
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
    let d: Record<string, unknown>
    try { d = await post({ mode: 'pull' }) } catch (e) {
      // גם משיכה שנכשלה מעדכנת את המצב (השגיאה האחרונה) ואולי מבקשת לבחור עמודת מייל
      if (e instanceof ApiError) {
        if (e.data.view) setView(e.data.view as NedarimPullView)
        if (e.data.needEmailField) setNeedEmail(true)
      }
      throw e
    }
    setNeedEmail(false)
    setView(d.view as NedarimPullView); router.refresh()
    const n = (k: string) => Number(d[k] ?? 0)
    return `נקלטו ${n('added')} חדשים · ${n('exists')} כבר ברשימה · ${n('blocked')} הסירו את עצמם בעבר · ${n('invalid')} בלי מייל תקין${n('noConsent') ? ` · ${n('noConsent')} בלי אישור קבלת מייל` : ''}`
  })

  const cols = sample ? Object.keys(sample[0] ?? {}).filter(k => /^Field\d/.test(k) && sample.some(r => r[k])) : []
  const st = view.state
  const connected = view.hasKey && !!view.mosadId && !!view.tofesId
  const health = st.lastError
    ? { dot: 'bg-rose-500', title: 'המשיכה האחרונה נכשלה', text: st.lastError }
    : connected && view.emailField
    ? { dot: 'bg-emerald-500', title: 'מחובר ופעיל', text: 'המשיכה רצה לבד כל שעה, ונרשמים חדשים נכנסים לרשימת התפוצה.' }
    : { dot: 'bg-slate-300', title: 'עוד לא מחובר', text: 'מלאו את פרטי הטופס והמפתח, בחרו את עמודת המייל ושמרו.' }
  const label = 'mb-1.5 block text-sm font-medium text-slate-800'

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="relative mt-1.5 flex h-3 w-3 shrink-0" aria-hidden>
              {health.dot === 'bg-emerald-500' && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />}
              <span className={`relative h-3 w-3 rounded-full ${health.dot}`} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">{health.title}</h2>
              <p className={`mt-0.5 break-words text-sm ${st.lastError ? 'text-rose-800' : 'text-slate-600'}`}>{health.text}</p>
            </div>
          </div>
          <button type="button" onClick={pull} disabled={busy || !view.hasKey} className={`${btnPrimary} sm:shrink-0`}>
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />משיכה עכשיו
          </button>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="משיכה אחרונה" value={<span className="text-base">{fmtDate(st.lastRunAt)}</span>} />
          <Stat label="נקלטו במשיכה האחרונה" value={st.lastAdded.toLocaleString('he-IL')} tone={st.lastAdded ? 'green' : undefined} />
          <Stat label="נקלטו בסך הכול" value={st.totalAdded.toLocaleString('he-IL')} />
          <Stat label="רשומה אחרונה שנקראה" value={<span className="text-base">{st.lastId || '—'}</span>} />
        </dl>
        {msg && <div className="mt-4"><Notice msg={msg} /></div>}
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <StepNum n={1} done={connected} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900">חיבור לטופס הגיליונות</h2>
            <p className="mt-0.5 text-sm text-slate-600">מספר המוסד, מספר הטופס ומפתח API מנדרים פלוס.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="block"><span className={label}>מספר מוסד</span>
                <input className={input} inputMode="numeric" dir="ltr" maxLength={7} value={f.mosadId} onChange={set('mosadId')} /></label>
              <label className="block"><span className={label}>מספר טופס</span>
                <input className={input} inputMode="numeric" dir="ltr" value={f.tofesId} onChange={set('tofesId')} /></label>
              <label className="block"><span className={`${label} flex items-center gap-1.5`}><KeyRound className="h-3.5 w-3.5 text-slate-500" aria-hidden />מפתח API</span>
                <input className={input} type="password" dir="ltr" autoComplete="off" value={f.apiKey} onChange={set('apiKey')}
                  placeholder={view.hasKey ? 'מפתח מוגדר. להחלפה הקלידו חדש' : 'npk_...'} /></label>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">את המפתח יוצרים בנדרים פלוס במסך הגדרות &gt; API &gt; מפתחות API (מספיק מפתח מוגבל עם הרשאת &quot;משיכת רשומות טופס&quot;). אחרי השמירה הוא לא מוצג שוב.</p>
          </div>
        </div>

        <div className="mt-6 flex items-start gap-3 border-t border-slate-100 pt-6">
          <StepNum n={2} done={!!f.emailField} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">בחירת העמודות</h2>
                <p className="mt-0.5 text-sm text-slate-600">טענו רשומות לדוגמה, והמייל והשם יזוהו לבד. אפשר לתקן ידנית.</p>
              </div>
              <button type="button" onClick={loadSample} disabled={busy || !view.hasKey} className={`${btnGhost} sm:shrink-0`}><Download className="h-4 w-4" aria-hidden />טעינת דוגמה מהטופס</button>
            </div>
            {needEmail && !f.emailField && (
              <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                המערכת לא זיהתה לבד את עמודת המייל. טענו דוגמה מהטופס, בחרו כאן את העמודה שיש בה כתובות מייל, ושמרו.
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {([['emailField', 'עמודת המייל', true], ['nameField', 'עמודת השם', false], ['consentField', 'עמודת אישור קבלת מייל', false]] as const).map(([k, text, req]) => (
                <label key={k} className="block"><span className={label}>{text}{!req && <span className="font-normal text-slate-500"> (לא חובה)</span>}</span>
                  <select className={`${input} ${k === 'emailField' && needEmail && !f.emailField ? 'ring-2 ring-amber-400' : ''}`} dir="ltr" value={f[k]} onChange={set(k)}>
                    <option value="">{req ? 'בחרו עמודה' : 'אין'}</option>
                    {FIELDS.map(x => <option key={x} value={x}>{x}{sample?.[0]?.[x] ? ` · ${sample[0][x].slice(0, 30)}` : ''}</option>)}
                  </select></label>
              ))}
            </div>
            {f.consentField && <p className="mt-2 text-xs text-slate-500">רשומה שבה עמודת האישור ריקה, 0 או &quot;לא&quot; לא תיכנס לרשימה.</p>}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
          <button type="button" onClick={save} disabled={busy} className={btnPrimary}><Save className="h-4 w-4" aria-hidden />שמירת ההגדרות</button>
          {!view.hasKey && <p className="text-xs text-slate-500">טעינת דוגמה ומשיכה ייפתחו אחרי ששומרים מפתח API.</p>}
        </div>
      </Card>

      {sample && sample.length > 0 && (
        <Card className="p-5">
          <CardHeader icon={<ListChecks className="h-5 w-5" aria-hidden />} title="הרשומות האחרונות בטופס" hint="מוצגות רק עמודות שיש בהן ערך. אתרו את עמודת המייל ואת עמודת השם, ובחרו אותן למעלה." />
          <ul className="mt-4 space-y-3">
            {sample.map(r => (
              <li key={r.ID} className="rounded-xl bg-slate-50/80 p-3.5 ring-1 ring-inset ring-slate-900/[0.04]">
                <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {cols.filter(c => r[c]).map(c => {
                    const picked = c === f.emailField || c === f.nameField
                    return (
                      <div key={c} className={`flex min-w-0 gap-2 rounded-md px-1.5 ${picked ? 'bg-[#1B3256]/[0.07]' : ''}`}>
                        <dt className={`shrink-0 font-mono text-xs leading-5 ${picked ? 'font-semibold text-[#1B3256]' : 'text-slate-500'}`} dir="ltr">{c}</dt>
                        <dd className="min-w-0 break-words text-slate-800" dir="auto">{r[c]}</dd>
                      </div>
                    )
                  })}
                </dl>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
