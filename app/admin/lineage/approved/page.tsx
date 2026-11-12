'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  WINDOW_GENS, classifyLines, normForMatch, type ApprovedTreeNode,
} from '@/lib/lineageApprovedTree'
import { APPROVED_CSS } from './approved.css'

// ─────────────────────────────────────────────────────────────────────────────
// המאושרים בעץ — עץ חזותי של 5 הדורות הראשונים, בדיוק לפי המוקאפ שאושר.
// "מאושר" = שורה ב-lineage_approved_ref; השרת מאמת מחדש כל אישור ("אב לפני ילד").
// ─────────────────────────────────────────────────────────────────────────────

type Node = ApprovedTreeNode
const API = '/api/admin/lineage/approved-tree'

const pl = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`)
const split = (n: string) => { const i = n.indexOf(' · '); return i < 0 ? { t: n, s: '' } : { t: n.slice(i + 3), s: n.slice(0, i) } }
const short = (n: string) => split(n).t

function Hl({ text, q }: { text: string; q: string }) {
  const k = q.trim()
  if (!k || !text.includes(k)) return <>{text}</>
  const parts = text.split(k)
  return <>{parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 && <mark>{k}</mark>}</span>)}</>
}

function hasIn(kids: Map<string, Node[]>, n: Node, f: (x: Node) => boolean): boolean {
  return f(n) || (kids.get(n.id) ?? []).some(k => hasIn(kids, k, f))
}

interface Undo { keys: string[]; created: string[] }

export default function ApprovedTreePage() {
  const [nodes, setNodes] = useState<Node[] | null>(null)
  const [err, setErr] = useState('')
  const [gen, setGen] = useState(0)
  const [from, setFrom] = useState(1)
  const [maxGen, setMaxGen] = useState(1)
  const [col, setCol] = useState<Set<string>>(new Set())
  const [onlyPend, setOnlyPend] = useState(false)
  const [q, setQ] = useState('')
  const [mobile, setMobile] = useState(false)
  const [flash, setFlash] = useState<string[]>([])
  const [toast, setToast] = useState<{ msg: string; undo: Undo; id: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<{ g: number; p: string | null; text: string } | null>(null)
  const toastSeq = useRef(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ⚡ stale-while-revalidate: מציגים מיד את הנתונים האחרונים (sessionStorage) ומרעננים ברקע.
  const CK = (f: number) => `approved-tree:${f}`
  const remember = (d: { nodes: Node[]; maxGen: number; from: number }) => {
    try { sessionStorage.setItem(CK(d.from), JSON.stringify(d)) } catch { /* מכסה מלאה — לא קריטי */ }
  }
  const apply = (d: { nodes: Node[]; maxGen: number; from: number }) => { setNodes(d.nodes); setMaxGen(d.maxGen); setFrom(d.from); remember(d) }
  const goTo = useCallback((f: number) => {
    try {
      const c = sessionStorage.getItem(CK(f))
      if (c) {
        const d = JSON.parse(c)
        // אסינכרוני בכוונה: setState סינכרוני בתוך אפקט גורם לרינדור כפול.
        queueMicrotask(() => { setNodes(d.nodes); setMaxGen(d.maxGen); setFrom(d.from); setGen(0); setCol(new Set()) })
      }
    } catch { /* אין מטמון */ }
    fetch(`${API}?from=${f}`).then(r => r.json()).then(d => {
      if (d.error) { setErr(d.error); return }
      setNodes(d.nodes); setMaxGen(d.maxGen); setFrom(d.from); setGen(0); setCol(new Set())
      try { sessionStorage.setItem(CK(d.from), JSON.stringify(d)) } catch { /* ignore */ }
    }).catch(() => setErr('שגיאה בטעינת העץ'))
  }, [])
  useEffect(() => { goTo(1) }, [goTo])
  useEffect(() => {
    const mq = window.matchMedia('(max-width:720px)')
    const f = () => setMobile(mq.matches)
    f(); mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])

  const byId = useMemo(() => new Map((nodes ?? []).map(n => [n.id, n])), [nodes])
  const kids = useMemo(() => {
    const m = new Map<string, Node[]>()
    for (const n of nodes ?? []) if (n.parent_id) { const l = m.get(n.parent_id); if (l) l.push(n); else m.set(n.parent_id, [n]) }
    return m
  }, [nodes])
  const roots = useMemo(() => (nodes ?? []).filter(n => !n.parent_id), [nodes])
  const blocked = useCallback((n: Node) => !n.ok && (n.parent_id ? !byId.get(n.parent_id)?.ok : n.parent_ok === false), [byId])
  const stOf = (n: Node) => n.ok ? 'ok' : blocked(n) ? 'blk' : 'pend'

  const nq = q.trim() ? normForMatch(q) : ''
  const has = useCallback((n: Node, f: (x: Node) => boolean) => hasIn(kids, n, f), [kids])
  const visible = useCallback((n: Node) =>
    (!onlyPend || has(n, y => !y.ok)) && (!nq || has(n, y => normForMatch(y.name).includes(nq))), [onlyPend, nq, has])
  const visKids = useCallback((n: Node) => col.has(n.id) ? [] : (kids.get(n.id) ?? []).filter(visible), [col, kids, visible])

  const stats = (g: number) => {
    const a = (nodes ?? []).filter(x => x.generation === g)
    return { ok: a.filter(x => x.ok).length, pend: a.filter(x => !x.ok).length }
  }

  const showToast = (msg: string, undo: Undo) => {
    clearTimeout(toastTimer.current)
    setToast({ msg, undo, id: ++toastSeq.current })
    toastTimer.current = setTimeout(() => setToast(null), 10000)
  }
  const flashNow = (ids: string[]) => { setFlash(ids); setTimeout(() => setFlash([]), 1500) }

  async function post(body: Record<string, unknown>) {
    setBusy(true)
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, ...body }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'הפעולה נכשלה'); setTimeout(() => setErr(''), 5000); return null }
      return d
    } catch { setErr('הפעולה נכשלה'); setTimeout(() => setErr(''), 5000); return null }
    finally { setBusy(false) }
  }

  async function approve(ids: string[]) {
    ids = ids.filter(id => { const x = byId.get(id); return x && !x.ok && !blocked(x) })
    if (!ids.length || busy) return
    const d = await post({ action: 'approve', ids })
    if (!d) return
    apply(d); flashNow(d.approved.map((a: { id: string }) => a.id))
    if (d.approved.length) {
      const first = byId.get(d.approved[0].id)
      showToast(d.approved.length === 1 ? `אושר: ${short(first?.name ?? '')}` : `אושרו ${d.approved.length} שמות`,
        { keys: d.approved.map((a: { key: string }) => a.key), created: [] })
    }
  }

  async function undo() {
    if (!toast || busy) return
    const d = await post({ action: 'undo', keys: toast.undo.keys, created: toast.undo.created })
    setToast(null)
    if (d) apply(d)
  }

  // ── חלון הוספה ──
  const parentsOf = (g: number) => (nodes ?? []).filter(x => x.generation === g - 1 && x.ok)
  const openModal = (o: { g?: number; p?: string } = {}) => {
    const g = Math.min(Math.max(o.g ?? (gen > 1 ? gen : from + 2), 2), maxGen + 1)
    const ps = parentsOf(g)
    setModal({ g, p: o.p ?? ps[0]?.id ?? null, text: '' })
  }
  const lines = modal ? modal.text.split('\n').map(s => s.trim()).filter(Boolean) : []
  const results = useMemo(
    () => modal && nodes ? classifyLines(lines, nodes, modal.g, modal.p) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modal?.text, modal?.g, modal?.p, nodes])
  const cnt = { found: 0, new: 0, red: 0, skip: 0 }
  results.forEach(r => { if (r) cnt[r.kind]++ })
  const canAdd = cnt.found + cnt.new

  async function confirmAdd() {
    if (!modal || !modal.p || !canAdd || busy) return
    const nf = Math.max(from, modal.g - WINDOW_GENS + 1)
    const d = await post({ action: 'add', generation: modal.g, parentId: modal.p, names: lines, from: nf })
    if (!d) return
    const g = modal.g, p = modal.p
    setModal(null); setGen(g); apply(d)
    setCol(s => { const n = new Set(s); n.delete(p); return n })
    const ids = d.approved.map((a: { id: string }) => a.id)
    flashNow(ids)
    if (ids.length) showToast(`${ids.length === 1 ? 'נוסף שם אחד' : `נוספו ${ids.length} שמות`} לדור ${g}`,
      { keys: d.approved.map((a: { key: string }) => a.key), created: d.created })
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (modal) {
        if (e.key === 'Escape') setModal(null)
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirmAdd() }
        return
      }
      if ((e.target as HTMLElement).matches('input,textarea,select')) return
      if (e.key === 'n' || e.key === 'N' || e.key === 'מ') { e.preventDefault(); openModal() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  if (err && !nodes) return <div className="p-8 text-center text-rose-600">{err}</div>
  if (!nodes) {
    return (
      <div className="p-6 animate-pulse" aria-busy="true" aria-label="טוען את העץ">
        <div className="flex gap-10">
          {[0, 1, 2, 3, 4].map(c => (
            <div key={c} className="flex flex-col gap-4" style={{ width: 188 }}>
              <div className="h-6 rounded bg-slate-200" />
              {Array.from({ length: Math.max(1, 5 - c) }, (_, i) => <div key={i} className="h-[70px] rounded-lg bg-slate-100" />)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── פריסת העץ ──
  const cw = mobile ? 164 : 188, gap = mobile ? 30 : 40, rh = mobile ? 82 : 84, top = 58, ch = rh - 14
  const pos: Record<string, number> = {}
  let row = 0
  const place = (x: Node) => {
    const vk = visKids(x)
    if (!vk.length) pos[x.id] = row++
    else { vk.forEach(place); pos[x.id] = mobile ? pos[vk[0].id] : (pos[vk[0].id] + pos[vk[vk.length - 1].id]) / 2 }
  }
  roots.filter(visible).forEach(place)
  const cols = Array.from({ length: WINDOW_GENS }, (_, i) => from + i).filter(g => g <= maxGen)
  const W = cols.length * cw + (cols.length - 1) * gap, H = top + Math.max(row, 1) * rh + 8
  const rx = (g: number) => (g - from) * (cw + gap)
  const cy = (id: string) => top + pos[id] * rh + rh / 2

  const pend = nodes.filter(x => !x.ok).length
  const genPend = gen ? nodes.filter(x => x.generation === gen && !x.ok && !blocked(x)) : []

  const act = (x: Node, s: string) => {
    if (s === 'pend') return <button className="ap" onClick={() => approve([x.id])} disabled={busy}>אישור</button>
    if (s === 'ok') {
      return <button className="ad" onClick={() => openModal({ g: x.generation + 1, p: x.id })}
        aria-label={`הוספת צאצא מאושר תחת ${short(x.name)}`}>+ צאצא</button>
    }
    return null
  }

  const paths: React.ReactNode[] = []
  const cards: React.ReactNode[] = []
  for (const id of Object.keys(pos)) {
    const x = byId.get(id)!, s = stOf(x), { t, s: sub } = split(x.name)
    const ksAll = (kids.get(id) ?? []).filter(visible), c = col.has(id), nk = (kids.get(id) ?? []).length
    if (x.parent_id && pos[x.parent_id] !== undefined) {
      const pl_ = W - rx(x.generation - 1) - cw, mid = pl_ - gap / 2, crx = W - rx(x.generation)
      const py = cy(x.parent_id), y = cy(id), r = Math.min(6, Math.abs(y - py) / 2), dir = y > py ? 1 : -1
      const d = Math.abs(y - py) < 1 ? `M${pl_} ${py}H${crx}`
        : `M${pl_} ${py}H${mid + r}Q${mid} ${py} ${mid} ${py + dir * r}V${y - dir * r}Q${mid} ${y} ${mid - r} ${y}H${crx}`
      paths.push(<path key={id} d={d} fill="none" stroke={s === 'ok' ? '#B9B09F' : s === 'pend' ? '#D9A94F' : '#CFC6B5'}
        strokeWidth={1.5} strokeDasharray={s === 'ok' ? undefined : '4 3'} />)
    }
    cards.push(
      <div key={id} className={`tn ${s}${x.generation === 1 ? ' root' : ''}${flash.includes(id) ? ' flash' : ''}`}
        style={{ right: rx(x.generation), top: top + pos[id] * rh + 7, width: cw, height: ch }}>
        <div className={`t${sub ? ' one' : ''}`}><Hl text={t} q={q} /></div>
        {sub && <div className="s"><Hl text={sub} q={q} /></div>}
        <div className="ft">
          {s === 'pend' ? <>בעץ · לא מאושר{act(x, s)}</>
            : s === 'blk' ? 'מחכה לאישור האב'
            : <>{nk ? pl(nk, 'ילד אחד', 'ילדים') : 'מאושר'}{act(x, s)}</>}
        </div>
        {ksAll.length > 0 && (
          <button className={`tg${c ? ' c' : ''}`} aria-expanded={!c} aria-label={`${c ? 'פתיחת' : 'סגירת'} הענף`}
            onClick={() => setCol(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })}>
            {c ? `+${ksAll.length}` : '−'}
          </button>
        )}
      </div>)
  }

  const emptyMsg = onlyPend
    ? 'כל הענפים מאושרים. אפשר להוסיף שמות חדשים בכפתור "הוספת מאושרים".'
    : 'לא נמצא שם כזה בעץ. אפשר להוסיף אותו בכפתור "הוספת מאושרים".'

  const modalParents = modal ? parentsOf(modal.g) : []

  return (
    <div className="apv" dir="rtl">
      <style>{APPROVED_CSS}</style>

      <div className="head">
        <div className="grow">
          <h1>המאושרים בעץ</h1>
          <p>חמשת הדורות של הקובץ המאושר. מי שמאושר כאן נצבע ירוק בכל כרטסת.</p>
        </div>
        <button className="btn pri" onClick={() => openModal()}>+ הוספת מאושרים <kbd>N</kbd></button>
      </div>

      <div className="tiles">
        {cols.map(g => {
          const s = stats(g), t = s.ok + s.pend
          return (
            <button key={g} className={`tile${gen === g ? ' on' : ''}`} aria-pressed={gen === g} onClick={() => setGen(gen === g ? 0 : g)}>
              <span className="g">דור {g}</span>
              <span className="n num">{s.ok}<small>מאושרים</small></span>
              <span className={`st${s.pend ? '' : ' done'}`}>{s.pend ? pl(s.pend, 'ממתין אחד', 'ממתינים') : 'הכול מאושר'}</span>
              <span className="bar"><i style={{ width: `${t ? s.ok / t * 100 : 0}%` }} /></span>
            </button>
          )
        })}
      </div>

      <div className="tools">
        <label className="search">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="4.5" /><path d="m14 14-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש שם בעץ" aria-label="חיפוש שם" />
        </label>
        <label className="chk"><input type="checkbox" checked={onlyPend} onChange={e => setOnlyPend(e.target.checked)} />רק ענפים עם ממתינים</label>
        <div className="legend">
          <span><i className="lg ok" />מאושר</span><span><i className="lg pend" />בעץ, לא מאושר</span><span><i className="lg blk" />מחכה לאב</span>
        </div>
      </div>

      <div className="tbar">
        <span><b>{pl(pend, 'ממתין אחד', 'ממתינים')}</b> במסגרת מקווקוות. &quot;אישור&quot; בכרטיס, או &quot;+ צאצא&quot; להוספה.</span>
        {from > 1 && <button className="btn gh" onClick={() => goTo(Math.max(1, from - WINDOW_GENS + 1))}>→ חזרה לדורות {Math.max(1, from - WINDOW_GENS + 1)}–{from}</button>}
        {from + WINDOW_GENS - 1 < maxGen && <button className="btn gh" onClick={() => goTo(from + WINDOW_GENS - 1)}>המשך לדורות הבאים ←</button>}
        <span className="hint">גוללים הצידה לדורות הבאים ←</span>
        {genPend.length > 0 && (
          <button className="btn gh" disabled={busy} onClick={() => approve(genPend.map(x => x.id))}>
            אישור {genPend.length === 1 ? 'הממתין' : `כל ${genPend.length} הממתינים`} בדור {gen}
          </button>
        )}
      </div>
      <div className="tw">
        {row ? (
          <div className="tree" style={{ width: W, height: H }}>
            {cols.map(g => {
              const s = stats(g)
              return (
                <div key={g} className={`band${gen === g ? ' on' : ''}`} style={{ right: rx(g) - gap / 2 + 4, width: cw + gap - 8 }}>
                  <button className="bh" onClick={() => setGen(gen === g ? 0 : g)}>
                    <b>דור {g}</b>
                    <small className="num">{s.ok} מאושרים{s.pend > 0 && <> · <em>{s.pend} ממתינים</em></>}</small>
                  </button>
                </div>
              )
            })}
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>{paths}</svg>
            {cards}
          </div>
        ) : <div className="empty"><b>אין כאן תוצאות</b>{emptyMsg}</div>}
      </div>

      {err && <div className="apv-toast" role="alert"><span>{err}</span></div>}

      {modal && (
        <div className="apv-ov" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="md" role="dialog" aria-modal="true" aria-labelledby="apv-mt">
            <header>
              <div><h2 id="apv-mt">הוספת מאושרים</h2><p>שם בכל שורה. אפשר להדביק רשימה שלמה.</p></div>
              <button className="x" aria-label="סגירה" onClick={() => setModal(null)}>×</button>
            </header>
            <div className="fr">
              <label className="fl">דור
                <select value={modal.g} onChange={e => {
                  const g = +e.target.value
                  setModal({ ...modal, g, p: parentsOf(g)[0]?.id ?? null })
                }}>
                  {Array.from({ length: WINDOW_GENS }, (_, i) => Math.max(2, from + 1) + i).filter(g => g <= maxGen + 1).map(g => <option key={g} value={g}>דור {g}</option>)}
                </select>
              </label>
              <label className="fl">תחת האב
                <select value={modal.p ?? ''} onChange={e => setModal({ ...modal, p: e.target.value })}>
                  {modalParents.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            </div>
            <label className="fl">שמות
              <textarea autoFocus value={modal.text} onChange={e => setModal({ ...modal, text: e.target.value })}
                placeholder={'רבי יואל סופר\nרבי מאיר סופר'} />
            </label>
            <div className="pv">
              <h3>מה יקרה לכל שם</h3>
              {lines.length ? lines.map((l, i) => {
                const r = results[i]
                return r ? <div key={i} className="pr"><span>{l}</span><span className={`pill ${r.kind}`}>{r.label}</span></div> : null
              }) : <div className="pr"><span style={{ color: '#767C8A', fontWeight: 400 }}>התצוגה תופיע כאן אחרי שתכתוב או תדביק שמות.</span></div>}
            </div>
            <footer>
              <span className="sum">{lines.length
                ? [cnt.found && `${cnt.found} יאושרו`, cnt.new && `${cnt.new} חדשים`, cnt.red && `${cnt.red} לבדיקה, לא ייכנסו`, cnt.skip && `${cnt.skip} ידולגו`].filter(Boolean).join(' · ')
                : 'Ctrl+Enter לאישור'}</span>
              <button className="btn gh" onClick={() => setModal(null)}>ביטול</button>
              <button className="btn pri" disabled={!canAdd || !modal.p || busy} onClick={confirmAdd}>
                {canAdd ? `אישור ${canAdd === 1 ? 'שם אחד' : `${canAdd} שמות`} לדור ${modal.g}` : 'אין מה לאשר'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {toast && (
        <div className="apv-toast" key={toast.id}>
          <span>{toast.msg}</span><button onClick={undo}>ביטול</button><i />
        </div>
      )}
    </div>
  )
}
