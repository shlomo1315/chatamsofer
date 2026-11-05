'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Download, KeyRound, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import type { NedarimRow } from '@/lib/gilyonotNedarimPull'
import type { KvitelFormLine, KvitelNedarimView } from '@/lib/kvitelNedarimPull'
import { btnGhost, btnPrimary, Card, input, Notice, Stat, StepNum } from '../gilyonot/ui'

// חיבור לטופס הקוויטל בנדרים פלוס: מוסד, טופס ומפתח, בחירת העמודות לפי הגשות לדוגמה,
// ומשיכה ידנית. המשיכה האוטומטית רצה כל שעה (instrumentation.ts → lib/kvitelNedarimPull.ts).
// ⚠️ ההגדרות למנהל בלבד; בעל הרשאת עריכה רואה מצב ויכול למשוך.

const FIELDS = [...Array.from({ length: 100 }, (_, i) => `Field${i + 1}`), ...Array.from({ length: 10 }, (_, i) => `Field${i + 1}Max`)]
const MAX_FORM_LINES = 10
const EMPTY_LINE: KvitelFormLine = { name: '', mother: '', relation: '', request: '' }
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : 'עוד לא')
const label = 'mb-1.5 block text-sm font-medium text-slate-800'

async function post(body: unknown): Promise<Record<string, unknown> & { view?: KvitelNedarimView }> {
  const res = await fetch('/api/admin/kvitel/nedarim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(typeof data.error === 'string' ? data.error : `הפעולה נכשלה (שגיאה ${res.status}). נסו שוב בעוד רגע.`) as Error & { view?: KvitelNedarimView }
    err.view = data.view
    throw err
  }
  return data
}

function FieldSelect({ value, onChange, sample, placeholder = 'אין' }: { value: string; onChange: (v: string) => void; sample: NedarimRow[] | null; placeholder?: string }) {
  return (
    <select className={input} dir="ltr" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {FIELDS.map(x => <option key={x} value={x}>{x}{sample?.[0]?.[x] ? ` · ${sample[0][x].slice(0, 30)}` : ''}</option>)}
    </select>
  )
}

export default function KvitelNedarim({ view: initial, isAdmin }: { view: KvitelNedarimView; isAdmin: boolean }) {
  const router = useRouter()
  const [view, setView] = useState(initial)
  const [f, setF] = useState({
    mosadId: initial.mosadId, tofesId: initial.tofesId, apiKey: '',
    contactField: initial.contactField, phoneField: initial.phoneField, emailField: initial.emailField, textField: initial.textField,
  })
  const [lines, setLines] = useState<KvitelFormLine[]>(initial.lines.length ? initial.lines : [EMPTY_LINE])
  const [sample, setSample] = useState<NedarimRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const setField = (k: keyof typeof f) => (v: string) => setF(p => ({ ...p, [k]: v }))
  const setLine = (i: number, k: keyof KvitelFormLine) => (v: string) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))

  async function run(fn: () => Promise<string>) {
    setBusy(true); setMsg(null)
    try { setMsg({ ok: true, text: await fn() }) } catch (e) {
      const v = (e as { view?: KvitelNedarimView }).view
      if (v) setView(v)
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'הפעולה נכשלה' })
    } finally { setBusy(false) }
  }

  const save = () => run(async () => {
    const d = await post({ mode: 'save', ...f, lines })
    if (d.view) setView(d.view)
    setF(p => ({ ...p, apiKey: '' }))
    return 'ההגדרות נשמרו'
  })
  const loadSample = () => run(async () => {
    const rows = (await post({ mode: 'sample' })).rows as NedarimRow[]
    setSample(rows)
    return rows.length ? `נטענו ${rows.length} הגשות אחרונות. בחרו למטה איזו עמודה היא מה, ושמרו.` : 'נדרים לא החזיר הגשות. שלחו הגשה אחת לבדיקה דרך הטופס (עם כל השדות מלאים) ולחצו שוב, או ודאו שמספר הטופס נכון. בינתיים אפשר לבחור עמודות ידנית: Field1, Field2 וכן הלאה לפי סדר השדות בטופס.'
  })
  const pull = () => run(async () => {
    const d = await post({ mode: 'pull' })
    if (d.view) setView(d.view)
    router.refresh()
    const n = (k: string) => Number(d[k] ?? 0)
    return `נקלטו ${n('added')} בקשות חדשות${n('review') ? ` (${n('review')} לבדיקה)` : ''} · ${n('exists')} כבר היו · ${n('empty')} בלי שמות`
  })

  const st = view.state
  const connected = view.hasKey && !!view.mosadId && !!view.tofesId
  const mapped = !!(view.textField || view.lines.length)
  const health = st.lastError
    ? { dot: 'bg-rose-500', title: 'המשיכה האחרונה מנדרים נכשלה', text: st.lastError }
    : connected && mapped
    ? { dot: 'bg-emerald-500', title: 'מחובר לטופס בנדרים פלוס', text: 'המשיכה רצה לבד כל שעה, וכל הגשה חדשה נכנסת לרשימה למטה.' }
    : { dot: 'bg-slate-300', title: 'טופס נדרים פלוס עוד לא מחובר', text: isAdmin ? 'פתחו כאן, מלאו את פרטי הטופס והמפתח ובחרו את העמודות.' : 'מנהל צריך להגדיר את החיבור.' }
  const cols = sample ? Object.keys(sample[0] ?? {}).filter(k => /^Field\d/.test(k) && sample.some(r => r[k])) : []

  return (
    <Card className="p-5">
      <details>
        <summary className="flex cursor-pointer list-none flex-col gap-4 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${health.dot}`} aria-hidden />
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-base font-bold text-slate-900">{health.title}<ChevronDown className="h-4 w-4 text-slate-500" aria-hidden /></h2>
              <p className={`mt-0.5 break-words text-sm ${st.lastError ? 'text-rose-800' : 'text-slate-600'}`}>{health.text}</p>
            </div>
          </div>
          <button type="button" onClick={e => { e.preventDefault(); void pull() }} disabled={busy || !connected || !mapped} className={`${btnPrimary} sm:shrink-0`}>
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />משיכה עכשיו
          </button>
        </summary>

        <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="משיכה אחרונה" value={<span className="text-base">{fmtDate(st.lastRunAt)}</span>} />
          <Stat label="נקלטו במשיכה האחרונה" value={st.lastAdded.toLocaleString('he-IL')} tone={st.lastAdded ? 'green' : undefined} />
          <Stat label="נקלטו בסך הכול" value={st.totalAdded.toLocaleString('he-IL')} />
          <Stat label="הגשה אחרונה שנקראה" value={<span className="text-base">{st.lastId || '—'}</span>} />
        </dl>

        {isAdmin && (
          <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
            <div className="flex items-start gap-3">
              <StepNum n={1} done={connected} />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900">חיבור לטופס הקוויטל</h3>
                <p className="mt-0.5 text-sm text-slate-600">מספר המוסד, מספר הטופס ומפתח API מנדרים פלוס.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <label className="block"><span className={label}>מספר מוסד</span>
                    <input className={input} inputMode="numeric" dir="ltr" maxLength={7} value={f.mosadId} onChange={e => setField('mosadId')(e.target.value)} /></label>
                  <label className="block"><span className={label}>מספר טופס</span>
                    <input className={input} inputMode="numeric" dir="ltr" value={f.tofesId} onChange={e => setField('tofesId')(e.target.value)} /></label>
                  <label className="block"><span className={`${label} flex items-center gap-1.5`}><KeyRound className="h-3.5 w-3.5 text-slate-500" aria-hidden />מפתח API</span>
                    <input className={input} type="password" dir="ltr" autoComplete="off" value={f.apiKey} onChange={e => setField('apiKey')(e.target.value)}
                      placeholder={view.sharedKey ? 'משתמש במפתח של הגיליונות' : view.hasKey ? 'מפתח מוגדר. להחלפה הקלידו חדש' : 'npk_...'} /></label>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">אם המוסד זהה לזה של הגיליונות, אפשר להשאיר את המפתח ריק. אחרי השמירה המפתח לא מוצג שוב.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-t border-slate-100 pt-6">
              <StepNum n={2} done={mapped} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">בחירת העמודות</h3>
                    <p className="mt-0.5 text-sm text-slate-600">טענו הגשות לדוגמה ובחרו איזו עמודה היא מה. שם מלא בעמודה אחת (&quot;משה בן שרה&quot;) — בחרו רק עמודת שם.</p>
                  </div>
                  <button type="button" onClick={loadSample} disabled={busy || !connected} className={`${btnGhost} sm:shrink-0`}><Download className="h-4 w-4" aria-hidden />טעינת דוגמה מהטופס</button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {([['contactField', 'שם הפונה'], ['phoneField', 'טלפון'], ['emailField', 'מייל'], ['textField', 'שמות בטקסט חופשי']] as const).map(([k, text]) => (
                    <label key={k} className="block"><span className={label}>{text}</span>
                      <FieldSelect value={f[k]} onChange={setField(k)} sample={sample} /></label>
                  ))}
                </div>

                <h4 className="mt-6 text-sm font-semibold text-slate-900">שורות השמות בטופס</h4>
                <ul className="mt-2 space-y-3">
                  {lines.map((l, i) => (
                    <li key={i} className="grid gap-3 rounded-xl bg-slate-50/80 p-3 ring-1 ring-inset ring-slate-900/[0.04] sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] sm:items-end">
                      {([['name', 'שם'], ['mother', 'שם האם'], ['relation', 'בן / בת'], ['request', 'בקשה']] as const).map(([k, text]) => (
                        <label key={k} className="block"><span className={label}>{text}{i === 0 ? '' : ` (${i + 1})`}</span>
                          <FieldSelect value={l[k]} onChange={setLine(i, k)} sample={sample} /></label>
                      ))}
                      <button type="button" onClick={() => setLines(ls => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [EMPTY_LINE]))} className={btnGhost} aria-label={`הסרת שורה ${i + 1}`}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                {lines.length < MAX_FORM_LINES && (
                  <button type="button" onClick={() => setLines(ls => [...ls, EMPTY_LINE])} className={`${btnGhost} mt-3`}><Plus className="h-4 w-4" aria-hidden />שורה נוספת</button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
              <button type="button" onClick={save} disabled={busy} className={btnPrimary}><Save className="h-4 w-4" aria-hidden />שמירת ההגדרות</button>
            </div>

            {sample && sample.length > 0 && (
              <ul className="space-y-3">
                {sample.map(r => (
                  <li key={r.ID} className="rounded-xl bg-slate-50/80 p-3.5 ring-1 ring-inset ring-slate-900/[0.04]">
                    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      {cols.filter(c => r[c]).map(c => (
                        <div key={c} className="flex min-w-0 gap-2 px-1.5">
                          <dt className="shrink-0 font-mono text-xs leading-5 text-slate-500" dir="ltr">{c}</dt>
                          <dd className="min-w-0 break-words text-slate-800" dir="auto">{r[c]}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </details>
      {msg && <div className="mt-4"><Notice msg={msg} /></div>}
    </Card>
  )
}
