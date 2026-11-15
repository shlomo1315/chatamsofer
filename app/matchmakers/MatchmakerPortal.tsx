'use client'
import { useEffect, useState } from 'react'
import './portal.css'

type Screen = 'welcome' | 'register' | 'login' | 'code' | 'home' | 'claim' | 'done'
interface ClaimRow {
  id: string; match_date: string; groom_first_name: string; groom_last_name: string
  bride_first_name: string; bride_last_name: string; is_grandchild: boolean
  status: 'pending' | 'approved' | 'rejected' | 'paid'; amount: number | null; reject_reason: string | null; created_at: string
}
interface Me { matchmaker: { first_name: string; last_name: string; email: string }; can_claim_from?: string; claims: ClaimRow[] }

const STATUS: Record<string, string> = { pending: 'ממתין', approved: 'אושר', paid: 'שולם', rejected: 'נדחה' }
const EMPTY_REG = {
  first_name: '', last_name: '', id_number: '', phone: '', email: '', address: '', city: '', birth_date: '', circle: '',
  bank_name: '', bank_branch: '', bank_account: '', website: '',
}
const EMPTY_SIDE = { first_name: '', last_name: '', father_name: '', father_phone: '', mother_name: '', mother_phone: '', address: '', circle: '', id: '' }
const EMPTY_SECOND = { first_name: '', last_name: '', id_number: '', phone: '', email: '', address: '', city: '', circle: '' }
const EMPTY_REASONS = { groom_over_24: false, bride_over_22: false, orphan: '' as '' | 'groom' | 'bride', zivush_groom: false, zivush_bride: false, medical: false }
const EMPTY_CLAIM = {
  match_date: '', groom: EMPTY_SIDE, bride: EMPTY_SIDE,
  single_matchmaker: true, second: EMPTY_SECOND, reasons: EMPTY_REASONS,
  is_grandchild: false, grandchild_side: '' as '' | 'groom' | 'bride' | 'both',
}
type Side = 'groom' | 'bride'
const STEPS = 6

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

// גוף הבקשה בפורמט השטוח שהשרת מצפה לו (groom_*, bride_*)
function claimBody(c: typeof EMPTY_CLAIM) {
  const flat: Record<string, unknown> = {
    match_date: c.match_date, reasons: c.reasons, single_matchmaker: c.single_matchmaker,
    is_grandchild: c.is_grandchild, grandchild_side: c.grandchild_side,
  }
  if (!c.single_matchmaker) flat.second_matchmaker = c.second
  for (const s of ['groom', 'bride'] as const) for (const [k, v] of Object.entries(c[s])) flat[`${s}_${k}`] = v
  return flat
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
  const [note, setNote] = useState('')
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
    const r = await post('/api/matchmakers/claims', claimBody(claim))
    if (!r.ok) { setErr(r.data.error ?? 'שגיאה'); return }
    setNote(r.data.note ?? ''); setClaim(EMPTY_CLAIM); setStep(0); await loadMe(); go('done')
  })
  async function logout() { await post('/api/matchmakers/logout', {}); setMe(null); go('welcome') }

  const rf = (key: keyof typeof EMPTY_REG, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="mm-f"><label htmlFor={`r-${key}`}>{label}</label>
      <input id={`r-${key}`} value={reg[key]} onChange={e => setReg({ ...reg, [key]: e.target.value })} {...props} /></div>
  )
  const df = (id: string, label: string, value: string, onChange: (v: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="mm-f"><label htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={e => onChange(e.target.value)} {...props} /></div>
  )
  const setSide = (s: Side, k: keyof typeof EMPTY_SIDE, v: string) => setClaim(c => ({ ...c, [s]: { ...c[s], [k]: v } }))
  const sf = (s: Side, k: keyof typeof EMPTY_SIDE, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    df(`c-${s}-${k}`, label, claim[s][k], v => setSide(s, k, v), props)
  const setSecond = (k: keyof typeof EMPTY_SECOND, v: string) => setClaim(c => ({ ...c, second: { ...c.second, [k]: v } }))
  const mf = (k: keyof typeof EMPTY_SECOND, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    df(`c-second-${k}`, label, claim.second[k], v => setSecond(k, v), props)
  const setReason = (patch: Partial<typeof EMPTY_REASONS>) => setClaim(c => ({ ...c, reasons: { ...c.reasons, ...patch } }))
  const errBox = err && <div role="alert" className="mm-err">{err}</div>

  const sideStep = (s: Side) => {
    const he = s === 'groom' ? 'החתן' : 'הכלה'
    const orphan = claim.reasons.orphan === s
    return <>
      <h1>פרטי {he}</h1>
      <div className="mm-row">{sf(s, 'first_name', 'שם פרטי', { autoComplete: 'off' })}{sf(s, 'last_name', 'שם משפחה', { autoComplete: 'off' })}</div>
      <fieldset className="mm-set"><legend>האב{orphan ? ' (לא חובה, יתום)' : ''}</legend>
        <div className="mm-row">{sf(s, 'father_name', 'שם האב')}{sf(s, 'father_phone', 'טלפון האב', { type: 'tel', inputMode: 'tel', dir: 'ltr' })}</div></fieldset>
      <fieldset className="mm-set"><legend>האם{orphan ? ' (לא חובה, יתום)' : ''}</legend>
        <div className="mm-row">{sf(s, 'mother_name', 'שם האם')}{sf(s, 'mother_phone', 'טלפון האם', { type: 'tel', inputMode: 'tel', dir: 'ltr' })}</div></fieldset>
      {sf(s, 'address', 'כתובת')}
      {sf(s, 'circle', 'חוג')}
    </>
  }
  const chk = (label: string, checked: boolean, onChange: (v: boolean) => void, hint?: string) => (
    <label className="mm-opt"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span></label>
  )
  const pick = <T extends string>(value: T, options: readonly (readonly [T, string])[], onChange: (v: T) => void, label: string) => (
    <div className="mm-sides" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length},1fr)` }}>
      {options.map(([k, l]) => <button key={k} type="button" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  )

  const claimSteps = [
    <>
      <h1>מתי נסגר השידוך?</h1><p>תאריך הסגירה כפי שהיה בפועל.</p>
      {df('c-match_date', 'תאריך השידוך', claim.match_date, v => setClaim({ ...claim, match_date: v }), { type: 'date' })}
    </>,
    sideStep('groom'),
    sideStep('bride'),
    <>
      <h1>השדכן</h1>
      {chk('אני השדכן היחיד', claim.single_matchmaker, v => setClaim({ ...claim, single_matchmaker: v }), 'אם היה שדכן נוסף, בטלו את הסימון ומלאו את פרטיו.')}
      {!claim.single_matchmaker && <fieldset className="mm-set"><legend>פרטי השדכן הנוסף</legend>
        <div className="mm-row">{mf('first_name', 'שם פרטי')}{mf('last_name', 'שם משפחה')}</div>
        {mf('id_number', 'תעודת זהות', { inputMode: 'numeric', dir: 'ltr', maxLength: 9 })}
        {mf('phone', 'טלפון', { type: 'tel', inputMode: 'tel', dir: 'ltr' })}
        {mf('email', 'מייל', { type: 'email', dir: 'ltr' })}
        {mf('address', 'כתובת')}
        <div className="mm-row">{mf('city', 'עיר')}{mf('circle', 'חוג')}</div>
      </fieldset>}
    </>,
    <>
      <h1>סיבות למלגה</h1><p>סמנו את כל מה שמתאים. אפשר לא לסמן כלל.</p>
      {chk('חתן מעל גיל 24', claim.reasons.groom_over_24, v => setReason({ groom_over_24: v }))}
      {chk('כלה מעל גיל 22', claim.reasons.bride_over_22, v => setReason({ bride_over_22: v }))}
      {chk('יתום', !!claim.reasons.orphan, v => setReason({ orphan: v ? 'groom' : '' }))}
      {claim.reasons.orphan && pick(claim.reasons.orphan, [['groom', 'החתן'], ['bride', 'הכלה']] as const, v => setReason({ orphan: v }), 'מי היתום')}
      {chk('זיוו"ש חתן', claim.reasons.zivush_groom, v => setReason({ zivush_groom: v }))}
      {chk('זיוו"ש כלה', claim.reasons.zivush_bride, v => setReason({ zivush_bride: v }))}
      {chk('רפואי', claim.reasons.medical, v => setReason({ medical: v }))}
    </>,
    <>
      <h1>צאצא החתם סופר?</h1><p>אם אחד מהצדדים צאצא של החתם סופר, סמנו ומלאו תעודת זהות לאימות. המשרד יבדוק ויחליט.</p>
      {chk('צאצא החתם סופר', claim.is_grandchild, v => setClaim({ ...claim, is_grandchild: v, grandchild_side: v ? claim.grandchild_side : '' }), 'מי מהם?')}
      {claim.is_grandchild && pick(claim.grandchild_side, [['groom', 'החתן'], ['bride', 'הכלה'], ['both', 'שניהם']] as const, v => setClaim({ ...claim, grandchild_side: v }), 'מי צאצא החתם סופר')}
      {(claim.grandchild_side === 'groom' || claim.grandchild_side === 'both') && sf('groom', 'id', 'תעודת זהות החתן', { inputMode: 'numeric', dir: 'ltr', maxLength: 9 })}
      {(claim.grandchild_side === 'bride' || claim.grandchild_side === 'both') && sf('bride', 'id', 'תעודת זהות הכלה', { inputMode: 'numeric', dir: 'ltr', maxLength: 9 })}
    </>,
  ]
  const sideReady = (s: Side) => {
    const x = claim[s]; const orphan = claim.reasons.orphan === s
    return !!(x.first_name && x.last_name && x.address && x.circle && (orphan || (x.father_name && x.father_phone && x.mother_name && x.mother_phone)))
  }
  const second = claim.second
  const gcSide = claim.grandchild_side
  const stepReady = [
    !!claim.match_date,
    sideReady('groom'),
    sideReady('bride'),
    claim.single_matchmaker || !!(second.first_name && second.last_name && second.id_number && second.phone && second.email && second.address && second.city && second.circle),
    true,
    !claim.is_grandchild || (!!gcSide && (gcSide === 'bride' || !!claim.groom.id) && (gcSide === 'groom' || !!claim.bride.id)),
  ]
  const canClaim = !me?.can_claim_from || me.can_claim_from <= new Date().toISOString().slice(0, 10)
  const fromHe = me?.can_claim_from ? new Date(me.can_claim_from).toLocaleDateString('he-IL') : ''

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
        <div className="mm-row">{rf('city', 'עיר', { required: true, autoComplete: 'address-level2' })}{rf('circle', 'חוג', { required: true })}</div>
        {rf('birth_date', 'תאריך לידה', { required: true, type: 'date' })}
        <fieldset className="mm-set"><legend>פרטי חשבון להעברת המלגה</legend>
          <p className="mm-hint">נאספים פעם אחת בלבד. שינוי בהמשך רק דרך המשרד.</p>
          {rf('bank_name', 'בנק', { required: true })}
          <div className="mm-row">{rf('bank_branch', 'סניף', { required: true, inputMode: 'numeric', dir: 'ltr', maxLength: 4 })}{rf('bank_account', 'חשבון', { required: true, inputMode: 'numeric', dir: 'ltr', maxLength: 12 })}</div>
        </fieldset>
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
        {canClaim
          ? <button className="mm-btn gold" onClick={() => { setStep(0); go('claim') }}>עשיתי שידוך</button>
          : <div className="mm-wait" role="status"><b>הגשת בקשות תיפתח ב-{fromHe}</b><small>עד אז אפשר להיכנס ולהתעדכן, ולא להגיש בקשה.</small></div>}
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

      {screen === 'claim' && <form className="mm-card" onSubmit={e => { e.preventDefault(); if (step < STEPS - 1) setStep(step + 1); else submitClaim() }}>
        <div className="mm-steps" aria-label={`שלב ${step + 1} מתוך ${STEPS}`}>{Array.from({ length: STEPS }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        {claimSteps[step]}
        {errBox}
        <button className="mm-btn" disabled={busy || !stepReady[step]}>{step < STEPS - 1 ? 'המשך' : busy ? 'שולח…' : 'שליחת הבקשה'}</button>
        <button type="button" className="mm-link" onClick={() => (step === 0 ? go('home') : setStep(step - 1))}>חזרה</button>
      </form>}

      {screen === 'done' && <section className="mm-card mm-done">
        <div className="tick" aria-hidden>✓</div>
        <h1>הבקשה התקבלה</h1><p>שלחנו אישור קבלה למייל. הסטטוס יופיע באזור האישי.</p>
        {note && <div className="mm-wait" role="status"><b>{note}</b></div>}
        <button className="mm-btn" onClick={() => go('home')}>לאזור האישי</button>
      </section>}
    </main>
  )
}
