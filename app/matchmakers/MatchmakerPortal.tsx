'use client'
import { useEffect, useState } from 'react'
import './portal.css'

type Screen = 'welcome' | 'register' | 'login' | 'code' | 'home' | 'claim' | 'done'
interface ClaimRow {
  id: string; match_date: string; groom_first_name: string; groom_last_name: string
  bride_first_name: string; bride_last_name: string; is_grandchild: boolean
  status: 'pending' | 'approved' | 'rejected' | 'paid'; amount: number | null; reject_reason: string | null; created_at: string
}
interface Me { matchmaker: { first_name: string; last_name: string; email: string }; claims: ClaimRow[] }

const STATUS: Record<string, string> = { pending: 'ממתין', approved: 'אושר', paid: 'שולם', rejected: 'נדחה' }
const EMPTY_REG = { first_name: '', last_name: '', id_number: '', phone: '', email: '', address: '', city: '', birth_date: '', website: '' }
const EMPTY_CLAIM = {
  match_date: '', groom_first_name: '', groom_last_name: '', groom_id: '', groom_father_name: '', groom_phone: '',
  bride_first_name: '', bride_last_name: '', bride_id: '', bride_father_name: '', bride_phone: '',
  is_grandchild: false, grandchild_side: '' as '' | 'groom' | 'bride' | 'both',
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export default function MatchmakerPortal({ demoScreen, demoMe, demoStep }: { demoScreen?: Screen; demoMe?: Me; demoStep?: number }) {
  const [screen, setScreen] = useState<Screen>(demoScreen ?? 'welcome')
  const [me, setMe] = useState<Me | null>(demoMe ?? null)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [reg, setReg] = useState(EMPTY_REG)
  const [step, setStep] = useState(demoStep ?? 0)
  const [claim, setClaim] = useState(EMPTY_CLAIM)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadMe(): Promise<boolean> {
    const res = await fetch('/api/matchmakers/me', { cache: 'no-store' })
    if (!res.ok) return false
    setMe(await res.json()); return true
  }
  useEffect(() => {
    if (demoScreen) return
    let alive = true
    fetch('/api/matchmakers/me', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (alive && d) { setMe(d); setScreen('home') } }).catch(() => {})
    return () => { alive = false }
  }, [demoScreen])

  const go = (s: Screen) => { setErr(''); setScreen(s) }

  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr('')
    try { await fn() } catch { setErr('תקלת תקשורת. נסו שוב.') }
    setBusy(false)
  }

  const submitRegister = () => run(async () => {
    const r = await post('/api/matchmakers/register', reg)
    if (r.ok) { setEmail(reg.email.trim().toLowerCase()); go('code'); return }
    if (r.data.exists) setEmail(reg.email.trim().toLowerCase())
    setErr(r.data.error ?? 'שגיאה')
  })
  const submitLogin = () => run(async () => {
    const r = await post('/api/matchmakers/request-code', { email })
    if (r.ok) go('code'); else setErr(r.data.error ?? 'שגיאה')
  })
  const submitCode = () => run(async () => {
    const r = await post('/api/matchmakers/verify-code', { email, code })
    if (!r.ok) { setErr(r.data.error ?? 'הקוד שגוי או שפג תוקפו'); return }
    setCode(''); await loadMe(); go('home')
  })
  const submitClaim = () => run(async () => {
    const r = await post('/api/matchmakers/claims', claim)
    if (!r.ok) { setErr(r.data.error ?? 'שגיאה'); return }
    setClaim(EMPTY_CLAIM); setStep(0); await loadMe(); go('done')
  })
  async function logout() { await post('/api/matchmakers/logout', {}); setMe(null); go('welcome') }

  const rf = (key: keyof typeof EMPTY_REG, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="mm-f"><label htmlFor={`r-${key}`}>{label}</label>
      <input id={`r-${key}`} value={reg[key]} onChange={e => setReg({ ...reg, [key]: e.target.value })} {...props} /></div>
  )
  const cf = (key: keyof typeof EMPTY_CLAIM, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="mm-f"><label htmlFor={`c-${key}`}>{label}</label>
      <input id={`c-${key}`} value={claim[key] as string} onChange={e => setClaim({ ...claim, [key]: e.target.value })} {...props} /></div>
  )
  const errBox = err && <div role="alert" className="mm-err">{err}</div>

  const claimSteps = [
    <>
      <h1>מתי נסגר השידוך?</h1><p>תאריך הסגירה כפי שהיה בפועל.</p>
      {cf('match_date', 'תאריך השידוך', { type: 'date' })}
    </>,
    <>
      <h1>פרטי החתן</h1>
      <div className="mm-row">{cf('groom_first_name', 'שם פרטי', { autoComplete: 'off' })}{cf('groom_last_name', 'שם משפחה', { autoComplete: 'off' })}</div>
      {cf('groom_id', 'תעודת זהות', { inputMode: 'numeric', dir: 'ltr', maxLength: 9 })}
      {cf('groom_father_name', 'שם האב')}
      {cf('groom_phone', 'טלפון (לא חובה)', { inputMode: 'tel', dir: 'ltr', type: 'tel' })}
    </>,
    <>
      <h1>פרטי הכלה</h1>
      <div className="mm-row">{cf('bride_first_name', 'שם פרטי', { autoComplete: 'off' })}{cf('bride_last_name', 'שם משפחה', { autoComplete: 'off' })}</div>
      {cf('bride_id', 'תעודת זהות', { inputMode: 'numeric', dir: 'ltr', maxLength: 9 })}
      {cf('bride_father_name', 'שם האב')}
      {cf('bride_phone', 'טלפון (לא חובה)', { inputMode: 'tel', dir: 'ltr', type: 'tel' })}
    </>,
    <>
      <h1>נכד החתם סופר?</h1><p>אם אחד מהצדדים נכד של החתם סופר, סמנו. המשרד יבדוק ויחליט.</p>
      <label className="mm-gc"><input type="checkbox" checked={claim.is_grandchild} onChange={e => setClaim({ ...claim, is_grandchild: e.target.checked, grandchild_side: e.target.checked ? claim.grandchild_side : '' })} />
        <span><b>נכד החתם סופר</b><br />מי מהם?</span></label>
      {claim.is_grandchild && <div className="mm-sides" role="group" aria-label="מי נכד החתם סופר">
        {([['groom', 'החתן'], ['bride', 'הכלה'], ['both', 'שניהם']] as const).map(([k, l]) =>
          <button key={k} type="button" className={claim.grandchild_side === k ? 'on' : ''} onClick={() => setClaim({ ...claim, grandchild_side: k })}>{l}</button>)}
      </div>}
    </>,
  ]
  const stepReady = [
    !!claim.match_date,
    !!(claim.groom_first_name && claim.groom_last_name && claim.groom_id),
    !!(claim.bride_first_name && claim.bride_last_name && claim.bride_id),
    !claim.is_grandchild || !!claim.grandchild_side,
  ]

  return (
    <main className="mm">
      <div className="mm-brand"><div className="mm-mark" aria-hidden>ש</div><div><b>מלגת שדכנים</b><span>בית החתם סופר</span></div></div>

      {screen === 'welcome' && <section className="mm-card">
        <h1>עשיתם שידוך?</h1>
        <p>הירשמו פעם אחת, והגישו בקשת מלגה על כל שידוך. הכניסה בכל פעם עם קוד שנשלח למייל.</p>
        <button className="mm-btn" onClick={() => go('register')}>הרשמה</button>
        <button className="mm-btn ghost" onClick={() => go('login')}>כבר רשום? כניסה</button>
      </section>}

      {screen === 'register' && <form className="mm-card" onSubmit={e => { e.preventDefault(); submitRegister() }}>
        <h1>הרשמה</h1><p>הפרטים נשמרים בצורה מוצפנת ומשמשים רק לטיפול במלגה.</p>
        <div className="mm-row">{rf('first_name', 'שם פרטי', { required: true, autoComplete: 'given-name' })}{rf('last_name', 'שם משפחה', { required: true, autoComplete: 'family-name' })}</div>
        {rf('id_number', 'תעודת זהות', { required: true, inputMode: 'numeric', dir: 'ltr', maxLength: 9 })}
        {rf('phone', 'טלפון', { required: true, type: 'tel', inputMode: 'tel', dir: 'ltr', autoComplete: 'tel' })}
        {rf('email', 'מייל', { required: true, type: 'email', dir: 'ltr', autoComplete: 'email' })}
        {rf('address', 'כתובת', { required: true, autoComplete: 'street-address' })}
        {rf('city', 'עיר', { required: true, autoComplete: 'address-level2' })}
        {rf('birth_date', 'תאריך לידה', { required: true, type: 'date' })}
        <input className="mm-hp" tabIndex={-1} autoComplete="off" aria-hidden value={reg.website} onChange={e => setReg({ ...reg, website: e.target.value })} name="website" />
        {errBox}
        <button className="mm-btn" disabled={busy}>{busy ? 'שולח…' : 'הרשמה וקבלת קוד'}</button>
        <button type="button" className="mm-link" onClick={() => go('login')}>כבר רשום? כניסה</button>
      </form>}

      {screen === 'login' && <form className="mm-card" onSubmit={e => { e.preventDefault(); submitLogin() }}>
        <h1>כניסה</h1><p>נשלח קוד בן 6 ספרות לכתובת המייל שנרשמתם איתה.</p>
        <div className="mm-f"><label htmlFor="l-email">מייל</label><input id="l-email" type="email" dir="ltr" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        {errBox}
        <button className="mm-btn" disabled={busy}>{busy ? 'שולח…' : 'שלחו לי קוד'}</button>
        <button type="button" className="mm-link" onClick={() => go('welcome')}>חזרה</button>
      </form>}

      {screen === 'code' && <form className="mm-card" onSubmit={e => { e.preventDefault(); submitCode() }}>
        <h1>הקלידו את הקוד</h1><p>אם הכתובת רשומה, נשלח אליה קוד. הוא תקף 10 דקות.</p>
        <div className="mm-f"><label htmlFor="c-code">קוד בן 6 ספרות</label>
          <input id="c-code" className="mm-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></div>
        {errBox}
        <button className="mm-btn" disabled={busy || code.length !== 6}>{busy ? 'בודק…' : 'כניסה'}</button>
        <button type="button" className="mm-link" onClick={submitLogin}>שלחו לי קוד חדש</button>
      </form>}

      {screen === 'home' && me && <section className="mm-card">
        <h1>שלום {me.matchmaker.first_name}</h1>
        <button className="mm-btn gold" onClick={() => { setStep(0); go('claim') }}>עשיתי שידוך</button>
        <p>הבקשות שלי</p>
        <div className="mm-list">
          {me.claims.length === 0 && <p>עדיין לא הוגשו בקשות.</p>}
          {me.claims.map(c => (
            <div key={c.id} className="mm-item">
              <div><b>{c.groom_first_name} {c.groom_last_name} ו{c.bride_first_name} {c.bride_last_name}</b>
                <small>הוגש {new Date(c.created_at).toLocaleDateString('he-IL')}{c.amount != null ? ` · ₪${c.amount.toLocaleString('he-IL')}` : ''}</small>
                {c.status === 'rejected' && c.reject_reason && <small style={{ display: 'block' }}>{c.reject_reason}</small>}</div>
              <span className={`mm-pill ${c.status}`}>{STATUS[c.status]}</span>
            </div>
          ))}
        </div>
        <button className="mm-link" onClick={logout}>התנתקות</button>
      </section>}

      {screen === 'claim' && <form className="mm-card" onSubmit={e => { e.preventDefault(); if (step < 3) setStep(step + 1); else submitClaim() }}>
        <div className="mm-steps" aria-label={`שלב ${step + 1} מתוך 4`}>{[0, 1, 2, 3].map(i => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        {claimSteps[step]}
        {errBox}
        <button className="mm-btn" disabled={busy || !stepReady[step]}>{step < 3 ? 'המשך' : busy ? 'שולח…' : 'שליחת הבקשה'}</button>
        <button type="button" className="mm-link" onClick={() => (step === 0 ? go('home') : setStep(step - 1))}>חזרה</button>
      </form>}

      {screen === 'done' && <section className="mm-card mm-done">
        <div className="tick" aria-hidden>✓</div>
        <h1>הבקשה התקבלה</h1><p>שלחנו אישור קבלה למייל. הסטטוס יופיע באזור האישי.</p>
        <button className="mm-btn" onClick={() => go('home')}>לאזור האישי</button>
      </section>}
    </main>
  )
}
