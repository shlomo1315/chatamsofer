'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, LogOut } from 'lucide-react'
import { DISTRIBUTOR_LOGIN_BY, EVENT_LABELS, LOGIN_LABELS, type DistributorAction, type EventKind } from '@/lib/gilyonotDistributors'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-[#1B3256] focus:outline-none focus:ring-2 focus:ring-[#1B3256]/20'
const label = 'mb-1 block text-sm font-medium text-slate-700'
const btnPrimary = 'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1B3256] px-4 py-3 text-base font-semibold text-white hover:bg-[#142640] disabled:opacity-60'
const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'

interface Dist { id: string; full_name: string; city: string | null; address: string | null; synagogue: string | null; quantity: number }
interface Ev { id: string; distributor_id: string; kind: EventKind; quantity: number | null; details: string | null; status: 'open' | 'done' | 'rejected'; created_at: string }
type Msg = { ok: boolean; text: string } | null

const STATUS_LABEL = { open: 'בטיפול', done: 'טופל', rejected: 'נדחה' } as const

const ACTIONS: { key: DistributorAction; title: string; hint: string }[] = [
  { key: 'received', title: 'דיווח קבלה', hint: 'כמה גיליונות הגיעו אליכם השבוע' },
  { key: 'issue', title: 'דיווח על תקלה', hint: 'לא הגיע, הגיע באיחור, נפגע וכדומה' },
  { key: 'increase', title: 'בקשת תוספת', hint: 'צריכים יותר גיליונות' },
  { key: 'decrease', title: 'בקשת הפחתה', hint: 'נשארים גיליונות מיותרים' },
  { key: 'address', title: 'עדכון כתובת', hint: 'עברתם דירה או שהמשלוח צריך להגיע למקום אחר' },
  { key: 'note', title: 'הערה למשרד', hint: 'כל דבר אחר' },
  { key: 'leave', title: 'הפסקת ההפצה', hint: 'יציאה ממערך המפיצים' },
]

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({})) as Record<string, unknown>
  return { status: res.status, ok: res.ok, data }
}
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const errText = (d: Record<string, unknown>, fallback: string) => (typeof d.error === 'string' ? d.error : fallback)

export default function MefitzClient() {
  const [state, setState] = useState<'loading' | 'login' | 'in'>('loading')
  const [dists, setDists] = useState<Dist[]>([])
  const [events, setEvents] = useState<Ev[]>([])

  const load = useCallback(async () => {
    try {
      const r = await call('/api/gilyonot/mefitz')
      if (r.status === 401) { setState('login'); return }
      setDists((r.data.distributors as Dist[]) ?? [])
      setEvents((r.data.events as Ev[]) ?? [])
      setState('in')
    } catch { setState('login') }
  }, [])

  // ⚠️ setTimeout(0): הכלל set-state-in-effect מסמן גם טעינה אסינכרונית תקינה
  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  async function logout() {
    await fetch('/api/gilyonot/mefitz/login', { method: 'DELETE' }).catch(() => {})
    setState('login')
  }

  if (state === 'loading') return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="טוען" /></div>
  if (state === 'login') return <Login onDone={load} />

  return (
    <div className="space-y-6">
      {dists.length === 0 ? (
        <div className={card}>
          <p className="text-slate-700">לא נמצא מפיץ פעיל עם הפרטים האלה. אם זו טעות, פנו למשרד.</p>
        </div>
      ) : dists.map(d => <DistCard key={d.id} d={d} onChanged={load} />)}

      {events.length > 0 && (
        <section className={card} aria-labelledby="hist">
          <h2 id="hist" className="mb-3 text-lg font-semibold text-slate-900">הפניות האחרונות</h2>
          <ul className="divide-y divide-slate-100">
            {events.map(e => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{EVENT_LABELS[e.kind] ?? e.kind}{e.quantity != null && ` · ${e.quantity}`}</p>
                  {e.details && <p className="mt-0.5 text-slate-600">{e.details}</p>}
                  <p className="mt-0.5 text-xs text-slate-500">{new Date(e.created_at).toLocaleDateString('he-IL')}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{STATUS_LABEL[e.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" onClick={logout} className="mx-auto flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
        <LogOut className="h-4 w-4" aria-hidden />יציאה מהממשק
      </button>
    </div>
  )
}

function Login({ onDone }: { onDone: () => void }) {
  const meta = LOGIN_LABELS[DISTRIBUTOR_LOGIN_BY]
  const [id, setId] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'id' | 'code'>('id')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const r = await call('/api/gilyonot/mefitz/login', post(step === 'id' ? { step: 'request', id } : { step: 'verify', id, code }))
      if (!r.ok) { setMsg({ ok: false, text: errText(r.data, 'הפעולה נכשלה. נסו שוב.') }); return }
      if (step === 'id') { setStep('code'); setMsg({ ok: true, text: String(r.data.message ?? '') }) }
      else onDone()
    } catch { setMsg({ ok: false, text: 'אין חיבור לשרת. נסו שוב.' }) }
    finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className={`${card} space-y-4`}>
      <p className="text-sm text-slate-600">הכניסה למפיצים רשומים בלבד. נשלח אליכם קוד חד-פעמי.</p>
      <label className="block">
        <span className={label}>{meta.label}</span>
        <input className={input} dir="ltr" inputMode={meta.inputMode} autoComplete={DISTRIBUTOR_LOGIN_BY === 'email' ? 'email' : DISTRIBUTOR_LOGIN_BY === 'phone' ? 'tel' : 'off'}
          placeholder={meta.placeholder} value={id} onChange={e => setId(e.target.value)} disabled={step === 'code'} required />
      </label>
      {step === 'code' && (
        <label className="block">
          <span className={label}>קוד הכניסה</span>
          <input className={`${input} tracking-widest`} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={8}
            value={code} onChange={e => setCode(e.target.value)} required autoFocus />
        </label>
      )}
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
      <button type="submit" className={btnPrimary} disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{step === 'id' ? 'שליחת קוד' : 'כניסה'}
      </button>
      {step === 'code' && (
        <button type="button" className="w-full text-sm text-slate-600 hover:text-slate-900" onClick={() => { setStep('id'); setCode(''); setMsg(null) }}>
          שינוי הפרטים או קבלת קוד חדש
        </button>
      )}
    </form>
  )
}

function DistCard({ d, onChanged }: { d: Dist; onChanged: () => void }) {
  const [action, setAction] = useState<DistributorAction | null>(null)
  const [quantity, setQuantity] = useState('')
  const [details, setDetails] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  function pick(a: DistributorAction) {
    setAction(a === action ? null : a)
    setQuantity(''); setDetails(''); setAddress(''); setCity(''); setMsg(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!action) return
    if (action === 'leave' && !confirm('להפסיק את ההפצה ולצאת ממערך המפיצים? השליח יקבל על כך הודעה.')) return
    setBusy(true); setMsg(null)
    try {
      const r = await call('/api/gilyonot/mefitz', post({ distributorId: d.id, action, quantity, details, address, city }))
      if (!r.ok) { setMsg({ ok: false, text: errText(r.data, 'השליחה נכשלה. נסו שוב.') }); return }
      setMsg({ ok: true, text: String(r.data.message ?? 'נשלח') })
      setAction(null)
      onChanged()
    } catch { setMsg({ ok: false, text: 'אין חיבור לשרת. נסו שוב.' }) }
    finally { setBusy(false) }
  }

  const needsQty = action === 'received' || action === 'increase' || action === 'decrease'
  const current = ACTIONS.find(a => a.key === action)

  return (
    <section className={card} aria-label={d.full_name}>
      <p className="text-sm text-slate-600">שלום, {d.full_name}</p>
      <div className="mt-3 flex items-end justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <p className="text-sm text-slate-600">גיליונות בכל שבוע</p>
          <p className="text-4xl font-bold" style={{ color: '#1B3256' }}>{d.quantity}</p>
        </div>
        <div className="text-left text-sm text-slate-600">
          {d.synagogue && <p>{d.synagogue}</p>}
          <p>{[d.address, d.city].filter(Boolean).join(', ') || 'אין כתובת רשומה'}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {ACTIONS.map(a => (
          <button key={a.key} type="button" onClick={() => pick(a.key)} aria-pressed={action === a.key}
            className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${action === a.key ? 'border-[#1B3256] bg-[#1B3256]/5 text-[#1B3256]' : 'border-slate-200 text-slate-700 hover:border-slate-300'} ${a.key === 'leave' ? 'col-span-2 text-red-700' : ''}`}>
            {a.title}
          </button>
        ))}
      </div>

      {current && (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-600">{current.hint}</p>
          {needsQty && (
            <label className="block">
              <span className={label}>{action === 'received' ? 'כמה גיליונות התקבלו' : 'הכמות החדשה המבוקשת'}</span>
              <input className={input} type="number" min={0} inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} required />
            </label>
          )}
          {action === 'address' && (
            <>
              <label className="block"><span className={label}>הכתובת החדשה</span>
                <input className={input} value={address} onChange={e => setAddress(e.target.value)} required autoComplete="street-address" /></label>
              <label className="block"><span className={label}>עיר (אם השתנתה)</span>
                <input className={input} value={city} onChange={e => setCity(e.target.value)} autoComplete="address-level2" /></label>
            </>
          )}
          <label className="block">
            <span className={label}>{action === 'issue' ? 'תיאור התקלה' : action === 'note' ? 'ההערה' : action === 'leave' ? 'סיבה (לא חובה)' : 'הערה (לא חובה)'}</span>
            <textarea className={input} rows={3} value={details} onChange={e => setDetails(e.target.value)} required={action === 'issue' || action === 'note'} />
          </label>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{action === 'leave' ? 'אישור הפסקת ההפצה' : 'שליחה'}
          </button>
        </form>
      )}
      {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
    </section>
  )
}
