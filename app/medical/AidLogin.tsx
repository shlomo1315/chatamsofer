'use client'

import { useState } from 'react'

// כניסת צאצא רשום לפני הגשת בקשת סיוע: אותם נתיבים כמו בכניסה לאזור האישי.
// אחרי הכניסה העמוד נטען מחדש, והפרטים נמשכים מהכרטיס.

type Method = 'password' | 'email' | 'phone'
const METHODS: [Method, string][] = [['password', 'סיסמה'], ['email', 'קוד במייל'], ['phone', 'קוד בשיחה']]

async function call(path: string, body: Record<string, unknown>) {
  try {
    const r = await fetch(`/api/portal/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    return r.ok && j.ok !== false ? { ok: true as const, j } : { ok: false as const, error: String(j.error || 'הפעולה נכשלה. נסו שוב.') }
  } catch {
    return { ok: false as const, error: 'אין חיבור לשרת. נסו שוב.' }
  }
}

export default function AidLogin({ onSkip }: { onSkip: () => void }) {
  const [idType, setIdType] = useState<'id' | 'passport'>('id')
  const [id, setId] = useState('')
  const [method, setMethod] = useState<Method>('password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState('')
  const [phones, setPhones] = useState<{ index: number; hint: string }[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const who = { idType, id: id.trim() }
  const pick = (m: Method) => { setMethod(m); setError(''); setSent(''); setCode(''); setPhones(null) }

  async function run(fn: () => Promise<void>) {
    if (!who.id) return setError(idType === 'id' ? 'יש להזין מספר תעודת זהות.' : 'יש להזין מספר דרכון.')
    setBusy(true); setError('')
    try { await fn() } finally { setBusy(false) }
  }

  const enter = (path: string, body: Record<string, unknown>) => run(async () => {
    const r = await call(path, { ...who, ...body })
    if (!r.ok) return setError(r.error)
    window.location.assign('/medical')
  })

  const sendEmail = () => run(async () => {
    const r = await call('send-code', who)
    if (!r.ok) return setError(r.error)
    setSent(`שלחנו קוד למייל ${r.j.emailHint ?? ''}`.trim())
  })

  const ring = (phoneIndex?: number) => run(async () => {
    const r = await call('send-phone-code', phoneIndex === undefined ? who : { ...who, phoneIndex })
    if (!r.ok) return setError(r.error)
    if (r.j.phones) {
      const list = r.j.phones as { index: number; hint: string }[]
      if (list.length === 1) {
        const s = await call('send-phone-code', { ...who, phoneIndex: list[0].index })
        if (!s.ok) return setError(s.error)
        setSent(`עוד רגע תתקבל שיחה למספר ${s.j.phoneHint ?? list[0].hint}`)
      } else setPhones(list)
      return
    }
    setPhones(null)
    setSent(`עוד רגע תתקבל שיחה למספר ${r.j.phoneHint ?? ''}`.trim())
  })

  return (
    <>
      <h2>כניסה לצאצאים רשומים</h2>
      <p className="sub">נכנסים פעם אחת, והפרטים שלכם ימולאו בטופס מהכרטיס באיגוד.</p>

      <div className="seg" role="group" aria-label="סוג תעודה" style={{ marginBottom: 'var(--s4)' }}>
        <button type="button" aria-pressed={idType === 'id'} onClick={() => setIdType('id')}>תעודת זהות</button>
        <button type="button" aria-pressed={idType === 'passport'} onClick={() => setIdType('passport')}>דרכון</button>
      </div>
      <div className="field" style={{ marginBottom: 'var(--s5)' }}>
        <label htmlFor="login-id">{idType === 'id' ? 'מספר תעודת זהות' : 'מספר דרכון'}</label>
        <input id="login-id" className="inp ltr" inputMode={idType === 'id' ? 'numeric' : 'text'} autoComplete="username"
          value={id} onChange={e => setId(e.target.value)} />
      </div>

      <div className="tabs" role="tablist">
        {METHODS.map(([m, l]) => (
          <button key={m} type="button" role="tab" aria-selected={method === m} className={method === m ? 'on' : undefined} onClick={() => pick(m)}>{l}</button>
        ))}
      </div>

      {method === 'password' && (
        <form className="login-row" onSubmit={e => { e.preventDefault(); enter('login', { password }) }}>
          <div className="field">
            <label htmlFor="login-pw">סיסמה</label>
            <input id="login-pw" className="inp ltr" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn pri lg" disabled={busy || !password}>{busy ? 'נכנס...' : 'כניסה'}</button>
        </form>
      )}

      {method !== 'password' && !sent && !phones && (
        <button type="button" className="btn pri lg" disabled={busy} onClick={() => (method === 'email' ? sendEmail() : ring())}>
          {busy ? 'שולח...' : method === 'email' ? 'שליחת קוד למייל' : 'קבלת שיחה עם קוד'}
        </button>
      )}

      {phones && !sent && (
        <div className="field">
          <label>לאיזה מספר להתקשר?</label>
          <div className="seg">
            {phones.map(p => <button key={p.index} type="button" className="ltr" disabled={busy} onClick={() => ring(p.index)}>{p.hint}</button>)}
          </div>
        </div>
      )}

      {sent && (
        <form className="login-row" onSubmit={e => { e.preventDefault(); enter(method === 'email' ? 'verify-email-code' : 'verify-phone-code', { code: code.trim() }) }}>
          <div className="field">
            <label htmlFor="login-code">{sent}. הקלידו את הקוד:</label>
            <input id="login-code" className="inp ltr" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} />
          </div>
          <button type="submit" className="btn pri lg" disabled={busy || !code.trim()}>{busy ? 'בודק...' : 'אימות וכניסה'}</button>
        </form>
      )}

      {error && <p role="alert" className="ferr" style={{ marginTop: 'var(--s4)', fontSize: 'var(--t-sm)' }}>{error}</p>}

      <div className="nav">
        <button type="button" className="btn" onClick={onSkip}>אין לי כניסה, המשך לטופס המלא</button>
      </div>
    </>
  )
}
