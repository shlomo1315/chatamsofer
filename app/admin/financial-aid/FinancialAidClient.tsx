'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AidIcon from '@/components/admin/AidIcon'
import {
  ST, STH, ST_ORDER, REASONS, REASON_LABEL, NEED, isOptionalDoc, displayStatus, parseManagerReply,
  asFamily, asIncome, totalIncome, souls, perCapita, ageFrom, fmtMoney, fmtDate, fmtShort, fmtDateTime,
  sourceLabel, findPrevious, prevText, aidPersonName,
  type AidRowForMail, type AidReason, type DisplayStatus,
} from '@/lib/aidDepartmentV2'

export type AidRow = AidRowForMail & {
  status: string
  request_no?: number | null
  amount?: number | null
  decision_reply?: string | null
  decision_replied_at?: string | null
  sent_to_decision_at?: string | null
  reminder_sent_at?: string | null
  final_message_sent_at?: string | null
  decision_note?: string | null
  applicant_phone?: string | null
  applicant_email?: string | null
  beneficiary?: (NonNullable<AidRowForMail['beneficiary']> & { phone?: string | null; email?: string | null; marital_status?: string | null }) | null
  documents?: { label?: string | null; kind?: string | null; file_url?: string | null; file_name?: string | null }[]
}

type Src = 'registered' | 'link' | 'prev'

const post = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'הפעולה נכשלה')
  return d
}

const Pill = ({ st }: { st: DisplayStatus }) => <span className={`pill st-${st}`}>{ST[st]}</span>
const PrevTag = ({ text }: { text: string | null }) => text
  ? <span className="prev" title={text}><AidIcon name="hist" size={12} />הגיש בעבר</span>
  : null

const no = (r: AidRow) => r.request_no ?? '—'

// שורת משנה בטבלה: מה צריך לדעת על הבקשה במבט אחד
function subLine(r: AidRow, st: DisplayStatus) {
  if (st === 'back') return `תשובה התקבלה ${fmtDateTime(r.decision_replied_at)}`
  if (st === 'approved' && r.amount) return `אושר ${fmtMoney(r.amount)}`
  if (st === 'inquiry') return 'חסר מסמך או פרט'
  return ''
}

export default function FinancialAidClient({ requests }: { requests: AidRow[] }) {
  const router = useRouter()
  const [fil, setFil] = useState<DisplayStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const [reason, setReason] = useState<AidReason | ''>('')
  const [src, setSrc] = useState<Src | null>(null)
  const [cur, setCur] = useState<string | null>(null)
  const [mgrEmail, setMgrEmail] = useState('')
  const [editMgr, setEditMgr] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/admin/financial-aid/decision-email').then(r => r.json()).then(d => setMgrEmail(d.email ?? '')).catch(() => {})
    // תשובות המנהל נקלטות בשקט בכניסה למסך; ההחלטה עצמה נשמרת רק בלחיצה
    fetch('/api/admin/financial-aid/check-replies', { method: 'POST' })
      .then(r => r.json()).then(d => { if (d.updated > 0) router.refresh() }).catch(() => {})
  }, [router])

  const prevOf = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const r of requests) { const p = findPrevious(r, requests); m.set(r.id, p ? prevText(p) : null) }
    return m
  }, [requests])

  const counts = useMemo(() => {
    const c = Object.fromEntries(ST_ORDER.map(k => [k, 0])) as Record<DisplayStatus, number>
    for (const r of requests) c[displayStatus(r)]++
    return c
  }, [requests])

  const list = useMemo(() => {
    const needle = q.trim()
    const digits = needle.replace(/\D/g, '')
    return requests.filter(r => {
      if (fil !== 'all' && displayStatus(r) !== fil) return false
      if (reason && r.aid_type !== reason) return false
      if (src === 'registered' && !r.beneficiary_id) return false
      if (src === 'link' && r.beneficiary_id) return false
      if (src === 'prev' && !prevOf.get(r.id)) return false
      if (!needle) return true
      if (aidPersonName(r).includes(needle)) return true
      if (digits && String(r.request_no ?? '').includes(digits)) return true
      const idn = String(r.beneficiary?.id_number || r.applicant_id_number || '')
      return !!digits && digits.length >= 4 && idn.includes(digits)
    })
  }, [requests, fil, reason, src, q, prevOf])

  const open = requests.find(r => r.id === cur) ?? null

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${location.origin}/medical/new`).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }

  return (
    <>
      <div className="ph">
        <div><h1>מחלקת סיוע</h1><p>בקשות סיוע מצאצאים רשומים ומפונים מהקישור</p></div>
        <div className="acts">
          <button className="btn" onClick={copyLink}><AidIcon name="link" />{copied ? 'הקישור הועתק' : 'העתק קישור להגשה'}</button>
          <a className="btn" href="/api/admin/export?type=financial_aid"><AidIcon name="dl" />ייצוא לאקסל</a>
        </div>
      </div>

      {/* "משפחות נתמכות" הוסתר: הכול מנוהל כאן, באגף הסיוע */}
      <nav className="tabs">
        <a className="on" aria-current="page">בקשות</a>
        <Link href="/admin/distributions">תמיכה חודשית</Link>
        <Link href="/admin/reports">דוחות</Link>
        <button onClick={() => setEditMgr(true)}>הגדרות</button>
      </nav>
      <div className="mgrline">
        <AidIcon name="mail" />
        {mgrEmail
          ? <>בקשות שמועברות לאישור נשלחות אל <span className="ltr">{mgrEmail}</span> · </>
          : <>עוד לא הוגדר מייל המנהל · </>}
        <button onClick={() => setEditMgr(true)}>שינוי בהגדרות</button>
      </div>

      <div className="counters">
        {ST_ORDER.map(k => (
          <button key={k} className={`ctr st-${k} ${k === 'back' ? 'hot' : ''}`} style={k === 'back' ? undefined : { background: 'var(--card)' }}
            aria-pressed={fil === k} onClick={() => setFil(fil === k ? 'all' : k)}>
            <span className="lbl">{ST[k]}</span><span className="v">{counts[k]}</span><span className="h">{STH[k]}</span>
          </button>
        ))}
      </div>

      <div className="bar">
        <div className="search"><AidIcon name="search" /><input className="inp" placeholder="שם, תעודת זהות או מספר בקשה" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="chip" aria-label="סיבה" value={reason} onChange={e => setReason(e.target.value as AidReason | '')}>
          <option value="">כל הסיבות</option>
          {REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {([['registered', 'צאצא רשום'], ['link', 'מהקישור'], ['prev', 'הגיש בעבר']] as [Src, string][]).map(([k, l]) => (
          <button key={k} className="chip" aria-pressed={src === k} onClick={() => setSrc(src === k ? null : k)}>{l}</button>
        ))}
      </div>

      <div className="tablewrap">
        <table className="t">
          <thead><tr><th>מס׳</th><th>שם</th><th>סיבה</th><th>מקור</th><th>הוגשה</th><th>סכום מבוקש</th><th>סטטוס</th></tr></thead>
          <tbody>
            {list.map(r => {
              const st = displayStatus(r)
              return (
                <tr key={r.id} className={r.id === cur ? 'sel' : ''} onClick={() => setCur(r.id)} style={{ cursor: 'pointer' }}>
                  <td className="id">{no(r)}</td>
                  <td className="nm"><b>{aidPersonName(r) || 'ללא שם'} <PrevTag text={prevOf.get(r.id) ?? null} /></b><small>{subLine(r, st)}</small></td>
                  <td>{REASON_LABEL[r.aid_type ?? ''] ?? 'סיוע'}</td>
                  <td>{sourceLabel(r)}</td>
                  <td className="num">{fmtShort(r.created_at)}</td>
                  <td className="amt">{r.requested_amount ? fmtMoney(r.requested_amount) : '—'}</td>
                  <td><Pill st={st} /></td>
                </tr>
              )
            })}
            {list.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--faint)', padding: 32 }}>אין בקשות להצגה</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mlist">
        {list.map(r => {
          const st = displayStatus(r)
          return (
            <button key={r.id} className={`qi ${r.id === cur ? 'sel' : ''}`} onClick={() => setCur(r.id)}>
              <b>{aidPersonName(r) || 'ללא שם'}</b>
              <span className="amt">{r.requested_amount ? fmtMoney(r.requested_amount) : ''}</span>
              <span className="meta"><Pill st={st} /><span>{REASON_LABEL[r.aid_type ?? ''] ?? 'סיוע'}</span><span>·</span><span className="num">{fmtShort(r.created_at)}</span><PrevTag text={prevOf.get(r.id) ?? null} /></span>
              {st === 'back' && <span className="snip">המנהל: &quot;{r.decision_reply}&quot;</span>}
            </button>
          )
        })}
      </div>

      {open && <Card key={open.id} r={open} prev={prevOf.get(open.id) ?? null} onClose={() => setCur(null)} onDone={() => router.refresh()} />}
      {editMgr && <ManagerEmail value={mgrEmail} onClose={() => setEditMgr(false)} onSaved={v => { setMgrEmail(v); setEditMgr(false) }} />}
    </>
  )
}

// חלון במרכז המסך עם טשטוש מאחור; נסגר בלחיצה בחוץ או ב-Escape
function Modal({ label, onClose, width, children }: { label: string; onClose: () => void; width?: number; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <>
      <div className="scrim" onClick={onClose} style={width ? { zIndex: 40 } : undefined} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label} style={width ? { width: `min(${width}px, calc(100% - 24px))`, zIndex: 41 } : undefined}>
        {children}
      </aside>
    </>
  )
}

function ManagerEmail({ value, onClose, onSaved }: { value: string; onClose: () => void; onSaved: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true); setErr('')
    try { await post('/api/admin/financial-aid/decision-email', { email: v }); onSaved(v.trim()) } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  return (
    <Modal label="מייל המנהל" onClose={onClose} width={460}>
      <div className="card-h">
        <div className="top"><b>הגדרות</b><button className="x" aria-label="סגירה" onClick={onClose}><AidIcon name="x" /></button></div>
        <h2>מייל המנהל</h2>
      </div>
      <div className="card-b">
        <div className="field" style={{ marginBottom: 12 }}>
          <label>בקשות שמועברות לאישור יישלחו לכתובת</label>
          <input className="inp ltr" dir="ltr" type="email" value={v} onChange={e => setV(e.target.value)} />
        </div>
        {err && <p className="note" style={{ color: 'var(--no)' }}>{err}</p>}
        <div className="act" style={{ border: 0, padding: 0 }}><div className="row">
          <button className="btn pri" disabled={busy} onClick={save}>{busy ? 'שומר…' : 'שמירה'}</button>
          <button className="btn" onClick={onClose}>ביטול</button>
        </div></div>
      </div>
    </Modal>
  )
}

function MailPreview({ mail, onClose }: { mail: { subject: string; html: string }; onClose: () => void }) {
  return (
    <Modal label="תצוגת מייל" onClose={onClose} width={720}>
      <div className="card-h">
        <div className="top"><b>תצוגת המייל</b><button className="x" aria-label="סגירה" onClick={onClose}><AidIcon name="x" /></button></div>
        <h2 style={{ fontSize: 18 }}>{mail.subject}</h2>
      </div>
      <div className="card-b" style={{ padding: 0 }}>
        <iframe title="תצוגת המייל" srcDoc={mail.html} sandbox="" style={{ width: '100%', height: '65vh', border: 0, background: '#fff' }} />
      </div>
    </Modal>
  )
}

function Card({ r, prev, onClose, onDone }: { r: AidRow; prev: string | null; onClose: () => void; onDone: () => void }) {
  const router = useRouter()
  const st = displayStatus(r)
  const guess = parseManagerReply(r.decision_reply)
  const [choice, setChoice] = useState<'approved' | 'rejected' | null>(guess.decision)
  const [amount, setAmount] = useState(guess.amount ? String(guess.amount) : r.requested_amount ? String(r.requested_amount) : '')
  const [note, setNote] = useState('')
  const [notes, setNotes] = useState(r.notes ?? '')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [mail, setMail] = useState<{ subject: string; html: string } | null>(null)

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setErr('')
    try { await fn() } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }
  const decisionBody = () => ({ id: r.id, status: choice, amount: choice === 'approved' ? Number(amount.replace(/\D/g, '')) : null, note })
  const validDecision = () => {
    if (!choice) throw new Error('בחרו מאושר או לא מאושר')
    if (choice === 'approved' && !(Number(amount.replace(/\D/g, '')) > 0)) throw new Error('הזינו את הסכום שאושר')
  }

  const b = r.beneficiary
  const fam = asFamily(r.family)
  const inc = asIncome(r.income)
  const det = (r.applicant_details ?? {}) as Record<string, unknown>
  const kids = fam?.kids ?? []
  const docs = r.documents ?? []
  const have = new Set(docs.map(d => d.label).filter(Boolean))
  const missing = have.size && r.aid_type && r.aid_type in NEED
    ? NEED[r.aid_type as AidReason].filter(l => !isOptionalDoc(l) && !have.has(l))
    : []
  const fromLink = !r.beneficiary_id

  const personal: [string, string | null | undefined, string?][] = [
    ['תעודת זהות', b?.id_number || r.applicant_id_number, 'num'],
    ['תאריך לידה', fmtDate(b?.birth_date || r.applicant_birth_date || String(det.birth_date ?? '')), 'num'],
    ['טלפון', b?.phone || r.applicant_phone, 'ltr'],
    ['מייל', b?.email || r.applicant_email, 'ltr'],
    ['מצב משפחתי', b?.marital_status || String(det.marital_status ?? '')],
    ['כתובת', [b?.address ?? r.applicant_address, b?.city ?? r.applicant_city].filter(Boolean).join(', ')],
  ]
  const incRows: [string, number][] = inc ? ([
    [['הבעל', inc.husbandJob].filter(Boolean).join(' · '), inc.husband],
    [['האישה', inc.wifeJob].filter(Boolean).join(' · '), inc.wife],
    ['קצבאות', inc.benefits],
    ['הכנסה אחרת', inc.other],
    ['שכר דירה', -inc.rent],
    ['חובות פתוחים', -inc.debts],
  ] as [string, number][]).filter(([, v]) => v) : []
  const money = (n: number) => (n < 0 ? `−${fmtMoney(-n)}` : fmtMoney(n))

  const timeline: [string | null | undefined, string][] = [
    [r.created_at, r.source === 'office' ? 'נוספה במשרד' : fromLink ? 'הוגשה מהקישור הייחודי' : 'הוגשה מהאזור האישי'],
    [r.sent_to_decision_at, 'הועברה לאישור המנהל'],
    [r.reminder_sent_at, 'נשלחה תזכורת למנהל'],
    [r.decision_replied_at, 'תשובת המנהל התקבלה במייל'],
    [r.final_message_sent_at, 'נשלח מייל למגיש'],
  ]

  let action: React.ReactNode
  if (st === 'back') {
    action = (
      <div className="act" style={{ borderColor: '#EBC3A6' }}>
        <h4><AidIcon name="back" style={{ color: 'var(--back)' }} />חזר מהמנהל · עדכנו את הסטטוס</h4>
        <div className="letter"><div className="from"><span>תשובת המנהל במייל</span><span className="num">{fmtDateTime(r.decision_replied_at)}</span></div><q>{r.decision_reply}</q></div>
        <p className="guess">
          המערכת זיהתה: {guess.decision === 'approved'
            ? <b style={{ color: 'var(--ok)' }}>מאושר{guess.amount ? ` · ${fmtMoney(guess.amount)}` : ''}</b>
            : guess.decision === 'rejected' ? <b style={{ color: 'var(--no)' }}>לא מאושר</b> : <b>לא ברור, בחרו ידנית</b>}. ההחלטה נשמרת רק כשתלחצו.
        </p>
        <div className="decide">
          <button className="opt ok" aria-pressed={choice === 'approved'} onClick={() => setChoice('approved')}><AidIcon name="check" />מאושר</button>
          <button className="opt no" aria-pressed={choice === 'rejected'} onClick={() => setChoice('rejected')}><AidIcon name="x" />לא מאושר</button>
        </div>
        {choice === 'approved' ? (
          <div className="amtrow">
            <div className="field"><label>סכום שאושר</label><input className="inp num" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} /></div>
            <div className="field"><label>הערה למגיש (תופיע במייל)</label><input className="inp" value={note} onChange={e => setNote(e.target.value)} placeholder="למשל: הסכום יועבר בשני תשלומים" /></div>
          </div>
        ) : choice === 'rejected' ? (
          <div className="field" style={{ marginBottom: 12 }}><label>הערה למגיש (תופיע במייל)</label><input className="inp" value={note} onChange={e => setNote(e.target.value)} placeholder="למשל: אם יחול שינוי במצב, אפשר להגיש בקשה חדשה." /></div>
        ) : null}
        <div className="row">
          <button className="btn pri lg" disabled={!!busy} onClick={() => run('save', async () => { validDecision(); await post('/api/admin/financial-aid/decide', decisionBody()); onDone() })}>
            <AidIcon name="send" />{busy === 'save' ? 'שומר ושולח…' : 'שמור ושלח מייל למגיש'}
          </button>
          <button className="btn" disabled={!!busy} onClick={() => run('pv', async () => { validDecision(); setMail(await post('/api/admin/financial-aid/decide', { ...decisionBody(), preview: true })) })}>תצוגה מקדימה של המייל</button>
        </div>
      </div>
    )
  } else if (st === 'pending' || st === 'inquiry') {
    action = (
      <div className="act">
        <h4>מה עושים עם הבקשה?</h4>
        <div className="row">
          <button className="btn gold lg" disabled={!!busy} onClick={() => run('send', async () => { await post('/api/admin/financial-aid/send', { id: r.id }); onDone() })}>
            <AidIcon name="send" />{busy === 'send' ? 'שולח…' : 'העבר לאישור המנהל'}
          </button>
          <button className="btn lg" disabled={!!busy} onClick={() => run('inq', async () => {
            if (r.status !== 'inquiry') await post('/api/admin/financial-aid/decide', { id: r.id, status: 'inquiry' })
            router.push(`/admin/financial-aid/${r.id}`)
          })}>בקש השלמת מסמכים</button>
        </div>
        <p className="note"><AidIcon name="mail" />המנהל יקבל מייל מתומצת עם כל פרטי הבקשה והמסמכים.</p>
      </div>
    )
  } else if (st === 'manager') {
    action = (
      <div className="act">
        <h4><AidIcon name="mail" style={{ color: 'var(--mgr)' }} />נשלח למנהל{r.sent_to_decision_at ? ` ב-${fmtDateTime(r.sent_to_decision_at)}` : ''} · ממתין לתשובה</h4>
        <div className="row">
          <button className="btn" disabled={!!busy} onClick={() => run('rem', async () => { await post('/api/admin/financial-aid/send', { id: r.id, remind: true }); onDone() })}>
            {busy === 'rem' ? 'שולח…' : r.reminder_sent_at ? `שלח תזכורת נוספת (נשלחה ${fmtShort(r.reminder_sent_at)})` : 'שלח תזכורת למנהל'}
          </button>
          <button className="btn" disabled={!!busy} onClick={() => run('mv', async () => { setMail(await post('/api/admin/financial-aid/send', { id: r.id, preview: true })) })}>הצג את המייל שנשלח</button>
        </div>
      </div>
    )
  } else {
    action = (
      <div className="act">
        <h4><Pill st={st} /> {st === 'approved' && r.amount ? `אושר ${fmtMoney(r.amount)}` : ''}</h4>
        <p className="note" style={{ margin: 0 }}>
          <AidIcon name={r.final_message_sent_at ? 'check' : 'x'} />{r.final_message_sent_at ? 'מייל נשלח למגיש.' : 'המייל למגיש לא נשלח.'}
          {r.decision_note ? ` הערה: ${r.decision_note}` : ''}
        </p>
      </div>
    )
  }

  return (
    <>
      <Modal label="כרטסת בקשה" onClose={mail ? () => setMail(null) : onClose}>
        <div className="card-h">
          <div className="top">
            <Pill st={st} />
            <span className="num" style={{ color: 'var(--faint)', fontSize: 13 }}>בקשה {no(r)}</span>
            <button className="x" aria-label="סגירה" onClick={onClose}><AidIcon name="x" /></button>
          </div>
          <h2>{aidPersonName(r) || 'ללא שם'}</h2>
          <div className="m">
            <span>{REASON_LABEL[r.aid_type ?? ''] ?? 'סיוע'}</span>
            <span>{sourceLabel(r)}</span>
            <span>הוגשה <span className="num">{fmtDate(r.created_at)}</span></span>
            {r.requested_amount ? <span>מבוקש <b className="num" style={{ color: 'var(--ink)' }}>{fmtMoney(r.requested_amount)}</b></span> : null}
          </div>
        </div>
        <div className="card-b">
          {prev && (
            <div className="internal"><AidIcon name="hist" /><div>
              <b>כבר הגיש בקשה: {prev}</b>
              <div className="lk"><AidIcon name="lock" size={12} /> פנימי · המגיש לא רואה את זה</div>
            </div></div>
          )}
          {action}
          {err && <p className="note" role="alert" style={{ color: 'var(--no)', marginTop: -8 }}>{err}</p>}

          <div className="blk"><h5>פרטים אישיים</h5><div className="kv">
            {personal.map(([l, v, c]) => <div key={l}><span>{l}</span><b className={c} dir={c === 'ltr' ? 'ltr' : undefined}>{v || '—'}</b></div>)}
          </div></div>

          {fam?.wife?.name && (
            <div className="blk"><h5>האישה</h5><div className="kv">
              <div><span>שם</span><b>{fam.wife.name}</b></div>
              <div><span>תעודת זהות</span><b className="num">{fam.wife.id || '—'}</b></div>
              <div><span>תאריך לידה</span><b className="num">{fmtDate(fam.wife.birth) || '—'}</b></div>
            </div></div>
          )}

          {kids.length > 0 && (
            <div className="blk"><h5>ילדים · {kids.length}</h5><table className="mini"><tbody>
              <tr><th>שם</th><th>גיל</th><th>מצב</th></tr>
              {kids.slice(0, 4).map((k, i) => <tr key={i}><td>{k.name}</td><td className="num">{ageFrom(k.birth) ?? '—'}</td><td>{k.status}</td></tr>)}
              {kids.length > 4 && <tr><td colSpan={3} style={{ color: 'var(--faint)' }}>ועוד {kids.length - 4} ילדים</td></tr>}
            </tbody></table></div>
          )}

          {inc && (
            <div className="blk"><h5>הכנסות והוצאות בחודש</h5>
              {incRows.length > 0 && <table className="mini"><tbody>{incRows.map(([l, v]) => <tr key={l}><td>{l}</td><td className="num">{money(v)}</td></tr>)}</tbody></table>}
              <div className="money">
                <div><small>סה״כ הכנסות</small><span className="big num">{fmtMoney(totalIncome(inc))}</span></div>
                <div><small>לנפש ({souls(fam)} נפשות)</small><span className="big num">{fmtMoney(perCapita(inc, fam))}</span></div>
              </div>
            </div>
          )}

          {r.reason && <div className="blk"><h5>הסיבה</h5><p style={{ margin: 0, fontSize: 'var(--t-sm)', whiteSpace: 'pre-wrap' }}>&quot;{r.reason}&quot;</p></div>}

          <div className="blk"><h5>מסמכים · {docs.length}</h5><div className="files">
            {docs.map((d, i) => <a key={i} className="file" href={d.file_url ?? '#'} target="_blank" rel="noreferrer"><AidIcon name="file" />{d.label || d.file_name || 'מסמך'}</a>)}
            {missing.map(l => <span key={l} className="file miss"><AidIcon name="x" />{l} · חסר</span>)}
            {docs.length === 0 && missing.length === 0 && <span style={{ color: 'var(--faint)', fontSize: 'var(--t-sm)' }}>לא צורפו מסמכים</span>}
          </div></div>

          <div className="blk"><h5>הערה פנימית</h5>
            <textarea className="inp" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="רק הצוות רואה את זה" style={{ width: '100%', resize: 'vertical' }} />
            {notes !== (r.notes ?? '') && (
              <button className="btn" style={{ marginTop: 8 }} disabled={!!busy} onClick={() => run('notes', async () => { await post('/api/admin/financial-aid/decide', { id: r.id, notes }); onDone() })}>
                {busy === 'notes' ? 'שומר…' : 'שמירת הערה'}
              </button>
            )}
          </div>

          <div className="blk"><h5>מה קרה עם הבקשה</h5><ul className="tl">
            {timeline.filter(([t]) => t).map(([t, l]) => <li key={l}><time>{fmtDateTime(t)}</time><span>{l}</span></li>)}
          </ul></div>

          <p className="note" style={{ margin: 0 }}><Link href={`/admin/financial-aid/${r.id}`}>לדף הבקשה המלא (התכתבות ומחיקה)</Link></p>
        </div>
      </Modal>
      {mail && <MailPreview mail={mail} onClose={() => setMail(null)} />}
    </>
  )
}
