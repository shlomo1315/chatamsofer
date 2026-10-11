'use client'

// ─────────────────────────────────────────────────────────────────────────────
// סקירת כפילויות — קבוצה אחרי קבוצה, מהר (12.10, לבקשת המשתמש).
//
// כלל אחד (lib/lineageDupGroups): אחים עם אותו בעל + שם משפחה. כל קבוצה מוצגת
// לבד, עם מה שצריך כדי להכריע בשנייה: שמות, משפחות משויכות, ילדים, בן/חתן.
// מקשים: Enter / M = מיזוג · N = לא כפול · S / ← = דלג · Z = ביטול המיזוג האחרון.
//
// 🔴 רמות C/D ובן/חתן סותרים — מנהל בלבד (גם השרת אוכף).
// 🔴 "לא כפול" נשמר — הקבוצה לא תחזור.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, GitMerge, X, SkipForward, Undo2, Users, ShieldAlert } from 'lucide-react'

type DupNodeView = { id: string; name: string; status: string | null; relation: string | null; families: number; children: number; childNames: string[] }
type Group = {
  key: string; parentId: string | null; parentName: string | null; generation: number
  level: 'A' | 'B' | 'C' | 'D'; relationConflict: boolean; adminOnly: boolean; canDecide: boolean
  nodeIds: string[]; keepId: string; suggestedName: string; nodes: DupNodeView[]
}
type Counts = { total: number; A: number; B: number; C: number; D: number; adminOnly: number }

const LEVEL: Record<Group['level'], { label: string; hint: string; cls: string }> = {
  A: { label: 'A · זהה', hint: 'אותו שם אחרי נרמול ("ומרת" מול "ו")', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  B: { label: 'B · אישה חסרה', hint: 'באחד מהם חסר שם האישה', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  C: { label: 'C · אישה חלקית', hint: 'שם האישה חלקי ("רחל" מול "חוה רחל") — מנהל בלבד', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  D: { label: 'D · נשים שונות', hint: 'שני שמות אישה שונים — כתיב שונה, או נישואים שניים. מנהל בלבד', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
}
const rel = (r: string | null) => (r === 'son' ? 'בן' : r === 'son_in_law' ? 'חתן' : '—')
const he = (n: number) => n.toLocaleString('he-IL')

export default function DupReviewPanel({ onDone }: { onDone?: () => void }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<'all' | Group['level'] | 'rel'>('all')
  const [idx, setIdx] = useState(0)
  const [keepId, setKeepId] = useState('')
  const [name, setName] = useState('')
  const [lastBatch, setLastBatch] = useState<{ batchId: string; name: string } | null>(null)
  const [done, setDone] = useState({ merged: 0, notDup: 0 })

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const r = await fetch('/api/admin/lineage/dup-review')
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'טעינה נכשלה'); return }
      setGroups(d.groups ?? []); setCounts(d.counts ?? null); setIsAdmin(!!d.isAdmin)
    } catch { setErr('שגיאת רשת') }
    finally { setLoading(false) }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const list = useMemo(() => groups.filter(g =>
    filter === 'all' ? true : filter === 'rel' ? g.relationConflict : g.level === filter), [groups, filter])
  const cur = list[Math.min(idx, Math.max(0, list.length - 1))] ?? null

  // ברירת המחדל לכל קבוצה חדשה — השורד והשם המלא שהשרת הציע.
  const curKey = cur?.key ?? ''
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (cur) { setKeepId(cur.keepId); setName(cur.suggestedName); setErr('') } }, [curKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const removeCur = () => { setGroups(gs => gs.filter(g => g.key !== cur?.key)) }

  const act = useCallback(async (action: 'merge' | 'not_duplicate') => {
    if (!cur || busy || !cur.canDecide) return
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/admin/lineage/dup-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, key: cur.key, keepId, name }),
      })
      const d = await r.json()
      if (!r.ok) {
        setErr(d.error || 'הפעולה נכשלה')
        if (d.stale) await load()
        return
      }
      if (action === 'merge') { setLastBatch({ batchId: d.batchId, name }); setDone(x => ({ ...x, merged: x.merged + 1 })) }
      else setDone(x => ({ ...x, notDup: x.notDup + 1 }))
      removeCur()
      onDone?.()
    } catch { setErr('שגיאת רשת') }
    finally { setBusy(false) }
  }, [cur, busy, keepId, name, load, onDone]) // eslint-disable-line react-hooks/exhaustive-deps

  const undo = useCallback(async () => {
    if (!lastBatch || busy) return
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/admin/lineage/merge/undo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: lastBatch.batchId }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'הביטול נכשל'); return }
      setLastBatch(null); setDone(x => ({ ...x, merged: Math.max(0, x.merged - 1) }))
      await load(); onDone?.()
    } catch { setErr('שגיאת רשת') }
    finally { setBusy(false) }
  }, [lastBatch, busy, load, onDone])

  const skip = useCallback(() => setIdx(i => (list.length ? (i + 1) % list.length : 0)), [list.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && e.key !== 'Enter') return
      if (e.key === 'Enter' || e.key.toLowerCase() === 'm' || e.key === 'צ') { e.preventDefault(); void act('merge') }
      else if (e.key.toLowerCase() === 'n' || e.key === 'מ') { e.preventDefault(); void act('not_duplicate') }
      else if (e.key.toLowerCase() === 's' || e.key === 'ד' || e.key === 'ArrowLeft') { e.preventDefault(); skip() }
      else if (e.key.toLowerCase() === 'z' || e.key === 'ז') { e.preventDefault(); void undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [act, skip, undo])

  const chips: { k: typeof filter; l: string; n: number }[] = [
    { k: 'all', l: 'הכל', n: groups.length },
    { k: 'A', l: 'A · זהה', n: groups.filter(g => g.level === 'A').length },
    { k: 'B', l: 'B · אישה חסרה', n: groups.filter(g => g.level === 'B').length },
    { k: 'C', l: 'C · אישה חלקית', n: groups.filter(g => g.level === 'C').length },
    { k: 'D', l: 'D · נשים שונות', n: groups.filter(g => g.level === 'D').length },
    { k: 'rel', l: 'בן מול חתן', n: groups.filter(g => g.relationConflict).length },
  ]

  return (
    <div dir="rtl" className="mb-4 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><GitMerge size={17} className="text-indigo-600" /> סקירת כפילויות — קבוצה אחרי קבוצה</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            אחים (אותו הורה) עם אותו בעל ושם משפחה. מקשים: <b>Enter</b> מיזוג · <b>N</b> לא כפול · <b>S</b> דלג · <b>Z</b> ביטול המיזוג האחרון
          </p>
        </div>
        <div className="text-xs text-slate-600 flex gap-3">
          <span>מוזגו: <b className="text-emerald-700">{he(done.merged)}</b></span>
          <span>לא כפול: <b className="text-slate-700">{he(done.notDup)}</b></span>
          {counts && <span>נותרו: <b>{he(groups.length)}</b></span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {chips.map(c => (
          <button key={c.k} type="button" onClick={() => { setFilter(c.k); setIdx(0) }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === c.k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
            {c.l} <span className="opacity-75">({he(c.n)})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-8 justify-center"><Loader2 size={16} className="animate-spin" /> סורק את העץ…</div>
      ) : !cur ? (
        <p className="py-8 text-center text-sm text-emerald-700 font-semibold">אין קבוצות בסינון הזה ✓</p>
      ) : (
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2 text-xs">
            <span className="font-bold text-slate-500">קבוצה {he(Math.min(idx, list.length - 1) + 1)} מתוך {he(list.length)}</span>
            <span className={`rounded-full border px-2 py-0.5 font-bold ${LEVEL[cur.level].cls}`} title={LEVEL[cur.level].hint}>{LEVEL[cur.level].label}</span>
            {cur.relationConflict && <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-bold text-rose-700">בן מול חתן</span>}
            <span className="text-slate-500">דור {cur.generation} · תחת <b className="text-slate-700">{cur.parentName ?? '—'}</b></span>
          </div>
          <p className="text-[11px] text-slate-500 mb-2">{LEVEL[cur.level].hint}</p>

          <div className="grid gap-2 sm:grid-cols-2">
            {cur.nodes.map(n => {
              const keep = n.id === keepId
              return (
                <button key={n.id} type="button" onClick={() => setKeepId(n.id)}
                  className={`text-right rounded-xl border-2 p-3 transition-colors ${keep ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold text-slate-800">{n.name}</span>
                    {keep && <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">נשאר</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                    <span>{n.status === 'verified' ? '✓ מאושר' : 'ממתין'}</span>
                    <span>{rel(n.relation)}</span>
                    <span className="inline-flex items-center gap-1"><Users size={11} /> {he(n.families)} משפחות</span>
                    <span>{he(n.children)} ילדים</span>
                  </div>
                  {n.childNames.length > 0 && (
                    <div className="mt-1 text-[10px] text-slate-400 leading-relaxed">ילדים: {n.childNames.join(' · ')}{n.children > n.childNames.length ? ' …' : ''}</div>
                  )}
                  <span onClick={e => { e.stopPropagation(); setName(n.name) }}
                    className="mt-1.5 inline-block text-[10px] font-semibold text-indigo-600 hover:underline cursor-pointer">השתמש בשם הזה</span>
                </button>
              )
            })}
          </div>

          <label className="mt-3 block">
            <span className="text-[11px] font-bold text-slate-600">השם שיישאר (המלא, עם האישה):</span>
            <input value={name} onChange={e => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>

          {!cur.canDecide && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
              <ShieldAlert size={13} /> קבוצה זו מוכרעת על ידי מנהל בלבד
            </p>
          )}
          {err && <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{err}</div>}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !cur.canDecide} onClick={() => { void act('merge') }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />} מיזוג (Enter)
            </button>
            <button type="button" disabled={busy || !cur.canDecide} onClick={() => { void act('not_duplicate') }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              <X size={14} /> לא כפול (N)
            </button>
            <button type="button" disabled={busy} onClick={skip}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
              <SkipForward size={14} /> דלג (S)
            </button>
            {lastBatch && (
              <button type="button" disabled={busy} onClick={() => { void undo() }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 mr-auto">
                <Undo2 size={14} /> ביטול המיזוג האחרון (Z) — {lastBatch.name}
              </button>
            )}
          </div>
          {!isAdmin && counts && counts.adminOnly > 0 && (
            <p className="mt-2 text-[10px] text-slate-400">{he(counts.adminOnly)} קבוצות ממתינות להכרעת מנהל.</p>
          )}
        </div>
      )}
    </div>
  )
}
