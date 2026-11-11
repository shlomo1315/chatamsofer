'use client'

import { useMemo, useState } from 'react'
import AidIcon from '@/components/admin/AidIcon'
import CityStreetPicker from '@/components/ui/CityStreetPicker'
import { REASONS, NEED, KID_STATUSES, isOptionalDoc, type AidReason, type FamilyKid, type KidStatus } from '@/lib/aidDepartmentV2'
import { MARITAL_STATUSES, MEDICAL_FILE_TYPES, MEDICAL_MAX_FILE } from '@/lib/medicalRequest'

// טופס בקשת סיוע בשישה שלבים, לפי העיצוב המאושר (mockup-aid-department).
// צאצא מחובר מקבל את הפרטים האישיים מהכרטיס; מי שהגיע מהקישור ממלא הכול.

export interface AidPrefill {
  first: string; last: string; id: string; birth: string
  phone: string; phone2: string; email: string; marital: string
  address: string; city: string
  wife: { name: string; id: string; birth: string; phone: string }
}

const STEPS = ['פרטים אישיים', 'משפחה', 'הכנסות', 'סיבת הבקשה', 'מסמכים', 'שליחה']
const EXTRA_DOC = 'מסמך נוסף'
const EMPTY_KID: FamilyKid = { name: '', id: '', birth: '', status: 'בבית' }
const ACCEPT = Object.keys(MEDICAL_FILE_TYPES).map(e => `.${e}`).join(',')
const digits = (v: string) => v.replace(/\D/g, '')
const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, '')) || 0)

function F({ label, req, hint, children, wide }: { label: string; req?: boolean; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="field" style={wide ? { gridColumn: '1/-1' } : undefined}>
      <label className={req ? 'req' : undefined}>{label}</label>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  )
}

export default function AidWizard({ who, prefill }: { who?: string; prefill?: AidPrefill }) {
  const registered = !!prefill
  const p = prefill
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ no: number | null } | null>(null)
  const [decl, setDecl] = useState(false)

  const [me, setMe] = useState({
    first: p?.first ?? '', last: p?.last ?? '', id: p?.id ?? '', birth: p?.birth ?? '',
    phone: p?.phone ?? '', phone2: p?.phone2 ?? '', email: p?.email ?? '',
    marital: p?.marital ?? '', address: p?.address ?? '', city: p?.city ?? '', relation: '',
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
  const setM = (k: keyof typeof me) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setMe(s => ({ ...s, [k]: e.target.value }))
  const setW = (k: keyof typeof wife) => (e: React.ChangeEvent<HTMLInputElement>) => setWife(s => ({ ...s, [k]: e.target.value }))
  const setI = (k: keyof typeof inc) => (e: React.ChangeEvent<HTMLInputElement>) => setInc(s => ({ ...s, [k]: e.target.value }))
  const setKid = (i: number, k: keyof FamilyKid, v: string) => setKids(ks => ks.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const kidCount = kids.filter(k => k.name.trim()).length
  const maritals = me.marital && !MARITAL_STATUSES.includes(me.marital) ? [me.marital, ...MARITAL_STATUSES] : MARITAL_STATUSES

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
      if (!registered) {
        if (!me.first.trim() || !me.last.trim()) return 'יש למלא שם פרטי ושם משפחה.'
        if (digits(me.id).length < 5) return 'יש להזין מספר תעודת זהות.'
        if (!me.birth) return 'יש להזין תאריך לידה.'
        if (!me.city.trim() || !me.address.trim()) return 'יש לבחור עיר ולמלא כתובת.'
      }
      if (!/^[\d\-+ ]{7,15}$/.test(me.phone.trim())) return 'יש להזין מספר טלפון נייד תקין.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(me.email.trim())) return 'יש להזין כתובת מייל תקינה. לשם תישלח התשובה.'
      if (!me.marital) return 'יש לבחור מצב משפחתי.'
    }
    if (s === 3) {
      if (!story.trim()) return 'יש לספר בקצרה על הבקשה.'
      if (!(num(amount) > 0)) return 'יש להזין את הסכום המבוקש.'
    }
    if (s === 4) {
      const missing = docs.filter(d => !isOptionalDoc(d) && !files[d])
      if (missing.length) return `חסר: ${missing.join(', ')}.`
    }
    if (s === 5 && !decl) return 'יש לאשר את ההצהרה.'
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
    for (let s = 0; s <= 5; s++) {
      const e = check(s)
      if (e) { setStep(s); setError(e); return }
    }
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
    put('spouse_name', wife.name.trim())
    put('spouse_id_number', digits(wife.id))
    put('relation', me.relation.trim())
    put('referrer', referrer.trim())
    put('aid_type', reason)
    put('reason', story.trim())
    put('amount', String(num(amount)))
    put('family', JSON.stringify({ wife: wife.name.trim() ? wife : null, kids: kids.filter(k => k.name.trim()) }))
    put('income', JSON.stringify({
      husbandJob: inc.husbandJob, husband: num(inc.husband), wifeJob: inc.wifeJob, wife: num(inc.wife),
      benefits: num(inc.benefits), other: num(inc.other), rent: num(inc.rent), debts: num(inc.debts),
    }))
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
      window.scrollTo({ top: 0 })
    } catch {
      setError('אין חיבור לשרת. נסו שוב.')
    } finally {
      setBusy(false)
    }
  }

  const lock = registered ? { readOnly: true } : {}
  const reasonLabel = REASONS.find(r => r[0] === reason)?.[1] ?? ''

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
            <span>{registered ? `מחובר: ${who ?? ''} · צאצא רשום` : 'קישור להגשת בקשה'}</span>
          </div>
        </div>
      </header>

      <main className="pub">
        {done ? (
          <div className="formcard thanks">
            {done.no != null && <div className="big">{done.no}</div>}
            <h2>הבקשה התקבלה.</h2>
            <p className="sub" style={{ margin: 0 }}>
              {done.no != null ? 'זה מספר הבקשה שלך. ' : ''}התשובה תישלח למייל <b className="ltr">{me.email}</b> אחרי שהבקשה תיבדק.
            </p>
          </div>
        ) : (
          <>
            <h1>בקשת סיוע<em>.</em></h1>
            <p className="lead">ממלאים פעם אחת, ומצרפים את המסמכים. הבקשה מגיעה למזכירות המחלקה, והתשובה תישלח אליכם במייל.</p>
            <div className="entry">
              <span className="entry-note">
                <AidIcon name={registered ? 'lock' : 'check'} />
                {registered ? 'הפרטים האישיים מולאו מהכרטיס שלך באיגוד. אפשר לתקן.' : 'אין צורך בהרשמה או בסיסמה. ממלאים ושולחים.'}
              </span>
            </div>

            <div className="pub-grid">
              <div>
                <div className="steps">
                  {STEPS.map((s, i) => (
                    <button key={s} type="button" className={i === step ? 'cur' : i < step ? 'done' : undefined}
                      disabled={i > reached} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}>
                      <span className="n">{i < step ? <AidIcon name="check" size={12} /> : i + 1}</span>{s}
                    </button>
                  ))}
                </div>

                <div className="formcard">
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', clipPath: 'inset(50%)', pointerEvents: 'none' }} />

                  {step === 0 && (
                    <>
                      <h2>פרטים אישיים</h2>
                      <p className="sub">{registered ? 'בדקו שהפרטים נכונים, והשלימו מה שחסר.' : 'הפרטים של מגיש הבקשה.'}</p>
                      {registered && <div className="lockhint"><AidIcon name="lock" />נמשך מכרטיס הצאצא שלך</div>}
                      <div className={`g2${registered ? ' locked' : ''}`} style={{ marginBottom: 'var(--s4)' }}>
                        <F label="שם פרטי" req={!registered}><input className="inp" value={me.first} onChange={setM('first')} {...lock} /></F>
                        <F label="שם משפחה" req={!registered}><input className="inp" value={me.last} onChange={setM('last')} {...lock} /></F>
                        <F label="תעודת זהות" req={!registered}><input className="inp ltr" inputMode="numeric" value={me.id} onChange={setM('id')} {...lock} /></F>
                        <F label="תאריך לידה" req={!registered}><input className="inp" type="date" value={me.birth} onChange={setM('birth')} {...lock} /></F>
                      </div>
                      <div className="g2">
                        <F label="טלפון נייד" req><input className="inp ltr" type="tel" value={me.phone} onChange={setM('phone')} /></F>
                        <F label="טלפון נוסף (לא חובה)"><input className="inp ltr" type="tel" value={me.phone2} onChange={setM('phone2')} /></F>
                        <F label="מייל" req hint="לכאן נשלח את התשובה לבקשה."><input className="inp ltr" type="email" value={me.email} onChange={setM('email')} /></F>
                        <F label="מצב משפחתי" req>
                          <select className="inp" value={me.marital} onChange={setM('marital')}>
                            <option value="">בחירה</option>
                            {maritals.map(m => <option key={m}>{m}</option>)}
                          </select>
                        </F>
                        {registered ? (
                          <>
                            <F label="כתובת"><input className="inp" value={me.address} onChange={setM('address')} /></F>
                            <F label="עיר"><input className="inp" value={me.city} onChange={setM('city')} /></F>
                          </>
                        ) : (
                          <F label="כתובת ועיר" req wide>
                            <CityStreetPicker city={me.city} address={me.address} cityRequired addressRequired
                              onCityChange={v => setMe(s => ({ ...s, city: v }))} onAddressChange={v => setMe(s => ({ ...s, address: v }))} />
                          </F>
                        )}
                        {!registered && (
                          <F label="הקשר למשפחת החתם סופר (לא חובה)" wide><input className="inp" value={me.relation} onChange={setM('relation')} /></F>
                        )}
                      </div>
                    </>
                  )}

                  {step === 1 && (
                    <>
                      <h2>משפחה</h2>
                      <p className="sub">מי גר בבית. אפשר לדלג על מה שלא רלוונטי.</p>
                      <div className="sect">האישה</div>
                      <div className="g2">
                        <F label="שם מלא"><input className="inp" value={wife.name} onChange={setW('name')} /></F>
                        <F label="תעודת זהות"><input className="inp ltr" inputMode="numeric" value={wife.id} onChange={setW('id')} /></F>
                        <F label="תאריך לידה"><input className="inp" type="date" value={wife.birth} onChange={setW('birth')} /></F>
                        <F label="טלפון"><input className="inp ltr" type="tel" value={wife.phone} onChange={setW('phone')} /></F>
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

                  {step === 2 && (
                    <>
                      <h2>הכנסות</h2>
                      <p className="sub">סכומים בחודש, בשקלים. אם אין, כתבו 0.</p>
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
                      <h2>סיבת הבקשה</h2>
                      <p className="sub">בחרו את הסיבה. רשימת המסמכים תתאים את עצמה.</p>
                      <div className="reasons" style={{ marginBottom: 'var(--s5)' }}>
                        {REASONS.map(([k, l, d]) => (
                          <button key={k} type="button" className="reason" aria-pressed={reason === k} onClick={() => setReason(k)}>
                            <b>{l}</b><span>{d}</span>
                          </button>
                        ))}
                      </div>
                      <div className="g2">
                        <F label="ספרו בקצרה" req wide><textarea className="inp" maxLength={3000} value={story} onChange={e => setStory(e.target.value)} /></F>
                        <F label="סכום מבוקש" req hint="ההחלטה הסופית נקבעת בבדיקה."><input className="inp ltr" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} /></F>
                        <F label="רב או ממליץ (לא חובה)"><input className="inp" value={referrer} onChange={e => setReferrer(e.target.value)} /></F>
                      </div>
                    </>
                  )}

                  {step === 4 && (
                    <>
                      <h2>מסמכים</h2>
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

                  {step === 5 && (
                    <>
                      <h2>בדיקה ושליחה</h2>
                      <p className="sub">עוד מבט אחד, ושולחים.</p>
                      <div className="sumlist">
                        <div><span>מגיש</span><b>{`${me.first} ${me.last}`.trim()}</b></div>
                        <div><span>סיבה</span><b>{reasonLabel}</b></div>
                        <div><span>ילדים</span><b>{kidCount}</b></div>
                        <div><span>סכום מבוקש</span><b>{num(amount).toLocaleString('en-US')} ₪</b></div>
                        <div><span>מסמכים</span><b>{Object.keys(files).filter(k => [...docs, EXTRA_DOC].includes(k)).length}</b></div>
                        <div><span>תשובה תישלח אל</span><b className="ltr">{me.email}</b></div>
                      </div>
                      <label className="decl">
                        <input type="checkbox" checked={decl} onChange={e => setDecl(e.target.checked)} />
                        <span>אני מצהיר שכל הפרטים נכונים, ומסכים שהמחלקה תבדוק אותם לצורך הטיפול בבקשה.</span>
                      </label>
                    </>
                  )}

                  {error && <p role="alert" style={{ color: 'var(--no)', fontWeight: 700, marginTop: 'var(--s4)' }}>{error}</p>}

                  <div className="nav">
                    <button type="button" className="btn" disabled={step === 0} onClick={() => go(step - 1)}>חזרה</button>
                    {step < 5
                      ? <button type="button" className="btn pri lg" onClick={() => go(step + 1)}>המשך</button>
                      : <button type="button" className="btn pri lg" disabled={busy} onClick={submit}>{busy ? 'שולח...' : 'שליחת הבקשה'}</button>}
                  </div>
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
    </div>
  )
}
