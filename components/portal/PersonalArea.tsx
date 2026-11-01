'use client'

// סקירת האזור האישי לפי המוקאפ המלא שאושר: פתיח עם ברכה ומד השלמת תיק, שורת תגיות למה שחסר,
// שלושה כרטיסי פרטים, ארבעה מספרים, בקשות עם שלבים ואילן יוחסין. כל הערכים מנתוני המשתמש.
import { useEffect, useMemo, useState } from 'react'
import { buildLineageFixText } from '@/lib/lineageFixText'
import { Check, ChevronLeft, Clock, CircleCheck, GitBranch, FileText, Lock, ArrowUpLeft, Plus } from 'lucide-react'
import { REQUEST_STAGES, type RequestProgress } from '@/lib/requestStages'

interface PortalRequest {
  id: string; kind: string; kindLabel: string; statusLabel: string
  tone: 'pending' | 'progress' | 'approved' | 'rejected'
  amount: number | null; created_at: string; progress?: RequestProgress
}

export interface PersonalAreaBeneficiary {
  id: string
  full_name: string
  family_name?: string
  id_number?: string
  spouse_id_number?: string
  phone?: string
  email?: string
  address?: string
  spouse_name?: string
  children?: unknown[]
  lineage_chain?: { generation: number; name: string; relation?: 'son' | 'son_in_law' | null }[]
  lineage_fix_required?: boolean
  lineage_fixed_at?: string | null
}

interface Props {
  beneficiary: PersonalAreaBeneficiary
  docsCount: number
  contacts: { label: string; email: string }[]
  onNewRequest: () => void
  onFixLineage: (generation?: number) => void
  onEditDetails: () => void
  onOpenDocs: () => void
  emailUnverified?: boolean
  onVerifyEmail?: () => void
}

type Filter = 'all' | 'open' | 'done'

const R = 30
const C = 2 * Math.PI * R

// ספירה הדרגתית של מספר; עם prefers-reduced-motion מציג מיד את הערך הסופי
function useCount(to: number, ms: number) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const t0 = performance.now()
    const f = (t: number) => {
      const p = reduce ? 1 : Math.min(1, (t - t0) / ms)
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return v
}

function Count({ to, ms = 700, suffix = '' }: { to: number; ms?: number; suffix?: string }) {
  return <>{useCount(to, ms)}{suffix}</>
}

export default function PersonalArea({ beneficiary: b, docsCount, contacts, onNewRequest, onFixLineage, onEditDetails, onOpenDocs, emailUnverified, onVerifyEmail }: Props) {
  const [requests, setRequests] = useState<PortalRequest[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [filled, setFilled] = useState(false)
  const [openMiss, setOpenMiss] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [ans, setAns] = useState<Record<number, { ok: boolean; name: string; note: string; rel: string }>>({})
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/portal/my-requests?beneficiary_id=${encodeURIComponent(b.id)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (alive) setRequests(d.requests ?? []) })
      .catch(() => { if (alive) { setFailed(true); setRequests([]) } })
    return () => { alive = false }
  }, [b.id])

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFilled(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const chain = useMemo(() => [...(b.lineage_chain ?? [])].sort((x, y) => x.generation - y.generation), [b.lineage_chain])
  const hasChildren = (b.children?.length ?? 0) > 0

  // מד השלמה: כל פריט הוא שדה שחסר או מסמך שלא הועלה
  const checks = useMemo(() => [
    { ok: !!b.phone, label: 'מספר טלפון' },
    { ok: !!b.email, label: 'כתובת מייל' },
    { ok: !!b.address, label: 'כתובת מגורים' },
    { ok: !!b.spouse_name, label: 'פרטי בן/בת הזוג' },
    { ok: hasChildren, label: 'פרטי הילדים' },
    { ok: chain.length > 0, label: 'אילן יוחסין' },
    { ok: docsCount > 0, label: 'מסמכים בתיק' },
  ], [b, hasChildren, chain.length, docsCount])
  const pct = Math.round((checks.filter(c => c.ok).length / checks.length) * 100)
  const missingCount = checks.filter(c => !c.ok).length
  const contactDone = checks.slice(0, 3).filter(c => c.ok).length
  const pctShown = useCount(pct, 1100)

  const isClosed = (r: PortalRequest) => (r.progress ? r.progress.stage === 3 || r.progress.stage === -1 : false)
  const openCount = (requests ?? []).filter(r => !isClosed(r)).length
  const doneCount = (requests ?? []).filter(r => r.progress?.stage === 3).length
  const shown = (requests ?? []).filter(r => (filter === 'all' ? true : filter === 'done' ? isClosed(r) : !isClosed(r)))
  const lineageNeedsFix = !!b.lineage_fix_required && !b.lineage_fixed_at

  // שורות האילן: כולל דורות חסרים בין הראשון לאחרון
  const maxGen = chain.length ? chain[chain.length - 1].generation : 0
  const treeRows = Array.from({ length: maxGen }, (_, i) => {
    const g = chain.find(x => x.generation === i + 1)
    return { generation: i + 1, name: g?.name, gap: !g, rel: g?.relation === 'son' ? 'בן' : g?.relation === 'son_in_law' ? 'חתן' : '' }
  })
  const gapCount = treeRows.filter(r => r.gap).length

  // בקשת תיקון לאילן: סימון לכל דור, ושליחה אחת כטקסט למשרד (ממתין לאישור, לא משנה את העץ)
  const fixes = treeRows.filter(r => ans[r.generation]?.ok === false)
  const fixCount = fixes.length
  const okCount = treeRows.filter(r => ans[r.generation]?.ok === true).length
  const canSend = fixCount > 0 && fixes.every(r => ans[r.generation].name.trim().length > 0)
  const cancelEdit = () => { setEditing(false); setAns({}); setSendErr('') }
  const sendFix = async () => {
    setSending(true); setSendErr('')
    const text = buildLineageFixText(fixes, ans)
    try {
      const res = await fetch('/api/portal/lineage-fix', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setSendErr(d.error ?? 'שליחת הבקשה נכשלה'); return }
      setEditing(false); setAns({}); setSent(true)
    } catch { setSendErr('שליחת הבקשה נכשלה') } finally { setSending(false) }
  }

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  const toggleMiss = (k: string) => setOpenMiss(o => (o === k ? null : k))

  const missItems = [
    !hasChildren && { key: 'kids', label: 'פרטי הילדים', text: 'עדיין לא הוספתם את פרטי הילדים. אפשר להוסיף ב"עדכון פרטים".', fix: onEditDetails },
    chain.length === 0
      ? { key: 'tree', label: 'אילן יוחסין', text: 'עדיין לא נוסף אילן יוחסין. הוסיפו אותו כדי שהמשרד יאשר.', fix: () => onFixLineage() }
      : gapCount > 0 ? { key: 'tree', label: 'אילן יוחסין', text: `חסרים ${gapCount} דורות באילן היוחסין. הוסיפו אותם כדי שהמשרד יאשר את האילן.`, fix: () => onFixLineage() } : false,
    !b.spouse_name && { key: 'spouse', label: 'בן/בת הזוג', text: 'פרטי בן/בת הזוג חסרים. אפשר להוסיף ב"עדכון פרטים".', fix: onEditDetails },
    docsCount === 0 && { key: 'docs', label: 'מסמכים', text: 'עדיין לא הועלו מסמכים לתיק.', fix: onOpenDocs },
  ].filter(Boolean) as { key: string; label: string; text: string; fix: () => void }[]
  const openText = missItems.find(m => m.key === openMiss)

  const bar = (on: number, total: number) => Array.from({ length: total }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)
  const treeTotal = Math.max(3, maxGen)

  return (
    <div className="pa" dir="rtl">
      <style>{CSS}</style>
      <div className="bento">
        <section className="hero">
          <div>
            <small>האזור האישי · איגוד הצאצאים</small>
            <h1>שלום,<br /><span>משפחת {b.family_name || b.full_name}</span></h1>
            <p>הפרטים שלכם, אילן היוחסין וכל בקשה ובאיזה שלב היא, במקום אחד.</p>
          </div>
          <div className="ringbox">
            <svg width="76" height="76" viewBox="0 0 72 72" role="img" aria-label={`התיק מלא ב-${pct} אחוז`}>
              <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="7" />
              <circle className="p" cx="36" cy="36" r={R} fill="none" stroke="#D9B26A" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={filled ? C * (1 - pct / 100) : C} transform="rotate(-90 36 36)" />
              <text x="36" y="41" textAnchor="middle" fontSize="17" fontWeight="900" fill="#fff">{pctShown}%</text>
            </svg>
            <div>
              <b>השלמת התיק</b>
              <div>{missingCount === 0 ? 'התיק מלא. תודה!' : `עוד ${missingCount} פריטים והתיק מלא`}</div>
            </div>
          </div>
        </section>

        <div className="todo">
          <span className={`chip ${contactDone === 3 ? 'ok' : ''}`}>
            {contactDone === 3 ? <Check size={14} aria-hidden="true" /> : null}
            {contactDone === 3 ? <>פרטי קשר <span className="num">3/3</span></> : <button type="button" onClick={onEditDetails}>פרטי קשר · להשלמה<ChevronLeft size={14} aria-hidden="true" /></button>}
          </span>
          {missItems.map(m => (
            <span key={m.key} className="chip">
              <button type="button" aria-expanded={openMiss === m.key} onClick={() => toggleMiss(m.key)}>{m.label} · להשלמה<ChevronLeft size={14} aria-hidden="true" /></button>
            </span>
          ))}
          {docsCount > 0 && <span className="chip ok"><Check size={14} aria-hidden="true" />מסמכים <span className="num">{docsCount}</span></span>}
          {openText && (
            <div className="md on" key={openText.key}>
              {openText.text}
              <button type="button" className="link" onClick={openText.fix}>להשלמה עכשיו</button>
            </div>
          )}
        </div>

        <section className="card info">
          <div className="phead"><h3 className="h3">הבעל</h3></div>
          <dl><Row k="שם" v={[b.family_name, b.full_name].filter(Boolean).join(' ')} /><Row k="ת״ז" v={b.id_number} num locked /></dl>
        </section>
        <section className="card info">
          <div className="phead"><h3 className="h3">בת הזוג</h3></div>
          <dl><Row k="שם" v={b.spouse_name} /><Row k="ת״ז" v={b.spouse_id_number} num locked /></dl>
        </section>
        <section className="card info">
          <div className="phead">
            <h3 className="h3">יצירת קשר</h3>
            <button type="button" className="link" onClick={onEditDetails}>עדכון</button>
          </div>
          <dl>
            <Row k="טלפון" v={b.phone} ltr num />
            <Row k="מייל" v={b.email} ltr />
            <Row k="כתובת" v={b.address} />
          </dl>
          {emailUnverified && (
            <button type="button" className="unv" onClick={onVerifyEmail}>המייל לא מאומת · אימות עכשיו</button>
          )}
        </section>
        <p className="note"><Lock size={12} aria-hidden="true" /><span>ת״ז לא ניתנת לשינוי. המייל שלכם: <bdi dir="ltr">{b.email || '[להשלים]'}</bdi>. שינוי שם באישור המשרד. שינוי מייל וטלפון אחרי אימות בקוד שנשלח אליהם.</span></p>

        <button type="button" className="card stat" style={{ ['--c' as string]: '#4338CA' }} onClick={() => { setFilter('open'); scrollTo('pa-requests') }}>
          <span className="arr"><ArrowUpLeft size={16} aria-hidden="true" /></span>
          <div className="ic"><Clock size={16} aria-hidden="true" /></div>
          <div className="n num"><Count to={openCount} /></div><div className="l">בקשות בטיפול</div>
          <div className="sp">{bar(Math.min(openCount, 4), 4)}</div>
        </button>
        <button type="button" className="card stat" style={{ ['--c' as string]: '#157347' }} onClick={() => { setFilter('done'); scrollTo('pa-requests') }}>
          <span className="arr"><ArrowUpLeft size={16} aria-hidden="true" /></span>
          <div className="ic"><CircleCheck size={16} aria-hidden="true" /></div>
          <div className="n num"><Count to={doneCount} /></div><div className="l">בקשות שבוצעו</div>
          <div className="sp">{bar(Math.min(doneCount, 4), 4)}</div>
        </button>
        <button type="button" className="card stat" style={{ ['--c' as string]: '#0F6E78' }} onClick={() => scrollTo('pa-tree')}>
          <span className="arr"><ArrowUpLeft size={16} aria-hidden="true" /></span>
          <div className="ic"><GitBranch size={16} aria-hidden="true" /></div>
          <div className="n num"><Count to={chain.length} /><small> / {treeTotal}</small></div><div className="l">דורות באילן</div>
          <div className="sp">{bar(Math.min(chain.length, treeTotal), treeTotal)}</div>
        </button>
        <button type="button" className="card stat" style={{ ['--c' as string]: '#8C2F39' }} onClick={onOpenDocs}>
          <span className="arr"><ArrowUpLeft size={16} aria-hidden="true" /></span>
          <div className="ic"><FileText size={16} aria-hidden="true" /></div>
          <div className="n num"><Count to={docsCount} /></div><div className="l">מסמכים בתיק</div>
          <div className="sp">{bar(Math.min(docsCount, 4), 4)}</div>
        </button>

        <section id="pa-requests" className="card req-c">
          <div className="phead">
            <h3 className="h3">הבקשות שלי</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="seg">
                {([['all', 'הכל'], ['open', 'פתוחות'], ['done', 'סגורות']] as const).map(([k, l]) => (
                  <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
                ))}
              </div>
              <button type="button" className="btn" onClick={onNewRequest}><Plus size={16} aria-hidden="true" />בקשה חדשה</button>
            </div>
          </div>
          {requests === null && <p className="muted">טוען…</p>}
          {failed && <p style={{ color: '#B26A00' }}>לא הצלחנו לטעון את הבקשות. נסו לרענן את הדף.</p>}
          {requests !== null && !failed && shown.length === 0 && (
            <p className="muted">{requests.length === 0 ? 'עדיין לא הוגשו בקשות.' : 'אין בקשות בסינון הזה.'}</p>
          )}
          {shown.map(r => {
            const p = r.progress
            const done = p?.stage === 3
            const rejected = r.tone === 'rejected'
            return (
              <div key={`${r.kind}-${r.id}`} className={`req${done ? ' done' : ''}${rejected ? ' rej' : ''}`}>
                <div className="rh">
                  <div>
                    <b>{r.kindLabel}</b>
                    <small>הוגשה ב-{new Date(r.created_at).toLocaleDateString('he-IL')}{r.amount ? ` · ₪${r.amount.toLocaleString('he-IL')}` : ''}</small>
                  </div>
                  <span className={`badge ${done || r.tone === 'approved' ? 'b-ok' : rejected ? 'b-bord' : 'b-ind'}`}>
                    {done && <Check size={13} aria-hidden="true" />}{r.statusLabel}
                  </span>
                </div>
                {p && p.stage >= 0 && (
                  <ol className="stp" aria-label="שלבי הבקשה">
                    {REQUEST_STAGES.map((s, i) => (
                      <li key={s} className={i < p.stage || done ? 'past' : i === p.stage ? 'cur' : ''}>
                        <span className="k" />{s}
                      </li>
                    ))}
                  </ol>
                )}
                {p && !done && <div className="nx"><b>הצעד הבא:</b> {p.next} · <b>אצל:</b> {p.owner}</div>}
              </div>
            )
          })}
        </section>

        <section id="pa-tree" className="card tree-c">
          <div className="phead">
            <h3 className="h3">אילן היוחסין</h3>
            {!editing && (
              <button type="button" className="link" onClick={() => { if (treeRows.length === 0) onFixLineage(); else { setEditing(true); setSent(false) } }}>
                {chain.length > 0 ? 'בקשת תיקון' : 'הוספה'}
              </button>
            )}
          </div>
          {lineageNeedsFix && <p className="warn">המשרד ביקש לתקן את האילן. אפשר לעשות זאת כאן.</p>}
          {sent && <p className="doneb" role="status">הבקשה נשלחה לאישור המשרד. אפשר לעקוב אחריה ב&quot;הבקשות שלי&quot;.</p>}
          {editing && <p className="hintb">סמנו לכל דור &quot;נכון&quot; או &quot;לתקן&quot;. אפשר לתקן כמה דורות באותה בקשה, ובסוף שולחים הכל יחד.</p>}
          {treeRows.length === 0 ? (
            <p className="muted">עדיין לא נוסף אילן. [להשלים]</p>
          ) : (
            <ol className={`tree${editing ? ' editing' : ''}`}>
              {treeRows.map((g, i) => {
                const a = ans[g.generation]
                return (
                  <li key={g.generation} className={`g${i % 5}${g.gap ? ' gap' : i === 0 ? ' root' : ''}${i === treeRows.length - 1 && !g.gap ? ' me' : ''}`} style={{ ['--d' as string]: i }}>
                    <div className="node">
                      <span className="av">{i === 0 && !g.gap ? 'א' : g.generation}</span>
                      <span className="tx"><small>דור {g.generation}</small><b>{g.gap ? 'חסר דור' : g.name || '[להשלים]'}{g.rel && !g.gap && <span className="rel">{g.rel}</span>}</b></span>
                      {editing ? (
                        <span className="edit">
                          <button type="button" className={`mini y${a?.ok === true ? ' sel' : ''}`} onClick={() => setAns(p => ({ ...p, [g.generation]: { ok: true, name: '', note: '', rel: '' } }))}><Check size={13} />נכון</button>
                          <button type="button" className={`mini n${a?.ok === false ? ' sel' : ''}`} onClick={() => setAns(p => ({ ...p, [g.generation]: { ok: false, name: p[g.generation]?.name ?? '', note: p[g.generation]?.note ?? '', rel: p[g.generation]?.rel ?? g.rel } }))}>{g.gap ? 'להוסיף' : 'לתקן'}</button>
                        </span>
                      ) : null}
                    </div>
                    {editing && a?.ok === false && (
                      <div className="fx">
                        <label>השם הנכון<input value={a.name} onChange={e => setAns(p => ({ ...p, [g.generation]: { ...a, name: e.target.value } }))} placeholder="השם המלא כפי שצריך להופיע" autoFocus /></label>
                        <label>בן או חתן<input value={a.rel} onChange={e => setAns(p => ({ ...p, [g.generation]: { ...a, rel: e.target.value } }))} placeholder="בן / חתן" /></label>
                        <label>הערה למשרד (לא חובה)<input value={a.note} onChange={e => setAns(p => ({ ...p, [g.generation]: { ...a, note: e.target.value } }))} placeholder="מקור או הסבר קצר" /></label>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
          {editing && (
            <div className="ebar">
              <div className="c">בבקשה: <b>{fixCount}</b> תיקונים · <b>{okCount}</b> אושרו{sendErr && <span className="errb"> · {sendErr}</span>}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="ghost" onClick={cancelEdit}>ביטול</button>
                <button type="button" className="send" disabled={!canSend || sending} onClick={sendFix}>{sending ? 'שולח…' : 'שליחה לאישור'}</button>
              </div>
            </div>
          )}
          {contacts.length > 0 && (
            <div className="help">
              <b>צריכים עזרה?</b>
              {contacts.map(c => (
                <div key={c.email}><span className="muted">{c.label}</span> <a href={`mailto:${c.email}`} dir="ltr">{c.email}</a></div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Row({ k, v, ltr, num, locked }: { k: string; v?: string; ltr?: boolean; num?: boolean; locked?: boolean }) {
  return (
    <div className="row">
      <dt>{k}</dt>
      <dd className={`${num ? 'num' : ''} ${ltr ? 'ltr' : ''}`} style={ltr ? { textAlign: 'right' } : undefined}>{v || '[להשלים]'}</dd>
      {locked ? <span className="lk"><Lock size={11} aria-hidden="true" />קבוע</span> : <span />}
    </div>
  )
}


const CSS = `
.pa{--card:#fff;--line:rgba(26,26,46,.08);--ink:#16162A;--mut:#5F6475;--soft:#9CA0AE;--navy:#17153B;--ind:#4338CA;--ind-50:#EEF0FF;--ok:#157347;--ok-50:#E7F5EC;--amb:#B26A00;--amb-50:#FFF3DC;--bord:#8C2F39;--teal:#0F6E78;--teal-50:#E6F2F3;--gold:#D9B26A;--sh:0 1px 1px rgba(20,20,40,.03),0 2px 4px rgba(20,20,40,.03),0 12px 32px -12px rgba(20,20,40,.10);--ease:cubic-bezier(.2,.7,.2,1);font-family:Heebo,system-ui,sans-serif;color:var(--ink);font-size:15px;line-height:1.55}
.pa *{box-sizing:border-box}
.pa button{font-family:inherit;cursor:pointer;color:inherit}
.pa .num{font-variant-numeric:tabular-nums}
.pa .ltr{direction:ltr;unicode-bidi:isolate}
.pa :focus-visible{outline:2px solid var(--ind);outline-offset:2px}
.pa .card{background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:var(--sh)}
.pa .h3{font-size:17px;font-weight:800;margin:0}
.pa .muted{color:var(--mut)}
.pa .link{border:0;background:none;color:var(--ind);font-weight:700;font-size:13.5px;padding:8px 4px;min-height:40px}
.pa .btn{border:0;background:var(--ink);color:#fff;font-weight:700;font-size:13.5px;border-radius:12px;padding:10px 16px;min-height:42px;display:inline-flex;align-items:center;gap:6px;transition:transform .15s var(--ease),background .15s}
.pa .btn:hover{background:var(--ind);transform:translateY(-1px)}
.pa .badge{font-size:12px;font-weight:700;border-radius:99px;padding:3px 10px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.pa .b-ok{background:var(--ok-50);color:var(--ok)}
.pa .b-amb{background:var(--amb-50);color:var(--amb)}
.pa .b-bord{background:#F8E6E8;color:var(--bord)}
.pa .b-ind{background:var(--ind-50);color:var(--ind)}
.pa .b-ind::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;animation:pa-pulse 1.8s ease-out infinite}
@keyframes pa-pulse{0%{box-shadow:0 0 0 0 rgba(67,56,202,.45)}100%{box-shadow:0 0 0 6px rgba(67,56,202,0)}}
.pa .bento{display:grid;grid-template-columns:repeat(12,1fr);gap:14px}
.pa .bento>*{animation:pa-rise .5s var(--ease) both}
.pa .bento>*:nth-child(2){animation-delay:.05s}.pa .bento>*:nth-child(3){animation-delay:.1s}.pa .bento>*:nth-child(4){animation-delay:.13s}.pa .bento>*:nth-child(5){animation-delay:.16s}.pa .bento>*:nth-child(6){animation-delay:.19s}.pa .bento>*:nth-child(7){animation-delay:.22s}.pa .bento>*:nth-child(8){animation-delay:.25s}
@keyframes pa-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.pa .hero{grid-column:1/-1;position:relative;overflow:hidden;background:var(--navy);color:#fff;border-radius:28px;padding:32px;display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center}
.pa .hero small{color:var(--gold);font-size:13px;font-weight:700}
.pa .hero h1{margin:4px 0 10px;font-size:clamp(34px,5vw,56px);font-weight:900;line-height:1.05}
.pa .hero h1 span{color:var(--gold)}
.pa .hero p{margin:0;color:#CFCDEF;font-size:15px;max-width:42ch}
.pa .ringbox{display:flex;align-items:center;gap:16px;min-width:260px;border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:18px 20px}
.pa .ringbox b{display:block;font-size:16px}
.pa .ringbox div div{font-size:13px;color:#CFCDEF}
.pa .ringbox circle.p{transition:stroke-dashoffset 1.1s var(--ease)}
.pa .todo{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pa .chip{display:inline-flex;align-items:center;gap:5px;border-radius:99px;font-size:13.5px;font-weight:700;background:var(--amb-50);color:#8A5200;border:1px solid #F0C877}
.pa .chip>button{border:0;background:none;font:inherit;color:inherit;display:inline-flex;align-items:center;gap:4px;padding:8px 14px;min-height:40px}
.pa .chip.ok{background:var(--ok-50);color:var(--ok);border-color:#BFE1CC;padding:8px 14px;min-height:40px}
.pa .todo .md{flex-basis:100%}
.pa .md{font-size:13px;color:var(--mut);background:#FAFAF7;border:1px dashed #E6D2A8;border-radius:12px;padding:10px 12px;animation:pa-rise .25s var(--ease)}
.pa .md .link{display:block;padding:4px 0 0;min-height:0}
.pa .info{grid-column:span 4;padding:20px 22px}
.pa .info dl{margin:0}
.pa .info .phead{min-height:40px}
.pa .row{display:grid;grid-template-columns:84px 1fr auto;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line);font-size:14.5px;margin:0}
.pa .row dt{color:var(--mut);font-size:13px}
.pa .row dd{margin:0;font-weight:700;min-width:0;overflow-wrap:anywhere}
.pa .row .lk{font-size:11.5px;color:var(--bord);background:#F8E6E8;border-radius:99px;padding:2px 9px;display:inline-flex;gap:3px;align-items:center;font-weight:700}
.pa .unv{margin-top:8px;border:1px solid #F0C877;background:var(--amb-50);color:#8A5200;font-weight:700;font-size:12.5px;border-radius:99px;padding:6px 12px}
.pa .note{grid-column:1/-1;margin:0;display:flex;gap:6px;font-size:13px;color:var(--mut)}
.pa .note svg{margin-top:3px;flex-shrink:0}
.pa .stat{grid-column:span 3;padding:18px;text-align:right;position:relative;overflow:hidden;transition:transform .2s var(--ease),box-shadow .2s}
.pa .stat:hover{transform:translateY(-3px);box-shadow:0 18px 40px -18px rgba(20,20,40,.25)}
.pa .stat .ic{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 10%,#fff);margin-bottom:10px}
.pa .stat .n{font-size:30px;font-weight:900;line-height:1;color:var(--ink)}
.pa .stat .n small{font-size:15px;color:var(--soft);font-weight:600}
.pa .stat .l{font-size:13px;color:var(--mut);margin-top:4px}
.pa .stat .arr{position:absolute;top:16px;inset-inline-end:16px;color:var(--soft);transition:transform .2s,color .2s}
.pa .stat:hover .arr{transform:translateX(-3px);color:var(--c)}
.pa .stat .sp{display:flex;gap:3px;margin-top:12px;flex-direction:row-reverse}
.pa .stat .sp i{flex:1;height:4px;border-radius:99px;background:#ECEBE6}
.pa .stat .sp i.on{background:var(--c)}
.pa .req-c{grid-column:1/-1;padding:22px 24px}
.pa .tree-c{grid-column:1/-1;padding:22px 24px}
.pa .phead{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap}
.pa .seg{display:inline-flex;background:#F1F0EC;border-radius:12px;padding:3px;gap:2px}
.pa .seg button{border:0;background:none;font-size:12.5px;font-weight:700;color:var(--mut);padding:6px 12px;border-radius:9px;min-height:32px}
.pa .seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.pa .req{border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin-top:10px;transition:border-color .15s}
.pa .req:hover{border-color:rgba(67,56,202,.3)}
.pa .rh{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.pa .rh b{font-size:15px}
.pa .rh small{display:block;font-size:12.5px;color:var(--mut)}
.pa .stp{display:grid;grid-template-columns:repeat(4,1fr);list-style:none;margin:14px 0 0;padding:0}
.pa .stp li{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;font-size:11.5px;color:var(--soft)}
.pa .stp li::before{content:"";position:absolute;top:7px;inset-inline-start:50%;width:100%;height:2px;background:#ECEBE6}
.pa .stp li:last-child::before{display:none}
.pa .stp li.past::before{background:var(--c,var(--ind))}
.pa .stp .k{width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #DAD9D3;z-index:1}
.pa .stp li.past .k{background:var(--c,var(--ind));border-color:var(--c,var(--ind))}
.pa .stp li.cur .k{border-color:var(--ind);box-shadow:0 0 0 4px var(--ind-50)}
.pa .stp li.cur{color:var(--ink);font-weight:700}
.pa .req.done{--c:var(--ok)}
.pa .nx{font-size:13px;color:var(--mut);margin-top:12px}
.pa .nx b{color:var(--ink)}
.pa .warn{font-size:12.5px;color:#8A5200;background:var(--amb-50);border-radius:12px;padding:8px 12px;margin:0 0 8px}
.pa .tree{list-style:none;margin:0;padding:0}
.pa .tree li{position:relative;padding-inline-start:calc(var(--d) * 26px)}
.pa .tree .node{position:relative;display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:16px;margin-bottom:6px;border:1px solid transparent;transition:background .15s}
.pa .tree li:not(:first-child) .node::before{content:"";position:absolute;inset-inline-start:-12px;top:-14px;width:12px;height:36px;border-inline-start:2px solid #D8D6CF;border-bottom:2px solid #D8D6CF;border-end-start-radius:12px}
.pa .tree .node:hover{filter:brightness(.97)}
.pa .av{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;font-weight:800;font-size:13px;background:#fff;color:var(--teal);flex-shrink:0;transition:transform .2s cubic-bezier(.2,.7,.2,1)}
.pa .tree .node:hover .av{transform:scale(1.06)}
.pa .tree li.root .av{background:var(--navy);color:var(--gold);width:46px;height:46px}
.pa .tree li.gap .av{background:#fff;color:var(--amb);border:1.5px dashed #E8BE6E}
.pa .tree .tx{min-width:0;flex:1}
.pa .tree small{display:block;font-size:11.5px;color:var(--soft);font-weight:600}
.pa .tree b{font-size:15px;line-height:1.35}
.pa .tree li.gap b{color:#8A5200;font-weight:600}
.pa .tree li.g0 .node{background:#E9E6F7}
.pa .tree li.g1 .node{background:#E3EEF4}
.pa .tree li.g2 .node{background:#E4F1EA}
.pa .tree li.g3 .node{background:#F6EEDC}
.pa .tree li.g4 .node{background:#EDE6F2}
.pa .tree .node{border-color:rgba(23,21,59,.06)}
.pa .tree li.me .av{background:var(--ind);color:#fff}
.pa .tree .rel{display:inline-block;font-size:11.5px;font-weight:700;border-radius:99px;padding:1px 10px;margin-inline-start:8px;background:#fff;color:var(--navy);border:1px solid rgba(23,21,59,.15);vertical-align:middle}
.pa .tree .edit{display:flex;gap:6px}
.pa .mini{border:1.5px solid var(--line);background:#fff;border-radius:10px;font-size:12.5px;font-weight:700;padding:6px 10px;min-height:36px;display:inline-flex;align-items:center;gap:4px}
.pa .mini.y.sel{border-color:var(--ok);background:var(--ok-50);color:var(--ok)}
.pa .mini.n.sel{border-color:var(--amb);background:var(--amb-50);color:#8A5200}
.pa .fx{display:flex;flex-direction:column;gap:8px;margin:0 0 10px;padding-inline-start:52px}
.pa .fx label{font-size:12.5px;font-weight:700;color:var(--mut);display:flex;flex-direction:column;gap:5px}
.pa .fx input{border:1px solid #DAD8D1;border-radius:12px;padding:10px 12px;font-size:15px;background:#fff;min-height:44px;font-weight:500;font-family:inherit}
.pa .fx input:focus{outline:2px solid var(--ind);outline-offset:0;border-color:transparent}
.pa .hintb{font-size:13px;background:var(--ind-50);color:#2F2896;border-radius:12px;padding:10px 12px;margin:0 0 12px}
.pa .doneb{font-size:13.5px;background:var(--ok-50);color:var(--ok);border-radius:12px;padding:10px 12px;margin:0 0 12px;font-weight:600}
.pa .errb{font-size:12.5px;color:#B42318;margin:0 0 8px}
.pa .ebar{position:sticky;bottom:12px;margin-top:16px;background:var(--navy);color:#fff;border-radius:16px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 18px 40px -16px rgba(23,21,59,.6)}
.pa .ebar .c{font-size:13.5px;color:#CFCDEF}
.pa .ebar .c b{color:#fff;font-variant-numeric:tabular-nums}
.pa .ebar button{border:0;border-radius:12px;font-weight:700;font-size:14px;padding:10px 16px;min-height:44px;font-family:inherit}
.pa .ebar .send{background:var(--gold);color:var(--navy)}
.pa .ebar .send:disabled{opacity:.4}
.pa .ebar .ghost{background:rgba(255,255,255,.1);color:#fff}
.pa .help{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:13px;display:flex;flex-direction:column;gap:4px}
.pa .help a{color:var(--ind);font-weight:700;word-break:break-all}
@media (max-width:920px){
  .pa .info{grid-column:1/-1}
  .pa .req-c,.pa .tree-c{grid-column:1/-1}
  .pa .stat{grid-column:span 6}
}
@media (max-width:560px){
  .pa .hero{grid-template-columns:1fr;gap:16px;padding:22px;border-radius:24px}
  .pa .ringbox{min-width:0}
  .pa .req-c,.pa .tree-c,.pa .info{padding:16px}
  .pa .tree li{padding-inline-start:calc(var(--d) * 12px)}
  .pa .tree.editing .node{flex-wrap:wrap}
  .pa .tree.editing .edit{width:100%;padding-inline-start:52px}
  .pa .fx{padding-inline-start:0}
  .pa .stat{padding:14px}
  .pa .stat .n{font-size:26px}
}
@media (prefers-reduced-motion:reduce){.pa *,.pa *::before{animation:none!important;transition:none!important}}
`
