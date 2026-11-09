'use client'

// האזור האישי לפי המוקאפ שאושר (א+ב · אריח בקשה חדשה): סרגל צד עם ניווט ו"מחיקה מהאיגוד",
// לוח פעולות עם אריח "בקשה חדשה" (רק מחלקות פתוחות), הבקשות שלי, פרטי המשפחה ואילן היוחסין.
// כל הערכים מנתוני המשתמש; המחלקות הפתוחות מגיעות מהאב (אותם שערים כמו בטפסים).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildLineageFixText } from '@/lib/lineageFixText'
import { DELETE_CONFIRM_WORD } from '@/lib/portalDeletion'
import {
  Baby, Landmark, HeartPulse, Gift, Plus, Pencil, FileText, GitBranch, LayoutGrid, List, Users, Trash2,
  X, TriangleAlert, Check, ChevronLeft, ChevronRight, Lock,
} from 'lucide-react'
import { REQUEST_STAGES, type RequestProgress } from '@/lib/requestStages'

interface PortalRequest {
  id: string; kind: string; kindLabel: string; statusLabel: string
  tone: 'pending' | 'progress' | 'approved' | 'rejected'
  amount: number | null; created_at: string; progress?: RequestProgress
}

export type PersonalAreaDept = 'maternity' | 'gemach' | 'financial_aid' | 'holidays'

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
  // המחלקות הפתוחות עכשיו (כבר מסוננות לפי השערים). מחלקה סגורה לא מוצגת ולא מוזכרת.
  openDepartments: PersonalAreaDept[]
  onStartRequest: (dept: PersonalAreaDept) => void
  onDeleted: () => void
  onFixLineage: (generation?: number) => void
  onEditDetails: () => void
  onOpenDocs: () => void
  emailUnverified?: boolean
  onVerifyEmail?: () => void
}

type Filter = 'all' | 'open' | 'done'

const DEPTS: Record<PersonalAreaDept, { icon: ReactNode; title: string; short: string; hint: string; prep: string[]; go: string }> = {
  maternity: {
    icon: <Baby size={20} aria-hidden="true" />, title: 'בקשת הבראה ליולדת', short: 'הבראה ליולדת', hint: 'ימי החלמה וכרטיס מזון',
    prep: ['אישור לידה (בתאומים: אישור לכל תינוק)', 'מספר זהות או דרכון של התינוק', 'ההגשה פתוחה עד 30 יום מתאריך הלידה'], go: 'להתחלת בקשת הלידה',
  },
  gemach: {
    icon: <Landmark size={20} aria-hidden="true" />, title: 'בקשת הלוואה', short: 'הלוואה', hint: 'גמ״ח חתם סופר',
    prep: ['מטרת ההלוואה: נישואי הבן/הבת, שמחה משפחתית, הוצאה רפואית, רכישת דירה ועוד', 'מסמכים עדכניים, שמעלים מחדש בכל בקשה', 'בקשה אחת פתוחה בכל פעם, עד שמתקבלת החלטה'], go: 'להתחלת בקשת ההלוואה',
  },
  financial_aid: {
    icon: <HeartPulse size={20} aria-hidden="true" />, title: 'בקשת סיוע רפואי', short: 'סיוע רפואי', hint: 'סיוע רפואי או כספי',
    prep: ['[להשלים: רשימת המסמכים לסיוע רפואי]'], go: 'להתחלת בקשת הסיוע',
  },
  holidays: {
    icon: <Gift size={20} aria-hidden="true" />, title: 'רישום לחלוקת החגים', short: 'חלוקת החגים', hint: 'הרשמה בלחיצה אחת',
    prep: ['אין טופס למלא. לחיצה אחת רושמת את המשפחה לחלוקה'], go: 'הרשמה לחלוקה',
  },
}

export default function PersonalArea({ beneficiary: b, docsCount, contacts, openDepartments, onStartRequest, onDeleted, onFixLineage, onEditDetails, onOpenDocs, emailUnverified, onVerifyEmail }: Props) {
  const [requests, setRequests] = useState<PortalRequest[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [active, setActive] = useState('pa-act')
  const [editing, setEditing] = useState(false)
  const [ans, setAns] = useState<Record<number, { ok: boolean; name: string; note: string; rel: string }>>({})
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const [sent, setSent] = useState(false)
  // חלוניות: בקשה חדשה (בחירה ואז "כדאי להכין מראש") ומחיקה מהאיגוד
  const [newOpen, setNewOpen] = useState(false)
  const [picked, setPicked] = useState<PersonalAreaDept | null>(null)
  const [delOpen, setDelOpen] = useState(false)
  const [delChk, setDelChk] = useState(false)
  const [delTxt, setDelTxt] = useState('')
  const [delBusy, setDelBusy] = useState(false)
  const [delErr, setDelErr] = useState('')
  const [delDone, setDelDone] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/portal/my-requests?beneficiary_id=${encodeURIComponent(b.id)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (alive) setRequests(d.requests ?? []) })
      .catch(() => { if (alive) { setFailed(true); setRequests([]) } })
    return () => { alive = false }
  }, [b.id])

  const closeNew = () => { setNewOpen(false); setPicked(null) }
  const closeDel = () => {
    if (delBusy) return
    setDelOpen(false)
    if (delDone) onDeleted()
  }
  useEffect(() => {
    if (!newOpen && !delOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (delOpen) closeDel(); else closeNew() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newOpen, delOpen, delBusy, delDone])

  const chain = useMemo(() => [...(b.lineage_chain ?? [])].sort((x, y) => x.generation - y.generation), [b.lineage_chain])
  const hasChildren = (b.children?.length ?? 0) > 0

  // מד השלמה: כל פריט הוא שדה שחסר או מסמך שלא הועלה
  const checks = useMemo(() => [
    { ok: !!b.phone }, { ok: !!b.email }, { ok: !!b.address }, { ok: !!b.spouse_name },
    { ok: hasChildren }, { ok: chain.length > 0 }, { ok: docsCount > 0 },
  ], [b, hasChildren, chain.length, docsCount])
  const pct = Math.round((checks.filter(c => c.ok).length / checks.length) * 100)

  const isClosed = (r: PortalRequest) => (r.progress ? r.progress.stage === 3 || r.progress.stage === -1 : false)
  const openCount = (requests ?? []).filter(r => !isClosed(r)).length
  const closedCount = (requests ?? []).filter(isClosed).length
  const shown = (requests ?? []).filter(r => (filter === 'all' ? true : filter === 'done' ? isClosed(r) : !isClosed(r)))
  const lineageNeedsFix = !!b.lineage_fix_required && !b.lineage_fixed_at

  // שורות האילן: כולל דורות חסרים בין הראשון לאחרון
  const maxGen = chain.length ? chain[chain.length - 1].generation : 0
  const treeRows = Array.from({ length: maxGen }, (_, i) => {
    const g = chain.find(x => x.generation === i + 1)
    return { generation: i + 1, name: g?.name, gap: !g, rel: g?.relation === 'son' ? 'בן' : g?.relation === 'son_in_law' ? 'חתן' : '' }
  })
  const gapCount = treeRows.filter(r => r.gap).length
  const treeTotal = Math.max(3, maxGen)

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

  const goTo = (id: string) => { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const openTreeEdit = () => { if (treeRows.length === 0) onFixLineage(); else { setEditing(true); setSent(false); goTo('pa-tree') } }

  // הפריט החסר הראשון: מוצג במד ההשלמה בסרגל הצד
  const nextMissing =
    docsCount === 0 ? { label: 'חסרים מסמכים', fix: onOpenDocs }
    : chain.length === 0 || gapCount > 0 ? { label: 'חסר אילן יוחסין', fix: () => onFixLineage() }
    : !b.phone || !b.email || !b.address || !b.spouse_name || !hasChildren ? { label: 'חסרים פרטים', fix: onEditDetails }
    : null

  const startRequest = (k: PersonalAreaDept) => { closeNew(); onStartRequest(k) }
  const delReady = delChk && delTxt.trim() === DELETE_CONFIRM_WORD
  const openDelete = () => { setDelChk(false); setDelTxt(''); setDelErr(''); setDelDone(false); setDelOpen(true) }
  const confirmDelete = async () => {
    setDelBusy(true); setDelErr('')
    try {
      const res = await fetch('/api/portal/delete-account', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: delTxt.trim(), understood: delChk }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setDelErr(d.error ?? 'המחיקה נכשלה. נסו שוב.'); return }
      setDelDone(true)
    } catch { setDelErr('המחיקה נכשלה. נסו שוב.') } finally { setDelBusy(false) }
  }

  const familyName = b.family_name || b.full_name
  const DeleteBtn = (
    <button type="button" className="danger-btn" onClick={openDelete}><Trash2 size={16} aria-hidden="true" />מחיקה מהאיגוד</button>
  )
  const pickedDept = picked ? DEPTS[picked] : null

  return (
    <div className="pa" dir="rtl">
      <style>{CSS}</style>
      <div className="wrap">
        <aside className="card side" aria-label="האזור האישי">
          <div className="who"><small>שלום,</small><h1>משפחת {familyName}</h1></div>
          <div className="meter">
            <div className="bar" role="img" aria-label={`התיק מלא ב-${pct} אחוז`}><i style={{ width: `${pct}%` }} /></div>
            <p><b className="num">{pct}%</b> מהתיק מלא{nextMissing ? <> · <button type="button" className="fix" onClick={nextMissing.fix}>{nextMissing.label}</button></> : ' · תודה!'}</p>
          </div>
          <ul className="nav" aria-label="ניווט">
            <li><button type="button" aria-current={active === 'pa-act'} onClick={() => goTo('pa-act')}><LayoutGrid size={18} aria-hidden="true" />פעולות</button></li>
            <li><button type="button" aria-current={active === 'pa-requests'} onClick={() => goTo('pa-requests')}><List size={18} aria-hidden="true" />הבקשות שלי<em>{requests?.length ?? 0}</em></button></li>
            <li><button type="button" aria-current={active === 'pa-family'} onClick={() => goTo('pa-family')}><Users size={18} aria-hidden="true" />פרטי המשפחה</button></li>
            <li><button type="button" onClick={onOpenDocs}><FileText size={18} aria-hidden="true" />מסמכים בתיק<em>{docsCount}</em></button></li>
            <li><button type="button" aria-current={active === 'pa-tree'} onClick={() => goTo('pa-tree')}><GitBranch size={18} aria-hidden="true" />אילן היוחסין<em>{chain.length}/{treeTotal}</em></button></li>
          </ul>
          <div className="div" />
          <div className="side-del">
            <p>לא רוצים להיות רשומים באיגוד?</p>
            {DeleteBtn}
          </div>
        </aside>

        <div className="main">
          <section id="pa-act" className="card panel" aria-label="פעולות">
            <div className="p-head"><span className="eyebrow">מה תרצו לעשות?</span></div>
            <div className="grid1">
              {openDepartments.length > 0 && (
                <button type="button" className="tile main" onClick={() => { setPicked(null); setNewOpen(true) }}>
                  <span className="ic"><Plus size={22} aria-hidden="true" /></span>
                  <b>בקשה חדשה</b>
                  <span className="deps">{openDepartments.map(k => <span key={k}>{DEPTS[k].short}</span>)}</span>
                </button>
              )}
              <button type="button" className="tile" onClick={onEditDetails}>
                <span className="ic"><Pencil size={20} aria-hidden="true" /></span>
                <b>עדכון פרטים</b><small>טלפון, מייל, כתובת וילדים</small>
              </button>
              <button type="button" className="tile" onClick={onOpenDocs}>
                <span className="ic"><FileText size={20} aria-hidden="true" /></span>
                <b>העלאת מסמך</b><small className="num">{docsCount} מסמכים בתיק</small>
              </button>
              <button type="button" className="tile" onClick={() => goTo('pa-tree')}>
                <span className="ic"><GitBranch size={20} aria-hidden="true" /></span>
                <b>אילן היוחסין</b><small className="num">{chain.length} מתוך {treeTotal} דורות</small>
              </button>
            </div>
          </section>

          <section id="pa-requests" className="card sec" aria-labelledby="pa-requests-h">
            <div className="req-head">
              <h2 className="h2" id="pa-requests-h">הבקשות שלי</h2>
              <div className="filters">
                {([['all', 'הכל', requests?.length ?? 0], ['open', 'פתוחות', openCount], ['done', 'סגורות', closedCount]] as const).map(([k, l, n]) => (
                  <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}<b>{n}</b></button>
                ))}
              </div>
            </div>
            {requests === null && <p className="muted pad">טוען…</p>}
            {failed && <p className="pad" style={{ color: '#93590A' }}>לא הצלחנו לטעון את הבקשות. נסו לרענן את הדף.</p>}
            {requests !== null && !failed && shown.length === 0 && (
              <div className="empty">
                <p><strong>{requests.length === 0 ? 'עדיין לא הוגשו בקשות' : 'אין בקשות בסינון הזה'}</strong>{requests.length === 0 && openDepartments.length > 0 ? 'אפשר להגיש בקשה חדשה בכל עת.' : ''}</p>
                {requests.length === 0 && openDepartments.length > 0 && (
                  <button type="button" className="btn btn-pri" onClick={() => { setPicked(null); setNewOpen(true) }}><Plus size={16} aria-hidden="true" />בקשה חדשה</button>
                )}
              </div>
            )}
            <ul className="rq">
              {shown.map(r => {
                const p = r.progress
                const done = p?.stage === 3
                const rejected = r.tone === 'rejected'
                return (
                  <li key={`${r.kind}-${r.id}`}>
                    <div>
                      <div className="t">{r.kindLabel}</div>
                      <div className="d">הוגשה ב-{new Date(r.created_at).toLocaleDateString('he-IL')}{r.amount ? ` · ₪${r.amount.toLocaleString('he-IL')}` : ''}</div>
                    </div>
                    <span className={`pill ${done || r.tone === 'approved' ? 'ok' : rejected ? 'bad' : 'p'}`}>{r.statusLabel}</span>
                    {p && p.stage >= 0 && (
                      <ol className="stp" aria-label="שלבי הבקשה">
                        {REQUEST_STAGES.map((s, i) => (
                          <li key={s} className={i < p.stage || done ? 'on' : i === p.stage ? 'cur' : ''}>{s}</li>
                        ))}
                      </ol>
                    )}
                    {p && !done && <div className="nx"><b>הצעד הבא:</b> {p.next} · <b>אצל:</b> {p.owner}</div>}
                  </li>
                )
              })}
            </ul>
          </section>

          <section id="pa-family" className="card sec" aria-labelledby="pa-family-h">
            <div className="sec-head">
              <h2 className="h2" id="pa-family-h">פרטי המשפחה</h2>
              <button type="button" className="link" onClick={onEditDetails}>עדכון<ChevronLeft size={14} aria-hidden="true" /></button>
            </div>
            <div className="people">
              <div>
                <span className="eyebrow">הבעל</span>
                <b>{[b.family_name, b.full_name].filter(Boolean).join(' ') || '[להשלים]'}</b>
                <span className="idl"><span className="muted">ת״ז</span><span className="mono num ltr">{b.id_number || '[להשלים]'}</span><span className="lk"><Lock size={11} aria-hidden="true" />קבוע</span></span>
              </div>
              <div>
                <span className="eyebrow">בת הזוג</span>
                <b>{b.spouse_name || '[להשלים]'}</b>
                <span className="idl"><span className="muted">ת״ז</span><span className="mono num ltr">{b.spouse_id_number || '[להשלים]'}</span><span className="lk"><Lock size={11} aria-hidden="true" />קבוע</span></span>
              </div>
            </div>
            <dl className="contact">
              <div><dt>טלפון</dt><dd className="num ltr">{b.phone || '[להשלים]'}</dd></div>
              <div><dt>מייל</dt><dd className="ltr">{b.email || '[להשלים]'}</dd></div>
              <div><dt>כתובת</dt><dd>{b.address || '[להשלים]'}</dd></div>
            </dl>
            {emailUnverified && <button type="button" className="unv" onClick={onVerifyEmail}>המייל לא מאומת · אימות עכשיו</button>}
            <p className="note"><Lock size={12} aria-hidden="true" /><span>ת״ז לא משתנה. שינוי שם באישור המשרד. טלפון ומייל מתעדכנים אחרי קוד אימות.</span></p>
          </section>

          <section id="pa-tree" className="card sec tree-c">
            <div className="sec-head">
              <h2 className="h2">אילן היוחסין</h2>
              {!editing && (chain.length > 0
                ? <button type="button" className="fixcta" onClick={openTreeEdit}>במידה ודרוש תיקון — לחצו כאן</button>
                : <button type="button" className="link" onClick={openTreeEdit}>הוספה</button>)}
            </div>
            {lineageNeedsFix && <p className="warn">המשרד ביקש לתקן את האילן. אפשר לעשות זאת כאן.</p>}
            {sent && <p className="doneb" role="status">הבקשה נשלחה לאישור המשרד. אפשר לעקוב אחריה ב&quot;הבקשות שלי&quot;.</p>}
            {editing && <p className="hintb">סמנו לכל דור &quot;נכון&quot; או &quot;לתקן&quot;. אפשר לתקן כמה דורות באותה בקשה, ובסוף שולחים הכל יחד.</p>}
            {treeRows.length === 0 ? (
              <p className="muted pad">עדיין לא נוסף אילן. [להשלים]</p>
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

          <div className="m-del">
            <span>לא רוצים להיות רשומים באיגוד?</span>
            {DeleteBtn}
          </div>
        </div>
      </div>

      {newOpen && (
        <div className="ov" onClick={e => { if (e.target === e.currentTarget) closeNew() }}>
          <div className="md" role="dialog" aria-modal="true" aria-labelledby="pa-new-t">
            {!pickedDept ? (
              <>
                <div className="md-h">
                  <div><h2 id="pa-new-t">איזו בקשה להגיש?</h2><p>מוצגות רק המחלקות שפתוחות עכשיו.</p></div>
                  <button type="button" className="x" onClick={closeNew} aria-label="סגירה"><X size={18} aria-hidden="true" /></button>
                </div>
                <div className="md-b">
                  <ul className="dept">
                    {openDepartments.map(k => (
                      <li key={k}>
                        <button type="button" onClick={() => setPicked(k)}>
                          <span className="ic">{DEPTS[k].icon}</span>
                          <span><b>{DEPTS[k].title}</b><small>{DEPTS[k].hint}</small></span>
                          <ChevronLeft className="go" size={18} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <>
                <div className="md-h">
                  <div>
                    <button type="button" className="back" onClick={() => setPicked(null)}><ChevronRight size={14} aria-hidden="true" />לכל המחלקות</button>
                    <h2 id="pa-new-t">{pickedDept.title}</h2><p>{pickedDept.hint}</p>
                  </div>
                  <button type="button" className="x" onClick={closeNew} aria-label="סגירה"><X size={18} aria-hidden="true" /></button>
                </div>
                <div className="md-b">
                  <span className="eyebrow">כדאי להכין מראש</span>
                  <ul className="prep">{pickedDept.prep.map(t => <li key={t}><Check size={16} aria-hidden="true" /><span>{t}</span></li>)}</ul>
                </div>
                <div className="md-f"><button type="button" className="btn btn-pri" onClick={() => startRequest(picked!)}>{pickedDept.go}</button></div>
              </>
            )}
          </div>
        </div>
      )}

      {delOpen && (
        <div className="ov" onClick={e => { if (e.target === e.currentTarget) closeDel() }}>
          <div className="md" role="alertdialog" aria-modal="true" aria-labelledby="pa-del-t" aria-describedby="pa-del-d">
            {!delDone ? (
              <>
                <div className="md-h">
                  <div><h2 id="pa-del-t">מחיקה מהאיגוד</h2><p>משפחת {familyName}</p></div>
                  <button type="button" className="x" onClick={closeDel} aria-label="סגירה"><X size={18} aria-hidden="true" /></button>
                </div>
                <div className="md-b">
                  <div className="dwarn" id="pa-del-d">
                    <TriangleAlert size={22} aria-hidden="true" />
                    <div>
                      <b>אתם בטוחים שאתם רוצים להימחק מהמאגר?</b>
                      אחרי המחיקה <strong>אין אפשרות להירשם מחדש</strong> לאיגוד. פרטי המשפחה, אילן היוחסין והמסמכים שבתיק יימחקו.
                    </div>
                  </div>
                  <label className="chk"><input type="checkbox" checked={delChk} onChange={e => setDelChk(e.target.checked)} /><span>הבנתי שאי אפשר להירשם מחדש אחרי המחיקה</span></label>
                  <label className="typ">כדי לאשר, כתבו את המילה <b>{DELETE_CONFIRM_WORD}</b>
                    <input value={delTxt} onChange={e => setDelTxt(e.target.value)} autoComplete="off" placeholder={DELETE_CONFIRM_WORD} />
                  </label>
                  {delErr && <p className="errb" role="alert">{delErr}</p>}
                </div>
                <div className="md-f">
                  <button type="button" className="btn btn-pri" onClick={closeDel} autoFocus>נשארים רשומים</button>
                  <button type="button" className="btn btn-del" disabled={!delReady || delBusy} onClick={confirmDelete}>{delBusy ? 'מוחק…' : 'מחיקה סופית'}</button>
                </div>
              </>
            ) : (
              <div className="gone">
                <div className="ic"><Check size={26} aria-hidden="true" /></div>
                <h2 id="pa-del-t">הפרטים נמחקו מהמאגר</h2>
                <p className="muted" id="pa-del-d">{b.email ? <>שלחנו אישור למייל <bdi className="ltr">{b.email}</bdi>.</> : 'תודה שהייתם איתנו.'}</p>
                <button type="button" className="btn btn-ghost" onClick={closeDel}>סגירה</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const CSS = `
.pa{--bg:#F4F2EC;--card:#fff;--ink:#17162B;--mut:#5D6170;--soft:#8E91A0;--line:#E3E0D6;--line-2:#EEEBE3;--navy:#17153B;--navy-2:#26215F;--gold:#C9A25A;--gold-2:#E7CF9C;--gold-50:#F8F1E2;--bord:#8C2F39;--bord-50:#F9ECEC;--ok:#157347;--ok-50:#E6F4EB;--amb:#93590A;--amb-50:#FDF2DE;--ind:#4338CA;--ind-50:#EEF0FF;--teal:#0F6E78;--t1:12px;--t2:13.5px;--t3:15px;--t4:19px;--t5:24px;--s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--r1:10px;--r2:18px;--ease:cubic-bezier(.2,.7,.2,1);font-family:Heebo,system-ui,sans-serif;color:var(--ink);font-size:var(--t3);line-height:1.55}
.pa *{box-sizing:border-box}
.pa h1,.pa h2,.pa p{margin:0}
.pa button{font:inherit;color:inherit;cursor:pointer}
.pa :focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.pa .ltr{direction:ltr;unicode-bidi:isolate}
.pa .num{font-variant-numeric:tabular-nums;white-space:nowrap}
.pa .mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.03em}
.pa .muted{color:var(--mut)}
.pa .pad{margin-top:var(--s4)}
.pa .card{background:var(--card);border:1px solid var(--line);border-radius:var(--r2)}
.pa .eyebrow{font-size:var(--t1);font-weight:700;color:var(--soft);letter-spacing:.02em}
.pa .h2{font-size:var(--t4);font-weight:800;letter-spacing:-.01em}
.pa .btn{border:0;border-radius:var(--r1);min-height:44px;padding:0 var(--s4);display:inline-flex;align-items:center;justify-content:center;gap:var(--s2);font-weight:700;font-size:var(--t3);transition:transform .15s,background .15s}
.pa .btn:active{transform:scale(.98)}
.pa .btn-pri{background:var(--navy);color:#fff}.pa .btn-pri:hover{background:var(--navy-2)}
.pa .btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}
.pa .btn-del{background:var(--bord);color:#fff}.pa .btn-del:hover{background:#74242D}
.pa .btn-del:disabled{background:#E2D3D4;color:#9A7D80;cursor:not-allowed;transform:none}
.pa .link{border:0;background:none;padding:var(--s2) 0;font-weight:700;font-size:var(--t2);color:var(--navy-2);min-height:44px;display:inline-flex;align-items:center;gap:6px}
.pa .link:hover{text-decoration:underline;text-underline-offset:3px}
.pa .fixcta{border:1.5px solid var(--gold);background:var(--gold-50);color:var(--amb);border-radius:99px;padding:0 var(--s4);min-height:44px;font-weight:800;font-size:var(--t2);display:inline-flex;align-items:center;cursor:pointer;animation:fixpulse 1.8s ease-in-out infinite}
.pa .fixcta:hover{background:var(--gold-2)}
@keyframes fixpulse{0%,100%{box-shadow:0 0 0 0 rgba(201,162,90,.7);background:var(--gold-50)}50%{box-shadow:0 0 0 8px rgba(201,162,90,0);background:var(--gold-2)}}
.pa .lk{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;color:var(--soft)}
.pa .danger-btn{border:1px solid transparent;background:none;color:var(--bord);font-weight:700;font-size:var(--t2);display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 var(--s3);border-radius:var(--r1)}
.pa .danger-btn:hover{background:var(--bord-50);border-color:#EBCFD1}
.pa .sec{padding:var(--s5)}
.pa .sec-head{display:flex;justify-content:space-between;align-items:center;gap:var(--s3)}
.pa .wrap{display:grid;grid-template-columns:276px minmax(0,1fr);gap:var(--s5);align-items:start}
.pa .wrap>*{min-width:0}
.pa .side{position:sticky;top:72px;padding:var(--s5);display:flex;flex-direction:column;gap:var(--s4)}
.pa .who small{display:block;font-size:var(--t2);color:var(--mut)}
.pa .who h1{font-size:var(--t5);font-weight:900;line-height:1.2;letter-spacing:-.01em;text-wrap:balance}
.pa .meter .bar{height:6px;background:#E6E2D7;border-radius:99px;overflow:hidden;margin:0 0 6px}
.pa .meter .bar i{display:block;height:100%;background:var(--navy);border-radius:99px}
.pa .meter p{font-size:var(--t2);color:var(--mut)}
.pa .meter p b{color:var(--ink)}
.pa .meter .fix{border:0;background:none;padding:0;color:var(--amb);font-weight:700;font-size:var(--t2);min-height:28px}
.pa .meter .fix:hover{text-decoration:underline;text-underline-offset:3px}
.pa .nav{display:grid;gap:2px;margin:0 calc(var(--s2) * -1);padding:0;list-style:none}
.pa .nav button{width:100%;border:0;background:none;display:flex;align-items:center;gap:var(--s3);padding:10px var(--s3);border-radius:var(--r1);min-height:44px;font-weight:700;font-size:var(--t2);text-align:right;color:var(--mut);transition:background .15s,color .15s}
.pa .nav button:hover{background:#F6F4EF;color:var(--ink)}
.pa .nav button[aria-current=true]{background:#F1EFE8;color:var(--ink)}
.pa .nav button[aria-current=true] svg{color:var(--navy)}
.pa .nav em{margin-inline-start:auto;font-style:normal;font-size:var(--t1);color:var(--soft);font-variant-numeric:tabular-nums}
.pa .div{height:1px;background:var(--line-2);margin:0 calc(var(--s5) * -1)}
.pa .side-del p{font-size:var(--t1);color:var(--soft);margin-bottom:2px}
.pa .side-del .danger-btn{margin-inline-start:calc(var(--s3) * -1)}
.pa .main{display:grid;gap:var(--s5);min-width:0}
.pa .m-del{display:none}
.pa .panel{overflow:hidden}
.pa .p-head{display:flex;justify-content:space-between;align-items:baseline;padding:var(--s4) var(--s5) 0}
.pa .grid1{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));padding:var(--s3);gap:var(--s3)}
.pa .grid1 .tile.main{grid-column:1/-1;min-height:0;flex-direction:row;flex-wrap:wrap;align-items:center;gap:var(--s2) var(--s3)}
.pa .grid1 .tile.main b{margin-top:0;flex:1}
.pa .grid1 .tile.main .deps{flex-basis:100%}
.pa .tile{border:1px solid var(--line-2);background:#FBFAF7;border-radius:14px;text-align:right;padding:var(--s4);display:flex;flex-direction:column;gap:var(--s2);min-height:156px;transition:background .15s,border-color .15s,transform .15s}
.pa .tile:hover{background:#fff;border-color:#D6D2C6}
.pa .tile:active{transform:scale(.98)}
.pa .tile .ic{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#fff;border:1px solid var(--line-2);color:var(--navy)}
.pa .tile b{font-size:var(--t3);font-weight:800;margin-top:auto;line-height:1.3}
.pa .tile small{font-size:var(--t1);color:var(--mut);line-height:1.4}
.pa .tile.main{background:var(--navy);border-color:var(--navy);color:#fff;padding:var(--s5)}
.pa .tile.main:hover{background:var(--navy-2)}
.pa .tile.main .ic{background:var(--gold);border:0;color:var(--navy);width:44px;height:44px}
.pa .tile.main b{font-size:var(--t5);font-weight:900}
.pa .deps{display:flex;flex-wrap:wrap;gap:4px}
.pa .deps span{font-size:11.5px;font-weight:700;border:1px solid rgba(231,207,156,.45);color:var(--gold-2);border-radius:99px;padding:2px 8px}
.pa .req-head{display:flex;justify-content:space-between;align-items:center;gap:var(--s3);flex-wrap:wrap}
.pa .filters{display:inline-flex;gap:2px;background:#F1EFE8;border-radius:var(--r1);padding:3px}
.pa .filters button{border:0;background:none;border-radius:8px;padding:6px 12px;min-height:36px;font-size:var(--t2);font-weight:700;color:var(--mut)}
.pa .filters button[aria-pressed=true]{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.07)}
.pa .filters b{font-weight:500;color:var(--soft);margin-inline-start:4px;font-variant-numeric:tabular-nums}
.pa .empty{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s3) var(--s4);padding:var(--s4) var(--s5);border:1px dashed #D8D4C8;border-radius:var(--r1);margin-top:var(--s4)}
.pa .empty p{flex:1 1 180px;color:var(--mut);font-size:var(--t2)}
.pa .empty strong{display:block;color:var(--ink);font-size:var(--t3)}
.pa .rq{list-style:none;margin:var(--s4) 0 0;padding:0;display:grid;gap:var(--s2)}
.pa .rq>li{display:grid;grid-template-columns:1fr auto;gap:var(--s2) var(--s4);padding:var(--s4);border:1px solid var(--line-2);border-radius:var(--r1)}
.pa .rq .t{font-weight:700}.pa .rq .d{font-size:var(--t1);color:var(--soft)}
.pa .pill{font-size:var(--t1);font-weight:700;padding:3px 10px;border-radius:99px;align-self:start;white-space:nowrap}
.pa .pill.p{background:var(--amb-50);color:var(--amb)}.pa .pill.ok{background:var(--ok-50);color:var(--ok)}.pa .pill.bad{background:var(--bord-50);color:var(--bord)}
.pa .stp{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;list-style:none;padding:0;margin:0}
.pa .stp li{padding-top:6px;border-top:3px solid var(--line-2);font-size:11.5px;color:var(--soft);font-weight:700}
.pa .stp li.on{border-color:var(--navy);color:var(--ink)}
.pa .stp li.cur{border-color:var(--gold);color:var(--ink)}
.pa .nx{grid-column:1/-1;font-size:var(--t2);color:var(--mut)}
.pa .nx b{color:var(--ink)}
.pa .people{display:grid;grid-template-columns:1fr 1fr;margin-top:var(--s3);border:1px solid var(--line-2);border-radius:var(--r1);overflow:hidden}
.pa .people>div{padding:var(--s4);min-width:0}
.pa .people>div+div{border-inline-start:1px solid var(--line-2)}
.pa .people b{display:block;font-size:var(--t4);font-weight:800;margin:2px 0 var(--s2)}
.pa .idl{display:flex;align-items:center;gap:var(--s2);font-size:var(--t2);flex-wrap:wrap}
.pa .idl .mono{font-weight:700}
.pa .contact{display:grid;grid-template-columns:auto auto 1fr;gap:var(--s4) var(--s6);margin:var(--s4) 0 0}
.pa .contact div{min-width:0}
.pa .contact dt{font-size:var(--t1);color:var(--soft);font-weight:700}
.pa .contact dd{margin:2px 0 0;font-weight:700;overflow-wrap:anywhere}
.pa .contact dd.ltr{text-align:right}
.pa .unv{margin-top:var(--s3);border:1px solid #F0C877;background:var(--amb-50);color:#8A5200;font-weight:700;font-size:var(--t2);border-radius:99px;padding:6px 12px;min-height:36px}
.pa .note{font-size:var(--t1);color:var(--soft);display:flex;gap:6px;align-items:flex-start;margin-top:var(--s4);line-height:1.5}
.pa .note svg{margin-top:3px;flex:none}
.pa .ov{position:fixed;inset:0;z-index:100;background:rgba(23,21,59,.42);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:var(--s4);animation:pa-fade .2s ease-out}
@keyframes pa-fade{from{opacity:0}to{opacity:1}}
.pa .md{background:#fff;border-radius:22px;width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 24px 64px -16px rgba(23,21,59,.45);animation:pa-up .25s var(--ease)}
@keyframes pa-up{from{transform:translateY(12px) scale(.98);opacity:0}to{transform:none;opacity:1}}
.pa .md-h{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--s3);padding:var(--s5) var(--s5) 0}
.pa .md-h h2{font-size:var(--t5);font-weight:900;letter-spacing:-.01em;line-height:1.2}
.pa .md-h p{color:var(--mut);font-size:var(--t2);margin-top:var(--s1)}
.pa .x{border:0;background:#F1EFE8;border-radius:50%;width:40px;height:40px;display:grid;place-items:center;flex:none}
.pa .x:hover{background:#E7E4DA}
.pa .md-b{padding:var(--s5)}
.pa .md-f{display:flex;gap:var(--s2);padding:0 var(--s5) var(--s5);flex-wrap:wrap}
.pa .md-f .btn{flex:1;min-width:150px}
.pa .back{border:0;background:none;color:var(--mut);font-weight:700;font-size:var(--t2);display:inline-flex;align-items:center;gap:4px;padding:0;min-height:36px;margin-bottom:var(--s2)}
.pa .dept{list-style:none;margin:0;padding:0;display:grid;gap:var(--s2)}
.pa .dept button{width:100%;display:grid;grid-template-columns:44px 1fr auto;align-items:center;gap:var(--s3);text-align:right;border:1px solid var(--line);background:#fff;border-radius:14px;padding:var(--s3) var(--s4);min-height:72px;transition:border-color .15s,background .15s,transform .15s}
.pa .dept button:hover{border-color:var(--navy);background:#FBFAF7}
.pa .dept button:active{transform:scale(.99)}
.pa .dept .ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--gold-50);color:var(--navy)}
.pa .dept b{display:block;font-weight:800}
.pa .dept small{color:var(--mut);font-size:var(--t1)}
.pa .dept .go{color:var(--soft)}
.pa .prep{list-style:none;margin:var(--s3) 0 0;padding:0;display:grid;gap:var(--s2)}
.pa .prep li{display:flex;gap:var(--s2);align-items:flex-start}
.pa .prep li svg{color:var(--ok);margin-top:3px;flex:none}
.pa .dwarn{background:var(--bord-50);border:1px solid #EBCFD1;color:#5E1C24;border-radius:14px;padding:var(--s4);display:flex;gap:var(--s3);align-items:flex-start}
.pa .dwarn svg{color:var(--bord);margin-top:1px;flex:none}
.pa .dwarn b{display:block;font-size:var(--t4);font-weight:900;line-height:1.3;color:var(--bord);margin-bottom:var(--s1)}
.pa .chk{display:flex;gap:var(--s3);align-items:flex-start;margin-top:var(--s4);font-weight:700;cursor:pointer;min-height:44px}
.pa .chk input{width:22px;height:22px;accent-color:var(--bord);margin:2px 0 0;flex:none}
.pa .typ{display:block;margin-top:var(--s2);font-size:var(--t2);color:var(--mut);font-weight:700}
.pa .typ b{color:var(--ink)}
.pa .typ input{display:block;width:100%;margin-top:6px;font:inherit;font-size:var(--t4);font-weight:800;border:1px solid var(--line);border-radius:var(--r1);padding:10px var(--s3);min-height:48px}
.pa .typ input:focus{border-color:var(--bord);outline:none;box-shadow:0 0 0 3px var(--bord-50)}
.pa .gone{text-align:center;padding:var(--s6) var(--s5)}
.pa .gone .ic{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;margin:0 auto var(--s4);background:#F1EFE8}
.pa .gone h2{font-size:var(--t5);font-weight:900}
.pa .gone p{margin:var(--s2) 0 var(--s5)}
.pa .errb{font-size:12.5px;color:#B42318;margin-top:var(--s2)}
@media (min-width:821px){
  .pa .grid1{grid-template-columns:2fr 1fr 1fr 1fr}
  .pa .grid1 .tile.main{grid-column:auto;flex-direction:column;align-items:stretch;flex-wrap:nowrap}
  .pa .grid1 .tile.main b{flex:none;margin-top:auto}
  #pa-family{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);column-gap:var(--s5);align-items:start}
  #pa-family>.sec-head,#pa-family>.unv,#pa-family>.note{grid-column:1/-1}
  #pa-family .contact{grid-template-columns:1fr 1fr;margin-top:var(--s3);padding:var(--s4);border:1px solid var(--line-2);border-radius:var(--r1)}
  #pa-family .contact div:nth-child(2){grid-column:1/-1}
}
@media (max-width:820px){
  .pa .wrap{grid-template-columns:1fr;gap:var(--s3)}
  .pa .side{position:static;padding:var(--s4);gap:var(--s3)}
  .pa .nav{display:flex;overflow-x:auto;gap:var(--s1);margin:0 calc(var(--s4) * -1);padding:0 var(--s4);scrollbar-width:none}
  .pa .nav::-webkit-scrollbar{display:none}
  .pa .nav li{flex:none}
  .pa .nav button{border:1px solid var(--line-2);border-radius:99px;padding:6px 14px;min-height:40px;white-space:nowrap}
  .pa .nav button[aria-current=true]{border-color:var(--navy)}
  .pa .side .div,.pa .side-del{display:none}
  .pa .main{gap:var(--s3)}
  .pa .grid1{grid-template-columns:1fr 1fr 1fr;padding:var(--s2);gap:var(--s2)}
  .pa .grid1 .tile.main{grid-column:1/-1;min-height:0;flex-direction:row;flex-wrap:wrap;align-items:center;gap:var(--s2) var(--s3)}
  .pa .grid1 .tile.main b{margin-top:0;flex:1}
  .pa .grid1 .tile.main .deps{flex-basis:100%}
  .pa .grid1 .tile{min-height:108px;padding:var(--s3)}
  .pa .grid1 .tile small{display:none}
  .pa .grid1 .tile:not(.main) b{font-size:var(--t2)}
  .pa .p-head{padding:var(--s3) var(--s4) 0}
  .pa .sec{padding:var(--s4)}
  .pa .empty{flex-direction:column;align-items:stretch}
  .pa .people{grid-template-columns:1fr}
  .pa .people>div+div{border-inline-start:0;border-top:1px solid var(--line-2)}
  .pa .contact{grid-template-columns:1fr 1fr}
  .pa .contact div:nth-child(2){grid-column:1/-1;order:3}
  .pa .m-del{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);padding:var(--s2) var(--s4);font-size:var(--t1);color:var(--soft)}
  .pa .ov{align-items:flex-end;padding:0}
  .pa .md{border-radius:22px 22px 0 0;max-height:92vh;width:100%}
  .pa .md-h,.pa .md-b{padding-inline:var(--s4)}
  .pa .md-f{padding:0 var(--s4) var(--s5)}
  .pa .md-f .btn{min-width:0}
  .pa .tree li{padding-inline-start:calc(var(--d) * 12px)}
  .pa .tree.editing .node{flex-wrap:wrap}
  .pa .tree.editing .edit{width:100%;padding-inline-start:52px}
  .pa .fx{padding-inline-start:0}
}
@media (prefers-reduced-motion:reduce){.pa *,.pa *::before{animation:none!important;transition:none!important}}
/* אילן היוחסין */
.pa .warn{font-size:12.5px;color:#8A5200;background:var(--amb-50);border-radius:12px;padding:8px 12px;margin:10px 0 8px}
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
`
