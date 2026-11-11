'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import AidIcon from '@/components/admin/AidIcon'
import CityStreetPicker from '@/components/ui/CityStreetPicker'
import { REASONS, NEED, KID_STATUSES, isOptionalDoc, type AidReason, type FamilyKid, type KidStatus } from '@/lib/aidDepartmentV2'
import { MARITAL_STATUSES, MEDICAL_FILE_TYPES, MEDICAL_MAX_FILE } from '@/lib/medicalRequest'
import { fieldError, isMarried, personalErrors, type PersonalField, type PersonalInput } from '@/lib/aidApplyValidation'
import AidLogin from './AidLogin'

// טופס בקשת סיוע: שאלת פתיחה (צאצא רשום נכנס, אחר ממשיך לטופס), ואז ארבעה שלבים.
// צאצא מחובר מקבל את הפרטים האישיים מהכרטיס; מי שהגיע מהקישור ממלא הכול.

export interface AidPrefill {
  first: string; last: string; id: string; birth: string
  phone: string; phone2: string; email: string; marital: string
  address: string; city: string
  wife: { name: string; id: string; birth: string; phone: string }
}

const STEPS = ['פרטים אישיים', 'פרטי הבקשה', 'הכנסות', 'שליחה']
const EXTRA_DOC = 'מסמך נוסף'
const EMPTY_KID: FamilyKid = { name: '', id: '', birth: '', status: 'בבית' }
const ACCEPT = Object.keys(MEDICAL_FILE_TYPES).map(e => `.${e}`).join(',')
const digits = (v: string) => v.replace(/\D/g, '')
const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, '')) || 0)
// בכרטיס כתוב לפעמים "נשוי" או "רווק". השרת מקבל רק את הסטטוסים של הטופס.
const toMarital = (m: string) => (isMarried(m) ? 'נשואים' : MARITAL_STATUSES.includes(m.trim()) ? m.trim() : '')

function F({ label, req, hint, err, children, wide }: { label: string; req?: boolean; hint?: string; err?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="field" style={wide ? { gridColumn: '1/-1' } : undefined}>
      <label className={req ? 'req' : undefined}>{label}</label>
      {children}
      {err ? <small className="ferr" role="alert">{err}</small> : hint && <small>{hint}</small>}
    </div>
  )
}

// חתימה באצבע או בעכבר. הקנבס נשמר כ-PNG בשליחה.
function SignPad({ canvasRef, onInk }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; onInk: (v: boolean) => void }) {
  const drawing = useRef(false)
  const reset = () => {
    const c = canvasRef.current
    if (!c) return
    const r = window.devicePixelRatio > 1 ? 2 : 1
    c.width = c.clientWidth * r
    c.height = c.clientHeight * r
    const x = c.getContext('2d')!
    x.fillStyle = '#fff'
    x.fillRect(0, 0, c.width, c.height)
    x.setTransform(r, 0, 0, r, 0, 0)
    x.lineWidth = 2.4
    x.lineCap = 'round'
    x.lineJoin = 'round'
    x.strokeStyle = '#14213D'
    onInk(false)
  }
  useEffect(reset, []) // eslint-disable-line react-hooks/exhaustive-deps
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect()
    return [e.clientX - b.left, e.clientY - b.top] as const
  }
  return (
    <div className="signpad">
      <canvas ref={canvasRef} aria-label="מסגרת חתימה"
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; const x = e.currentTarget.getContext('2d')!; x.beginPath(); x.moveTo(...at(e)) }}
        onPointerMove={e => { if (!drawing.current) return; const x = e.currentTarget.getContext('2d')!; x.lineTo(...at(e)); x.stroke(); onInk(true) }}
        onPointerUp={() => { drawing.current = false }}
        onPointerCancel={() => { drawing.current = false }} />
      <button type="button" className="signclear" onClick={reset}>ניקוי</button>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="aid-modal-t">
        <div className="modal-b">
          <h2 id="aid-modal-t">{title}</h2>
          {children}
        </div>
      </div>
    </>
  )
}

export default function AidWizard({ who, prefill }: { who?: string; prefill?: AidPrefill }) {
  const registered = !!prefill
  const p = prefill
  const [gate, setGate] = useState<'ask' | 'login' | 'form'>(registered ? 'form' : 'ask')
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ no: number | null } | null>(null)
  const [thanksOpen, setThanksOpen] = useState(false)
  const [decl, setDecl] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [signed, setSigned] = useState(false)
  const sigRef = useRef<HTMLCanvasElement | null>(null)
  const [touched, setTouched] = useState<Partial<Record<PersonalField, boolean>>>({})

  const [me, setMe] = useState({
    first: p?.first ?? '', last: p?.last ?? '', id: p?.id ?? '', birth: p?.birth ?? '',
    phone: p?.phone ?? '', phone2: p?.phone2 ?? '', email: p?.email ?? '',
    marital: toMarital(p?.marital ?? ''), address: p?.address ?? '', city: p?.city ?? '', relation: '',
  })
  const [wife, setWife] = useState(p?.wife ?? { name: '', id: '', birth: '', phone: '' })
  const [kids, setKids] = useState<FamilyKid[]>([{ ...EMPTY_KID }])
  const [inc, setInc] = useState({ husbandJob: '', husband: '', wifeJob: '', wife: '', benefits: '', other: '', rent: '', debts: '' })
  const [reason, setReason] = useState<AidReason>('medical')
  const [story, setStory] = useState('')
  const [amount, setAmount] = useState('')
  const [referrer, setReferrer] = useState('')
  const [files, setFiles] = useState<Record<string, File>>({})

  const docs = useMemo(() => NEED[reason], [reason])
  const married = isMarried(me.marital)
  const pin: PersonalInput = {
    id: me.id, first: me.first, last: me.last, birth: me.birth, marital: me.marital,
    phone: me.phone, phone2: me.phone2, email: me.email, city: me.city, address: me.address,
    wifeName: wife.name, wifeId: wife.id, wifePhone: wife.phone,
  }
  // שגיאה מוצגת ליד השדה רק אחרי שיצאו ממנו (או אחרי ניסיון להמשיך)
  const err = (f: PersonalField) => (touched[f] ? fieldError(f, pin) : '')
  const blur = (f: PersonalField) => () => setTouched(t => ({ ...t, [f]: true }))
  const inv = (f: PersonalField) => ({ onBlur: blur(f), 'aria-invalid': !!err(f) || undefined })

  const setM = (k: keyof typeof me) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setMe(s => ({ ...s, [k]: e.target.value }))
  const setW = (k: keyof typeof wife) => (e: React.ChangeEvent<HTMLInputElement>) => setWife(s => ({ ...s, [k]: e.target.value }))
  const setI = (k: keyof typeof inc) => (e: React.ChangeEvent<HTMLInputElement>) => setInc(s => ({ ...s, [k]: e.target.value }))
  const setKid = (i: number, k: keyof FamilyKid, v: string) => setKids(ks => ks.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const kidCount = kids.filter(k => k.name.trim()).length

  function pickFile(label: string, f: File | undefined) {
    if (!f) return
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!MEDICAL_FILE_TYPES[ext]) return setError('אפשר להעלות רק תמונה או PDF.')
    if (f.size > MEDICAL_MAX_FILE) return setError('הקובץ גדול מ-10MB.')
    setError('')
    setFiles(s => ({ ...s, [label]: f }))
  }

  // בדיקה לפני מעבר שלב. השרת בודק שוב את הכול.
  function check(s: number): string {
    if (s === 0) {
      const bad = personalErrors(pin, registered)
      const keys = Object.keys(bad) as PersonalField[]
      if (keys.length) {
        setTouched(t => ({ ...t, ...Object.fromEntries(keys.map(k => [k, true])) }))
        return 'יש לתקן את השדות המסומנים באדום.'
      }
    }
    if (s === 1) {
      if (!story.trim()) return 'יש לספר בקצרה על הבקשה.'
      if (!(num(amount) > 0)) return 'יש להזין את הסכום המבוקש.'
      const missing = docs.filter(d => !isOptionalDoc(d) && !files[d])
      if (missing.length) return `חסר מסמך: ${missing.join(', ')}.`
    }
    if (s === 3) {
      if (!decl) return 'יש לסמן את ההצהרה ולאשר את מדיניות הפרטיות.'
      if (!signed) return 'יש לחתום במסגרת החתימה.'
    }
    return ''
  }

  function go(to: number) {
    if (to > step) {
      for (let s = step; s < to; s++) {
        const e = check(s)
        if (e) { setStep(s); setError(e); return }
      }
    }
    setError('')
    setStep(to)
    setReached(r => Math.max(r, to))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit() {
    for (let s = 0; s < STEPS.length; s++) {
      const e = check(s)
      if (e) { if (s !== step) setStep(s); setError(e); return }
    }
    const sig = await new Promise<Blob | null>(r => (sigRef.current ? sigRef.current.toBlob(r, 'image/png') : r(null)))
    if (!sig) { setError('יש לחתום במסגרת החתימה.'); return }
    setBusy(true)
    setError('')
    const fd = new FormData()
    const put = (k: string, v: string) => fd.append(k, v)
    put('website', '')
    put('id_number', digits(me.id))
    put('full_name', `${me.first.trim()} ${me.last.trim()}`.trim())
    put('phone', me.phone.trim())
    put('phone2', me.phone2.trim())
    put('email', me.email.trim())
    put('address', me.address.trim())
    put('city', me.city.trim())
    put('birth_date', me.birth)
    put('marital_status', me.marital)
    put('children_count', String(kidCount))
    put('spouse_name', married ? wife.name.trim() : '')
    put('spouse_id_number', married ? digits(wife.id) : '')
    put('relation', me.relation.trim())
    put('referrer', referrer.trim())
    put('aid_type', reason)
    put('reason', story.trim())
    put('amount', String(num(amount)))
    put('family', JSON.stringify({ wife: married && wife.name.trim() ? wife : null, kids: kids.filter(k => k.name.trim()) }))
    put('income', JSON.stringify({
      husbandJob: inc.husbandJob, husband: num(inc.husband), wifeJob: inc.wifeJob, wife: num(inc.wife),
      benefits: num(inc.benefits), other: num(inc.other), rent: num(inc.rent), debts: num(inc.debts),
    }))
    put('privacy_consent', '1')
    fd.append('signature', sig, 'signature.png')
    let i = 0
    for (const label of [...docs, EXTRA_DOC]) {
      const f = files[label]
      if (!f) continue
      fd.append(`doc_${i}`, f)
      put(`doc_label_${i}`, label)
      i++
    }
    try {
      const r = await fetch('/api/medical/submit', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setError(j.error || 'השליחה נכשלה. נסו שוב.'); return }
      setDone({ no: j.requestNo ?? null })
      setThanksOpen(true)
      window.scrollTo({ top: 0 })
    } catch {
      setError('אין חיבור לשרת. נסו שוב.')
    } finally {
      setBusy(false)
    }
  }

  const lock = registered ? { readOnly: true } : {}
  const reasonLabel = REASONS.find(r => r[0] === reason)?.[1] ?? ''
  const RECEIVED = 'הבקשה שלך התקבלה בהצלחה ועברה למזכירות לטיפול. עדכון יישלח אליך במייל כשהבקשה תטופל.'

  return (
    <div className="aidui" dir="rtl" style={{ minHeight: '100vh' }}>
      <header className="pub-head">
        <div className="in">
          <div className="mark">ח</div>
          <div>
            <div className="t1">איגוד צאצאי החתם סופר</div>
            <div className="t2">מחלקת סיוע</div>
          </div>
          <div className="who">
            <AidIcon name={registered ? 'user' : 'link'} />
            <span>{registered ? `מחובר: ${who ?? ''} · צאצא רשום` : 'הגשת בקשת סיוע'}</span>
          </div>
        </div>
      </header>

      <main className="pub">
        {done ? (
          <div className="formcard thanks">
            {done.no != null && <div className="big">{done.no}</div>}
            <h2>הבקשה התקבלה.</h2>
            <p className="sub" style={{ margin: 0 }}>{done.no != null ? 'זה מספר הבקשה שלך. ' : ''}{RECEIVED}</p>
          </div>
        ) : (
          <>
            <h1>בקשת סיוע<em>.</em></h1>
            <p className="lead">ממלאים פעם אחת, ומצרפים את המסמכים. הבקשה מגיעה למזכירות המחלקה, והתשובה תישלח אליכם במייל.</p>
            {gate === 'form' && (
              <div className="entry">
                <span className="entry-note">
                  <AidIcon name={registered ? 'lock' : 'check'} />
                  {registered ? 'הפרטים האישיים מולאו מהכרטיס שלך באיגוד. אפשר לתקן.' : 'ממלאים ושולחים, בלי הרשמה.'}
                </span>
              </div>
            )}

            <div className="pub-grid">
              <div>
                {gate === 'form' && (
                  <div className="steps">
                    {STEPS.map((s, i) => (
                      <button key={s} type="button" className={i === step ? 'cur' : i < step ? 'done' : undefined}
                        disabled={i > reached} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}>
                        <span className="n">{i < step ? <AidIcon name="check" size={12} /> : i + 1}</span>{s}
                      </button>
                    ))}
                  </div>
                )}

                <div className="formcard">
                  {gate === 'ask' && (
                    <>
                      <h2>האם אתם נכדי החתם סופר?</h2>
                      <p className="sub">צאצא רשום באיגוד נכנס, והפרטים שלו ימולאו מהכרטיס. מי שאינו רשום ממלא את הטופס המלא.</p>
                      <div className="reasons gate">
                        <button type="button" className="reason" onClick={() => setGate('login')}>
                          <b>כן</b><span>כניסה עם תעודת זהות או דרכון, בסיסמה או בקוד</span>
                        </button>
                        <button type="button" className="reason" onClick={() => setGate('form')}>
                          <b>לא</b><span>ממשיכים ישר לטופס המלא</span>
                        </button>
                      </div>
                    </>
                  )}

                  {gate === 'login' && <AidLogin onSkip={() => setGate('form')} />}

                  {gate === 'form' && (
                    <>
                      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', clipPath: 'inset(50%)', pointerEvents: 'none' }} />

                      {step === 0 && (
                        <>
                          <h2>פרטים אישיים</h2>
                          <p className="sub">{registered ? 'בדקו שהפרטים נכונים, והשלימו מה שחסר.' : 'הפרטים של מגיש הבקשה ושל המשפחה.'}</p>
                          {registered && <div className="lockhint"><AidIcon name="lock" />נמשך מכרטיס הצאצא שלך</div>}
                          <div className={`g2${registered ? ' locked' : ''}`} style={{ marginBottom: 'var(--s4)' }}>
                            <F label="תעודת זהות" req={!registered} err={err('id')}>
                              <input className="inp ltr" inputMode="numeric" maxLength={12} value={me.id} onChange={setM('id')} {...lock} {...(registered ? {} : inv('id'))} />
                            </F>
                          </div>
                          <div className="field" style={{ marginBottom: 'var(--s4)' }}>
                            <label className="req">מצב משפחתי</label>
                            <div className="seg" role="group" aria-label="מצב משפחתי">
                              {MARITAL_STATUSES.map(m => (
                                <button key={m} type="button" aria-pressed={me.marital === m}
                                  onClick={() => { setMe(s => ({ ...s, marital: m })); setTouched(t => ({ ...t, marital: true })) }}>{m}</button>
                              ))}
                            </div>
                            {err('marital') && <small className="ferr" role="alert">{err('marital')}</small>}
                          </div>
                          <div className={`g2${registered ? ' locked' : ''}`} style={{ marginBottom: 'var(--s4)' }}>
                            <F label="שם פרטי" req={!registered} err={err('first')}><input className="inp" value={me.first} onChange={setM('first')} {...lock} {...(registered ? {} : inv('first'))} /></F>
                            <F label="שם משפחה" req={!registered} err={err('last')}><input className="inp" value={me.last} onChange={setM('last')} {...lock} {...(registered ? {} : inv('last'))} /></F>
                          </div>

                          {married && (
                            <>
                              <div className="sect">פרטי האישה</div>
                              <div className="g2" style={{ marginBottom: 'var(--s4)' }}>
                                <F label="שם מלא" req err={err('wifeName')}><input className="inp" value={wife.name} onChange={setW('name')} {...inv('wifeName')} /></F>
                                <F label="תעודת זהות" req err={err('wifeId')}><input className="inp ltr" inputMode="numeric" maxLength={12} value={wife.id} onChange={setW('id')} {...inv('wifeId')} /></F>
                                <F label="תאריך לידה"><input className="inp" type="date" value={wife.birth} onChange={setW('birth')} /></F>
                                <F label="טלפון (לא חובה)" err={err('wifePhone')}><input className="inp ltr" type="tel" value={wife.phone} onChange={setW('phone')} {...inv('wifePhone')} /></F>
                              </div>
                            </>
                          )}

                          <div className="sect">פרטי קשר</div>
                          <div className="g2">
                            <div className={registered ? 'locked' : undefined}>
                              <F label="תאריך לידה" req={!registered} err={err('birth')}><input className="inp" type="date" value={me.birth} onChange={setM('birth')} {...lock} {...(registered ? {} : inv('birth'))} /></F>
                            </div>
                            <F label="טלפון נייד" req err={err('phone')}><input className="inp ltr" type="tel" value={me.phone} onChange={setM('phone')} {...inv('phone')} /></F>
                            <F label="טלפון נוסף (לא חובה)" err={err('phone2')}><input className="inp ltr" type="tel" value={me.phone2} onChange={setM('phone2')} {...inv('phone2')} /></F>
                            <F label="מייל" req hint="לכאן נשלח את התשובה לבקשה." err={err('email')}><input className="inp ltr" type="email" value={me.email} onChange={setM('email')} {...inv('email')} /></F>
                            {registered ? (
                              <>
                                <F label="כתובת"><input className="inp" value={me.address} onChange={setM('address')} /></F>
                                <F label="עיר"><input className="inp" value={me.city} onChange={setM('city')} /></F>
                              </>
                            ) : (
                              <F label="כתובת ועיר" req wide err={err('city') || err('address')}>
                                <div onBlur={() => setTouched(t => ({ ...t, city: true, address: true }))}>
                                  <CityStreetPicker city={me.city} address={me.address} cityRequired addressRequired
                                    onCityChange={v => setMe(s => ({ ...s, city: v }))} onAddressChange={v => setMe(s => ({ ...s, address: v }))} />
                                </div>
                              </F>
                            )}
                            {!registered && (
                              <F label="הקשר למשפחת החתם סופר (לא חובה)" wide><input className="inp" value={me.relation} onChange={setM('relation')} /></F>
                            )}
                          </div>

                          <div className="sect">הילדים</div>
                          <table className="kids">
                            <thead><tr><th>שם</th><th>תעודת זהות</th><th>תאריך לידה</th><th>מצב</th></tr></thead>
                            <tbody>
                              {kids.map((k, i) => (
                                <tr key={i}>
                                  <td><input className="inp" aria-label="שם" placeholder="שם" value={k.name} onChange={e => setKid(i, 'name', e.target.value)} /></td>
                                  <td><input className="inp ltr" aria-label="תעודת זהות" inputMode="numeric" value={k.id} onChange={e => setKid(i, 'id', e.target.value)} /></td>
                                  <td><input className="inp" aria-label="תאריך לידה" type="date" value={k.birth} onChange={e => setKid(i, 'birth', e.target.value)} /></td>
                                  <td>
                                    <select className="inp" aria-label="מצב" value={k.status} onChange={e => setKid(i, 'status', e.target.value as KidStatus)}>
                                      {KID_STATUSES.map(s => <option key={s}>{s}</option>)}
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {kids.length < 30 && <button type="button" className="addrow" onClick={() => setKids(ks => [...ks, { ...EMPTY_KID }])}>+ ילד נוסף</button>}
                        </>
                      )}

                      {step === 1 && (
                        <>
                          <h2>פרטי הבקשה</h2>
                          <p className="notice" role="note">הגשת הבקשה אינה מהווה התחייבות לתמיכה ואינה מעידה על זכאות.</p>
                          <div className="sect">סוג התמיכה</div>
                          <div className="reasons" style={{ marginBottom: 'var(--s5)' }}>
                            {REASONS.map(([k, l, d]) => (
                              <button key={k} type="button" className="reason" aria-pressed={reason === k} onClick={() => setReason(k)}>
                                <b>{l}</b><span>{d}</span>
                              </button>
                            ))}
                          </div>
                          <div className="g2">
                            <F label="סיבת הבקשה" req wide hint="ספרו בקצרה מה המצב ולמה נדרש הסיוע."><textarea className="inp" maxLength={3000} value={story} onChange={e => setStory(e.target.value)} /></F>
                            <F label="סכום מבוקש" req hint="ההחלטה הסופית נקבעת בבדיקה."><input className="inp ltr" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} /></F>
                            <F label="רב או ממליץ (לא חובה)"><input className="inp" value={referrer} onChange={e => setReferrer(e.target.value)} /></F>
                          </div>
                          <div className="sect">מסמכים</div>
                          <p className="sub">תמונה או PDF, עד 10MB לקובץ. אפשר לצלם ישר מהטלפון.</p>
                          <div className="docs">
                            {[...docs, EXTRA_DOC].map(d => {
                              const f = files[d]
                              const extra = d === EXTRA_DOC
                              return (
                                <div key={d} className={`doc${f ? ' up' : ''}`} style={extra && !f ? { borderStyle: 'dashed' } : undefined}>
                                  <AidIcon name={f ? 'check' : 'file'} />
                                  <div className="dt">
                                    <b>{extra ? 'מסמך נוסף (לא חובה)' : d}</b>
                                    {f ? <span className="fn">{f.name} · הועלה</span> : !extra && !isOptionalDoc(d) && <small>חובה</small>}
                                  </div>
                                  <label className="upbtn" style={{ cursor: 'pointer' }}>
                                    {f ? 'החלפה' : 'העלאה'}
                                    <input type="file" accept={ACCEPT} hidden onChange={e => { pickFile(d, e.target.files?.[0]); e.target.value = '' }} />
                                  </label>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}

                      {step === 2 && (
                        <>
                          <h2>הצהרת הכנסות</h2>
                          <p className="sub">רמת ההכנסות וההוצאות של הבית, בכל חודש, בשקלים. אם אין, כתבו 0.</p>
                          <div className="g2">
                            <F label="עיסוק הבעל"><input className="inp" placeholder="למשל: אברך, מלמד" value={inc.husbandJob} onChange={setI('husbandJob')} /></F>
                            <F label="הכנסת הבעל"><input className="inp ltr" inputMode="numeric" value={inc.husband} onChange={setI('husband')} /></F>
                            <F label="עיסוק האישה"><input className="inp" value={inc.wifeJob} onChange={setI('wifeJob')} /></F>
                            <F label="הכנסת האישה"><input className="inp ltr" inputMode="numeric" value={inc.wife} onChange={setI('wife')} /></F>
                            <F label="קצבאות" hint="ילדים, נכות, הבטחת הכנסה"><input className="inp ltr" inputMode="numeric" value={inc.benefits} onChange={setI('benefits')} /></F>
                            <F label="הכנסה אחרת"><input className="inp ltr" inputMode="numeric" value={inc.other} onChange={setI('other')} /></F>
                          </div>
                          <div className="sect">הוצאות קבועות</div>
                          <div className="g2">
                            <F label="שכר דירה או משכנתא"><input className="inp ltr" inputMode="numeric" value={inc.rent} onChange={setI('rent')} /></F>
                            <F label="חובות פתוחים"><input className="inp ltr" inputMode="numeric" value={inc.debts} onChange={setI('debts')} /></F>
                          </div>
                        </>
                      )}

                      {step === 3 && (
                        <>
                          <h2>בדיקה ושליחה</h2>
                          <p className="sub">עוד מבט אחד, מאשרים, חותמים ושולחים.</p>
                          <div className="sumlist">
                            <div><span>מגיש</span><b>{`${me.first} ${me.last}`.trim()}</b></div>
                            <div><span>סוג התמיכה</span><b>{reasonLabel}</b></div>
                            <div><span>ילדים</span><b>{kidCount}</b></div>
                            <div><span>סכום מבוקש</span><b>{num(amount).toLocaleString('en-US')} ₪</b></div>
                            <div><span>מסמכים</span><b>{Object.keys(files).filter(k => [...docs, EXTRA_DOC].includes(k)).length}</b></div>
                            <div><span>תשובה תישלח אל</span><b className="ltr">{me.email}</b></div>
                          </div>
                          <label className="decl">
                            <input type="checkbox" checked={decl} onChange={e => (e.target.checked ? setPrivacy(true) : setDecl(false))} />
                            <span>אני מצהיר שכל הפרטים נכונים, ומסכים שהפרטים יישמרו במאגר האיגוד וייבדקו לצורך הטיפול בבקשה.</span>
                          </label>
                          <div className="sect req">חתימה</div>
                          <p className="sub" style={{ marginBottom: 'var(--s3)' }}>חתמו באצבע או בעכבר בתוך המסגרת.</p>
                          <SignPad canvasRef={sigRef} onInk={setSigned} />
                        </>
                      )}

                      {error && <p role="alert" className="ferr" style={{ marginTop: 'var(--s4)', fontSize: 'var(--t-sm)' }}>{error}</p>}

                      <div className="nav">
                        <button type="button" className="btn" onClick={() => (step === 0 ? (registered ? undefined : setGate('ask')) : go(step - 1))} disabled={step === 0 && registered}>חזרה</button>
                        {step < STEPS.length - 1
                          ? <button type="button" className="btn pri lg" onClick={() => go(step + 1)}>המשך</button>
                          : <button type="button" className="btn pri lg" disabled={busy} onClick={submit}>{busy ? 'שולח...' : 'שליחת הבקשה'}</button>}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <aside className="aside">
                <div className="box">
                  <h3>מה להכין מראש</h3>
                  <ul>
                    {docs.map(d => <li key={d}><AidIcon name="check" size={14} />{d}</li>)}
                  </ul>
                </div>
                <div className="box help-box">
                  <h3>שאלה על הטופס?</h3>
                  <p className="help" style={{ margin: 0 }}>אפשר לפנות למשרד מחלקת הסיוע, ונשמח לעזור.</p>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>

      {privacy && (
        <Modal title="שמירת הפרטים ופרטיות" onClose={() => setPrivacy(false)}>
          <p>הפרטים והמסמכים שמסרתם יישמרו במאגר המידע הפרטי של איגוד צאצאי החתם סופר, בהתאם לחוק הגנת הפרטיות, התשמ&quot;א-1981.</p>
          <p>הם ישמשו רק לבדיקת הבקשה ולטיפול בה, ולא יימסרו לאחרים בלי הסכמתכם, אלא אם הדין מחייב זאת. אפשר לפנות למשרד כדי לעיין בפרטים או לתקן אותם.</p>
          <div className="modal-a">
            <button type="button" className="btn pri lg" onClick={() => { setDecl(true); setPrivacy(false); setError('') }}>אישור</button>
            <button type="button" className="btn" onClick={() => setPrivacy(false)}>ביטול</button>
          </div>
        </Modal>
      )}

      {done && thanksOpen && (
        <Modal title="הבקשה נשלחה" onClose={() => setThanksOpen(false)}>
          {done.no != null && <p className="modal-no">מספר בקשה: <b>{done.no}</b></p>}
          <p>{RECEIVED}</p>
          <div className="modal-a">
            <button type="button" className="btn pri lg" onClick={() => setThanksOpen(false)}>סגירה</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
