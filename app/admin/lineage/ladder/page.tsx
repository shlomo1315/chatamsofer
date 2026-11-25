'use client'

// סולם דורות: הכרעה על צמתים ממתינים, דור אחרי דור, מהענף הגדול לקטן.
// הכתיבה עוברת דרך PATCH הקיים ב-/api/admin/lineage (פסילה = cascadeRejectSubtree
// בשרת, בלי שינוי זכאות ובלי מייל). ביטול פסילה = /api/admin/lineage/ladder/restore.
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCan } from '@/components/StaffPermissions'
import { expandRejectionTargets } from '@/lib/lineageRejectCascade'
import {
  buildLadderIndex, genRows, groupParents, workGen, snapshotGroup, decisionOf, nextPending,
  dupInfo, pathNames, familiesInBranch, type LadderNode, type LadderStatus, type GroupSnapshot,
} from '@/lib/lineageLadder'
import { LADDER_CSS } from './ladder.css'

type RowState = 'v0' | 'v' | 'p' | 'r'
type Undo = { kind: 'v' } | { kind: 'r'; items: { id: string; status: 'verified' | 'pending' }[] }
type Linked = Record<string, unknown[]>

const fmt = (n: number) => n.toLocaleString('en-US')
const LBL: Record<RowState, string> = { v0: 'אושר', v: 'אושר עכשיו', p: 'ממתין', r: 'נפסל' }

const IcV = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#1E6A4B" /><path d="M4.8 8.2l2.1 2.1 4.3-4.5" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const IcP = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="#F8EDD5" stroke="#B7791F" strokeWidth="1.5" /></svg>
)
const IcCur = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="#fff" stroke="#14213D" strokeWidth="1.5" /><circle cx="8" cy="8" r="3" fill="#14213D" /></svg>
)
const IcR = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#A3322B" /><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /></svg>
)
const ICON: Record<RowState, () => ReactNode> = { v0: IcV, v: IcV, p: IcP, r: IcR }

function normStatus(s: unknown): LadderStatus {
  return s === 'verified' || s === 'rejected' ? s : 'pending'
}

export default function LineageLadderPage() {
  const canEdit = useCan('lineage', 'edit')
  const [nodes, setNodes] = useState<LadderNode[] | null>(null)
  const [linked, setLinked] = useState<Linked>({})
  const [loadErr, setLoadErr] = useState('')
  const [snap, setSnap] = useState<GroupSnapshot | null>(null)
  const [cur, setCur] = useState<string | null>(null)
  const [modal, setModal] = useState<'rej' | 'all' | null>(null)
  const [toast, setToast] = useState<{ text: string; undoId: string | null } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const undoRef = useRef(new Map<string, Undo>())
  const inflight = useRef(new Map<string, Promise<boolean>>())
  const tAdv = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tToast = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tFlash = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    let off = false
    fetch('/api/admin/lineage?fresh=1', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (off) return
        if (!Array.isArray(d?.nodes)) { setLoadErr(d?.error || 'טעינת העץ נכשלה'); return }
        const list: LadderNode[] = (d.nodes as Record<string, unknown>[]).map(n => ({
          id: String(n.id), name: String(n.name ?? ''),
          parent_id: (n.parent_id as string | null) ?? null,
          generation: typeof n.generation === 'number' ? n.generation : null,
          status: normStatus(n.status),
        }))
        // בפתיחה: הקבוצה הגדולה בדור שבעבודה
        const ix0 = buildLadderIndex(list)
        const wg = workGen(ix0)
        const first = wg ? groupParents(ix0, wg)[0] : undefined
        if (first) {
          const s = snapshotGroup(ix0, first.id)
          setSnap(s)
          setCur(s.pend[0] ?? null)
        }
        setNodes(list)
        setLinked((d.linked ?? {}) as Linked)
      })
      .catch(() => { if (!off) setLoadErr('טעינת העץ נכשלה') })
    return () => { off = true }
  }, [])

  useEffect(() => () => { clearTimeout(tAdv.current); clearTimeout(tToast.current); clearTimeout(tFlash.current) }, [])

  const ix = useMemo(() => buildLadderIndex(nodes ?? []), [nodes])
  const rows = useMemo(() => genRows(ix), [ix])

  const openGroup = useCallback((parentId: string) => {
    clearTimeout(tAdv.current)
    const s = snapshotGroup(ix, parentId)
    setSnap(s)
    setCur(s.pend[0] ?? null)
    setModal(null)
  }, [ix])

  const setLocal = (m: Map<string, LadderStatus>) =>
    setNodes(prev => prev && prev.map(n => (m.has(n.id) ? { ...n, status: m.get(n.id) as LadderStatus } : n)))

  const showToast = (text: string, undoId: string | null) => {
    clearTimeout(tToast.current)
    setToast({ text, undoId })
    tToast.current = setTimeout(() => setToast(null), 5000)
  }

  const patch = async (id: string, status: LadderStatus) => {
    const r = await fetch('/api/admin/lineage', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }),
    }).catch(() => null)
    return !!r?.ok
  }

  const isOpen = (id: string) => ix.byId.get(id)?.status === 'pending'

  const decide = (v: 'v' | 'r') => {
    if (!snap || !cur || !nodes || !canEdit) return
    const id = cur
    const n = ix.byId.get(id)
    if (!n || n.status !== 'pending') return
    const d = ix.desc.get(id) ?? 0
    let job: Promise<boolean>
    let undo: Undo
    let prevMap: Map<string, LadderStatus>
    if (v === 'v') {
      prevMap = new Map([[id, 'pending']])
      undo = { kind: 'v' }
      setLocal(new Map([[id, 'verified']]))
      job = patch(id, 'verified')
    } else {
      const targets = expandRejectionTargets(nodes, [id]).filter(t => ix.byId.get(t)?.status !== 'rejected')
      const items = targets.map(t => ({ id: t, status: ix.byId.get(t)?.status as 'verified' | 'pending' }))
      prevMap = new Map(items.map(it => [it.id, it.status]))
      undo = { kind: 'r', items }
      setLocal(new Map(targets.map(t => [t, 'rejected' as LadderStatus])))
      job = patch(id, 'rejected')
    }
    undoRef.current.set(id, undo)
    inflight.current.set(id, job)
    setModal(null)
    setFlash(id)
    clearTimeout(tFlash.current)
    tFlash.current = setTimeout(() => setFlash(null), 900)
    showToast(v === 'v' ? `${n.name} אושר` : `${n.name} נדחה · ${fmt(d + 1)} צמתים נפסלו`, id)

    clearTimeout(tAdv.current)
    tAdv.current = setTimeout(() => {
      setCur(c => (c === id ? nextPending(snap.pend, id, t => t !== id && isOpen(t)) : c))
    }, v === 'v' ? 700 : 1100)

    job.then(ok => {
      if (ok) return
      undoRef.current.delete(id)
      setLocal(prevMap)
      clearTimeout(tAdv.current)
      setCur(id)
      showToast(`השמירה של ${n.name} נכשלה. ההחלטה לא נשמרה.`, null)
    })
  }

  const undoDecision = async (id: string) => {
    const u = undoRef.current.get(id)
    if (!u || !canEdit) return
    clearTimeout(tAdv.current)
    clearTimeout(tToast.current)
    setToast(null)
    setCur(id)
    undoRef.current.delete(id)
    const done = await (inflight.current.get(id) ?? Promise.resolve(true))
    if (!done) return
    const name = ix.byId.get(id)?.name ?? ''
    let ok: boolean
    if (u.kind === 'v') {
      setLocal(new Map([[id, 'pending']]))
      ok = await patch(id, 'pending')
      if (!ok) setLocal(new Map([[id, 'verified']]))
    } else {
      setLocal(new Map(u.items.map(it => [it.id, it.status as LadderStatus])))
      const r = await fetch('/api/admin/lineage/ladder/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rootId: id, items: u.items }),
      }).catch(() => null)
      ok = !!r?.ok
      if (!ok) setLocal(new Map(u.items.map(it => [it.id, 'rejected' as LadderStatus])))
    }
    if (!ok) {
      undoRef.current.set(id, u)
      showToast(`ביטול ההחלטה על ${name} נכשל`, null)
    }
  }

  const idx = snap && cur ? snap.pend.indexOf(cur) : -1
  const act = (a: 'ok' | 'no' | 'confirm' | 'close' | 'all' | 'prev' | 'next') => {
    if (a === 'ok' && cur && isOpen(cur) && canEdit) decide('v')
    else if (a === 'no' && cur && isOpen(cur) && canEdit) setModal('rej')
    else if (a === 'confirm') decide('r')
    else if (a === 'close') setModal(null)
    else if (a === 'all') setModal('all')
    else if (a === 'prev' && snap && idx > 0) { clearTimeout(tAdv.current); setCur(snap.pend[idx - 1]) }
    else if (a === 'next' && snap && idx > -1 && idx < snap.pend.length - 1) { clearTimeout(tAdv.current); setCur(snap.pend[idx + 1]) }
  }
  const actRef = useRef(act)
  actRef.current = act
  const modalRef = useRef(modal)
  modalRef.current = modal

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const k = e.key.toLowerCase()
      const run = actRef.current
      if (modalRef.current) {
        if (k === 'escape') run('close')
        else if (k === 'enter' && modalRef.current === 'rej') { e.preventDefault(); run('confirm') }
        return
      }
      if (k === 'a' || k === 'ש') run('ok')
      else if (k === 'x' || k === 'ס') run('no')
      else if (k === 'arrowdown' || k === 'arrowleft') { e.preventDefault(); run('next') }
      else if (k === 'arrowup' || k === 'arrowright') { e.preventDefault(); run('prev') }
      else if (k === 't' || k === 'א') run('all')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ───── חלקי המסך ─────
  const top = (
    <div className="top">
      <nav className="tabs">
        <Link href="/admin/lineage">העץ</Link>
        <Link href="/admin/lineage/ladder" className="on" aria-current="page">מאושרים</Link>
        <Link href="/admin/beneficiaries?status=deep_review">בדיקה מעמיקה</Link>
      </nav>
      <div className="tools"><button className="gh" onClick={() => act('all')}>כל הדורות</button></div>
    </div>
  )

  if (!nodes) {
    return (
      <div className="lad" dir="rtl"><style>{LADDER_CSS}</style>
        <div className="wrap">{top}<p className="msg">{loadErr || 'טוען את העץ…'}</p></div>
      </div>
    )
  }

  const parent = snap ? ix.byId.get(snap.parentId) : undefined
  const g = snap?.gen ?? 0
  const all = snap ? [...snap.pre, ...snap.pend] : []
  const decided = snap ? snap.pend.filter(id => decisionOf(ix.byId.get(id))).length : 0
  const maxD = Math.max(0, ...all.map(id => ix.desc.get(id) ?? 0))
  const rowState = (id: string): RowState => {
    const s = ix.byId.get(id)?.status
    if (snap?.pre.includes(id)) return s === 'rejected' ? 'r' : 'v0'
    return s === 'verified' ? 'v' : s === 'rejected' ? 'r' : 'p'
  }
  const totals = rows.reduce((a, r) => ({ v: a.v + r.verified, p: a.p + r.pending }), { v: 0, p: 0 })
  const otherParents = snap ? groupParents(ix, g).filter(p => p.id !== snap.parentId) : []
  const nextWg = workGen(ix)

  const head = snap && parent && (
    <div className="hd">
      <div>
        <div className="crumb"><button onClick={() => act('all')}>כל הדורות</button> · דור {g} · ילדיו של צומת בדור {g - 1}</div>
        <h1>ילדי {parent.name}</h1>
        <div className="subl">
          <b>{fmt(all.length)} ילדים</b> · {fmt(ix.desc.get(parent.id) ?? 0)} צמתים בענף · {fmt(snap.pre.length)} אושרו לפני המעבר, {fmt(snap.pend.length)} להכרעה, מהענף הגדול לקטן
        </div>
      </div>
      <div className="prog">
        <div className="big">{decided}<small>/{snap.pend.length}</small></div>
        <div className="lbl">הוכרעו</div>
        <div className="segs">
          {snap.pend.map(id => {
            const d = decisionOf(ix.byId.get(id))
            const nm = ix.byId.get(id)?.name ?? ''
            return <button key={id} aria-label={nm} title={nm} className={`${d ?? ''} ${id === cur ? 'c' : ''}`}
              onClick={() => { clearTimeout(tAdv.current); setCur(id) }} />
          })}
        </div>
      </div>
    </div>
  )

  const nextHint = () => {
    if (otherParents.length) {
      return <>ילדי <button onClick={() => openGroup(otherParents[0].id)}>{otherParents[0].name}</button> בדור {g}.</>
    }
    if (nextWg) {
      const p = groupParents(ix, nextWg)[0]
      const row = rows[nextWg - 1]
      return <>{p ? <button onClick={() => openGroup(p.id)}>דור {nextWg}</button> : <>דור {nextWg}</>} ({fmt(row?.pending ?? 0)} ממתינים).</>
    }
    return <>אין עוד צמתים להכרעה.</>
  }

  let card: ReactNode
  if (!snap || !parent) {
    card = (
      <div className="done-box"><span className="chip v">הושלם</span><h2>אין צמתים להכרעה</h2>
        <p>לכל ממתין בעץ אין הורה מאושר, או שהכול הוכרע.</p>
        <div className="acts" style={{ gridTemplateColumns: '1fr' }}><button className="ok" onClick={() => act('all')}>לכל הדורות</button></div>
      </div>
    )
  } else if (!cur) {
    const v = snap.pend.filter(id => ix.byId.get(id)?.status === 'verified').length
    const r = snap.pend.filter(id => ix.byId.get(id)?.status === 'rejected').length
    card = (
      <div className="done-box"><span className="chip v">הושלם</span><h2>ילדי {parent.name} הוכרעו</h2>
        <p>{v} אושרו, {r} נדחו. הבא בסדר היורד: {nextHint()}</p>
        <div className="acts" style={{ gridTemplateColumns: '1fr' }}><button className="ok" onClick={() => act('all')}>לכל הדורות</button></div>
      </div>
    )
  } else {
    const n = ix.byId.get(cur) as LadderNode
    const s = rowState(cur)
    const d = ix.desc.get(cur) ?? 0
    const sib = (ix.kids.get(parent.id) ?? []).filter(k => k.id !== cur && k.status === 'verified').length
    const dup = dupInfo(ix, cur)
    const q: string[] = []
    let c: string | null = cur
    for (let i = 0; i < 3; i++) {
      c = nextPending(snap.pend, c as string, t => t !== cur && isOpen(t))
      if (!c || q.includes(c)) break
      q.push(c)
    }
    const dupText = dup && (() => {
      const a = dup.others ? `יש עוד ${dup.others} ממתינים בשם ${dup.key} תחת ${parent.name}` : ''
      const vv = dup.verified
      const b = vv.length === 1 ? `${dup.key} אחד שכבר אושר (${fmt(ix.desc.get(vv[0].id) ?? 0)} צמתים)`
        : vv.length > 1 ? `${vv.length} בשם ${dup.key} שכבר אושרו` : ''
      const body = a && b ? `${a}, ו${b}` : a || `יש תחת ${parent.name} ${b}`
      return `${body}. בדוק לפני אישור.`
    })()
    card = (
      <>
        <div className="meta">
          {s === 'p' ? <span className="chip">ממתין</span> : s === 'r' ? <span className="chip r">נפסל</span> : <span className="chip v">אושר</span>}
          <span>דור {g} · {idx + 1} מתוך {snap.pend.length} להכרעה</span>
        </div>
        <h2>{n.name}</h2>
        <div className="lin">{pathNames(ix, cur).join(' ← ')}</div>
        <div className="stats">
          <div><b>{fmt(d)}</b><span>צמתים בענף</span></div>
          <div><b>{fmt(familiesInBranch(ix, cur, linked))}</b><span>משפחות</span></div>
          <div><b>{sib}</b><span>אחים מאושרים</span></div>
        </div>
        {dupText && <div className="warn"><b>ייתכן שזו כפילות</b>{dupText}</div>}
        {s === 'p' && (
          <div className="rules">
            <p><b>אישור:</b> רק הצומת הזה. הענפים שמתחתיו נבדקים בדור {g + 1}.</p>
            <p><b>דחייה:</b> {d ? `כל ${fmt(d)} הצמתים בענף נפסלים יחד איתו.` : 'אין צמתים מתחתיו. רק הצומת נפסל.'}</p>
          </div>
        )}
        {s === 'p' ? (canEdit && (
          <div className="acts">
            <button className="ok" onClick={() => act('ok')}>אשר <kbd>A</kbd></button>
            <button className="no" onClick={() => act('no')}>דחה את הענף <kbd>X</kbd></button>
          </div>
        )) : (
          <>
            <div className="rules"><p><b>{s === 'r' ? 'נדחה' : 'אושר'} בסבב הזה.</b> {s === 'r'
              ? `${fmt(d)} צמתים בענף סומנו כפסולים. הזכאות לא השתנתה, ומייל לא נשלח.`
              : `הענפים שמתחתיו ייבדקו בדור ${g + 1}.`}</p></div>
            {canEdit && undoRef.current.has(cur) && <button className="undo" onClick={() => undoDecision(cur)}>בטל את ההחלטה</button>}
          </>
        )}
        <div className="navb">
          <button onClick={() => act('prev')} disabled={idx <= 0}>→ הקודם</button>
          <button onClick={() => act('next')} disabled={idx === snap.pend.length - 1}>הבא ←</button>
        </div>
        {q.length > 0 && <div className="queue">הבאים בתור: <b>{q.map(x => ix.byId.get(x)?.name).join(' · ')}</b></div>}
      </>
    )
  }

  const row = (id: string) => {
    const nd = ix.byId.get(id)
    if (!nd) return null
    const s = rowState(id)
    const isCur = id === cur
    const nav = !!snap?.pend.includes(id)
    const d = ix.desc.get(id) ?? 0
    const pct = d && maxD ? Math.max((d / maxD) * 100, 1.5) : 0
    const Ic = isCur && s === 'p' ? IcCur : ICON[s]
    const pick = () => { clearTimeout(tAdv.current); setCur(id) }
    return (
      <div key={id} className={`row ${s} ${isCur ? 'cur' : ''} ${nav ? 'nav' : ''} ${flash === id ? 'flash' : ''}`}
        {...(nav ? { tabIndex: 0, onClick: pick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') pick() } } : {})}>
        <div className="ln">
          <span className="ic"><Ic /></span>
          <span className="nm">{nd.name}{s !== 'v0' && s !== 'v' && dupInfo(ix, id) && <em>כפול?</em>}</span>
          <span className="bar"><i style={{ inlineSize: `${pct}%` }} /></span>
          <span className="ct">{fmt(d)}</span>
          <span className="sl">{isCur && s === 'p' ? 'בבדיקה' : LBL[s]}</span>
        </div>
        {s === 'r' && <div className="sub">הפסילה ירדה ל-{fmt(d)} צמתים בענף · הזכאות לא השתנתה · מייל לא נשלח</div>}
      </div>
    )
  }

  const kids = snap && (
    <div className="kids">
      {snap.pre.map(row)}
      <div className="sep">להכרעה · מהגדול לקטן</div>
      {snap.pend.map(row)}
    </div>
  )

  const ladder = (expand: boolean) => (
    <>
      <div className="lh"><span>דור</span><span>חלק המאושרים בדור</span><span>מאושרים</span><span>ממתינים</span><span>מצב</span></div>
      {rows.map(r => {
        const t = r.verified + r.pending
        const now = !!snap && r.g === g
        const done = !now && r.pending === 0
        const ap = t ? (r.verified / t) * 100 : 0
        const first = !expand && r.pending > 0 ? groupParents(ix, r.g)[0] : undefined
        const openFirst = first ? () => openGroup(first.id) : undefined
        return (
          <div key={r.g}>
            <div className={`g ${done ? 'done' : now ? 'now' : ''} ${openFirst ? 'pick' : ''}`} onClick={openFirst}
              {...(openFirst ? { role: 'button', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') openFirst() } } : {})}>
              <span className="gn">{r.g}</span>
              <span className="gb"><i className="a" style={{ inlineSize: `${ap}%` }} /><i className="q" style={{ inlineSize: `${t ? 100 - ap : 0}%` }} /></span>
              <span className="gv">{fmt(r.verified)}</span>
              <span className="gp">{fmt(r.pending)}</span>
              <span className="gs">{done ? 'הושלם' : now ? `בעבודה · ${decided}/${snap?.pend.length ?? 0}` : 'בתור'}</span>
            </div>
            {expand && now && parent && (
              <div className="gx">
                <div className="gt">
                  <span><b>ילדי {parent.name}</b> · {fmt(all.length)} מתוך {fmt(t)} בדור {g}</span>
                  <span>עוד הורים בדור {g - 1}: {otherParents.length ? otherParents.slice(0, 3).map((p, i) => (
                    <span key={p.id}>{i > 0 && ' · '}<button onClick={() => openGroup(p.id)}>{p.name}</button></span>
                  )) : 'אין'}{otherParents.length > 3 && ` · ועוד ${otherParents.length - 3}`}</span>
                </div>
                {kids}
              </div>
            )}
          </div>
        )
      })}
    </>
  )

  const legend = (
    <div className="leg">
      <span><i style={{ background: 'var(--v)' }} />אושר</span>
      <span><i style={{ background: 'var(--pl)' }} />ממתין</span>
      <span><i style={{ background: 'var(--r)' }} />נפסל</span>
    </div>
  )

  const curNode = cur ? ix.byId.get(cur) : undefined
  const curD = cur ? ix.desc.get(cur) ?? 0 : 0

  return (
    <div className="lad" dir="rtl">
      <style>{LADDER_CSS}</style>
      <div className="wrap">
        {top}
        {head}
        <div className="grid">
          <section className="card">{card}</section>
          <section className="viz">
            <div className="ph"><div><b>סולם דורות</b><span>דור 1 למעלה, דור {ix.maxGen} למטה · עובדים דור אחרי דור</span></div>{legend}</div>
            {ladder(true)}
            <p className="lnote">הנתונים בכל דור כוללים את כל העץ. הפס מראה איזה חלק מהדור מאושר.</p>
          </section>
        </div>
      </div>

      {modal === 'rej' && curNode && (
        <div className="lay" onClick={() => setModal(null)}>
          <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="lad-rej" onClick={e => e.stopPropagation()}>
            <h3 id="lad-rej">לדחות את הענף של {curNode.name}?</h3>
            <ul>
              <li className="rd"><b>{fmt(curD + 1)} צמתים</b><span>{curNode.name} ו-{fmt(curD)} הצמתים שמתחתיו יסומנו כפסולים</span></li>
              <li><b>זכאות</b><span>סטטוס הזכאות של המשפחות לא משתנה</span></li>
              <li><b>מייל</b><span>לא יוצא אוטומטית. שליחה רק מכפתור במסך המשפחה</span></li>
              <li><b>ביטול</b><span>אפשר לבטל מיד אחרי הדחייה</span></li>
            </ul>
            <div className="acts">
              <button className="no solid" onClick={() => act('confirm')} autoFocus>דחה {fmt(curD + 1)} צמתים <kbd>Enter</kbd></button>
              <button className="gh" onClick={() => act('close')}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'all' && (
        <div className="lay" onClick={() => setModal(null)}>
          <div className="dlg wide" role="dialog" aria-modal="true" aria-labelledby="lad-all" onClick={e => e.stopPropagation()}>
            <div className="hdr">
              <h3 id="lad-all">כל הדורות, בסדר יורד</h3>
              <button className="x" onClick={() => act('close')} aria-label="סגור">
                <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>
              </button>
            </div>
            {ladder(false)}
            <p className="lnote">סה״כ בעץ: {fmt(totals.v)} מאושרים · {fmt(totals.p)} ממתינים. לחיצה על דור פותחת את הקבוצה הראשונה שלו.</p>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undoId && canEdit && <button onClick={() => undoDecision(toast.undoId as string)}>בטל</button>}
        </div>
      )}
    </div>
  )
}
