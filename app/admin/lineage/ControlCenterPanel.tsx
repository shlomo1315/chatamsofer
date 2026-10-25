'use client'

// ─────────────────────────────────────────────────────────────────────────────
// מרכז בקרה לעץ הדורות — מונים עם פילוח, וסקירה משפחה-משפחה.
// הנתונים כולם מ-/api/admin/lineage/control-center (אותן סריקות של המסכים
// הקיימים). כל מונה לחיץ ומסנן את רשימת הסקירה; הסימון "נבדקה, תקין" נשמר.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, RefreshCw, ChevronRight, ChevronLeft, CheckCircle2, AlertTriangle, ExternalLink, Search } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { issueLabel, computeTreeHealth, STATUS_ORDER, type FamilyReview, type ControlSummary, type IssueKind, type ParallelGroup } from '@/lib/lineageControlCenter'

export type ControlTool = 'dupReview' | 'mergeCenter' | 'unlinked' | 'ghosts' | 'selfDups' | 'health' | 'safeMerge'

const STATUS_LABEL: Record<string, string> = {
  pending: 'ממתין לאישור ראשוני', deep_review: 'בדיקה מעמיקה', docs_returned: 'מסמכים הוחזרו',
  docs_pending: 'מסמכים ממתינים', approved: 'אושרו', rejected: 'נדחו',
}

/** איזה כלי קיים מטפל בכל סוג בעיה. */
const TOOL_FOR: Partial<Record<IssueKind, { tool: ControlTool; label: string }>> = {
  dup: { tool: 'dupReview', label: 'סקירת כפילויות' },
  dup_branch: { tool: 'dupReview', label: 'סקירת כפילויות' },
  parallel_dup: { tool: 'mergeCenter', label: 'מרכז מיזוגים' },
  unlinked: { tool: 'unlinked', label: 'נרשמים לא מקושרים' },
  ghost_card: { tool: 'ghosts', label: 'צמתי רפאים' },
  ghost_child: { tool: 'ghosts', label: 'צמתי רפאים' },
  self_dup: { tool: 'selfDups', label: 'דור אחרון כפול' },
  depth_gap: { tool: 'health', label: 'בריאות העץ' },
  no_chain: { tool: 'health', label: 'בריאות העץ' },
  node_rejected: { tool: 'health', label: 'בריאות העץ' },
}

interface Filter {
  status: string | 'all'
  issue: IssueKind | 'any' | 'none' | 'all'
  unreviewedOnly: boolean
  q: string
}
const EMPTY: Filter = { status: 'all', issue: 'all', unreviewedOnly: false, q: '' }

interface Data { summary: ControlSummary; families: FamilyReview[]; parallelGroups: ParallelGroup[]; marksReady: boolean; isAdmin: boolean }

function Counter({ label, value, sub, onClick, active, tone }: {
  label: string; value: number; sub?: string; onClick?: () => void; active?: boolean; tone?: 'bad' | 'ok'
}) {
  return (
  <button onClick={onClick} disabled={!onClick}
    className={`rounded-xl border px-3 py-2 text-right transition-colors ${
      active ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white hover:border-slate-400'
    } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}>
    <div className={`text-xl font-black tabular-nums ${active ? '' : tone === 'bad' && value > 0 ? 'text-red-700' : tone === 'ok' ? 'text-emerald-700' : 'text-slate-800'}`}>
      {value.toLocaleString('he-IL')}
    </div>
    <div className="text-xs font-bold">{label}</div>
    {sub && <div className={`text-[11px] ${active ? 'text-slate-200' : 'text-slate-500'}`}>{sub}</div>}
  </button>
  )
}

export default function ControlCenterPanel({ onOpenTool, onLocate, reloadSignal = 0 }: {
  /** עולה אחרי מיזוג, כדי לרענן את המספרים והסטטוס */
  reloadSignal?: number
  onOpenTool?: (tool: ControlTool) => void
  onLocate?: (nodeId: string) => void
}) {
  const toast = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [filter, setFilterRaw] = useState<Filter>(EMPTY)
  const [idx, setIdx] = useState(0)
  const setFilter = (u: Filter | ((f: Filter) => Filter)) => { setFilterRaw(u); setIdx(0) }
  const [saving, setSaving] = useState(false)
  const [showPar, setShowPar] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const r = await fetch('/api/admin/lineage/control-center', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'שגיאה בטעינה')
      setData(j)
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה בטעינה') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    fetch('/api/admin/lineage/control-center', { cache: 'no-store' })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'שגיאה בטעינה'); setData(j) })
      .catch(e => setErr(e instanceof Error ? e.message : 'שגיאה בטעינה'))
      .finally(() => setLoading(false))
  }, [reloadSignal])

  const list = useMemo(() => {
    if (!data) return []
    const q = filter.q.trim()
    return data.families.filter(f => {
      if (filter.status !== 'all' && f.status !== filter.status) return false
      if (filter.issue === 'any' && f.ok) return false
      if (filter.issue === 'none' && !f.ok) return false
      if (filter.issue !== 'all' && filter.issue !== 'any' && filter.issue !== 'none'
        && !f.issues.some(i => i.kind === filter.issue)) return false
      if (filter.unreviewedOnly && f.reviewedAt) return false
      if (q && !f.name.includes(q)) return false
      return true
    })
  }, [data, filter])

  const cur = list[Math.min(idx, Math.max(0, list.length - 1))] as FamilyReview | undefined
  const go = useCallback((d: number) => setIdx(i => Math.max(0, Math.min(list.length - 1, i + d))), [list.length])

  // מקשי חיצים — לא כשמקלידים בשדה חיפוש. RTL: חץ ימין = הקודם.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowLeft') go(1)
      else if (e.key === 'ArrowRight') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  async function mark(f: FamilyReview, reviewed: boolean) {
    setSaving(true)
    try {
      const r = await fetch('/api/admin/lineage/control-center', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, reviewed }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'השמירה נכשלה')
      setData(d => d && ({
        ...d,
        summary: { ...d.summary, reviewedOk: d.summary.reviewedOk + (reviewed ? (f.reviewedAt ? 0 : 1) : (f.reviewedAt ? -1 : 0)) },
        families: d.families.map(x => x.id === f.id
          ? { ...x, reviewedAt: j.lineage_reviewed_at, reviewedBy: j.lineage_reviewed_by } : x),
      }))
      if (reviewed) toast.success('סומנה כנבדקה, תקין')
      if (reviewed && filter.unreviewedOnly) { /* הרשימה מתקצרת — האינדקס כבר מצביע על הבאה */ }
      else if (reviewed) go(1)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'השמירה נכשלה') }
    finally { setSaving(false) }
  }

  if (loading && !data) return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="animate-spin" size={16} /> טוען את מרכז הבקרה… (עד חצי דקה)</div>
  if (err && !data) return <div className="p-4 text-sm text-red-700">{err} <button onClick={load} className="underline">נסה שוב</button></div>
  if (!data) return null
  const s = data.summary
  const health = computeTreeHealth(s)

  const setF = (p: Partial<Filter>) => setFilter({ ...EMPTY, ...p })
  const statuses = STATUS_ORDER.filter(k => s.byStatus[k])

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── פס בקרה קבוע: נשאר גלוי בגלילה ── */}
      <div className="sticky top-0 z-20 -mx-1 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur"
        role="status" aria-label="בריאות העץ">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full border-4 text-sm font-black tabular-nums ${
              health.tone === 'ok' ? 'border-emerald-600 text-emerald-800' : health.tone === 'warn' ? 'border-amber-500 text-amber-800' : 'border-red-600 text-red-800'
            }`}>{health.score}</div>
            <div>
              <div className="text-sm font-black text-slate-900">בריאות העץ</div>
              <div className="text-xs text-slate-600">{health.familiesWithIssue.toLocaleString('he-IL')} משפחות עם בעיה מתוך {s.families.toLocaleString('he-IL')}</div>
            </div>
          </div>
          <div className="min-w-[8rem] flex-1">
            <div className="mb-1 flex justify-between text-[11px] text-slate-600">
              <span>נבדקו, תקין</span><span className="tabular-nums">{health.reviewedPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${health.reviewedPct}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {([['כפילויות', s.dup.groups], ['רישום מקביל', s.parallel.groups], ['לא מקושרות', s.unlinked]] as const).map(([l, v]) => (
              <span key={l} className={`rounded-full px-2.5 py-1 font-bold tabular-nums ${v > 0 ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
                {l}: {v.toLocaleString('he-IL')}
              </span>
            ))}
          </div>
          <button onClick={load} aria-label="רענן" className="mr-auto text-slate-500 hover:text-slate-800">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {!data.marksReady && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          סימון &quot;נבדקה, תקין&quot; עדיין לא פעיל: המיגרציה של העמודות טרם הורצה במסד.
        </div>
      )}

      {/* ── חלק א: מונים ── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-800">סטטוס משפחות ({s.families.toLocaleString('he-IL')})</h3>
          <button onClick={load} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> רענן
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {statuses.map(k => (
            <Counter key={k} label={STATUS_LABEL[k] ?? k} value={s.byStatus[k].total}
              sub={`${s.byStatus[k].withIssue.toLocaleString('he-IL')} עם בעיה · ${s.byStatus[k].withDup.toLocaleString('he-IL')} עם כפילות`}
              active={filter.status === k && filter.issue === 'all'}
              onClick={() => setF({ status: k })} />
          ))}
          <Counter label="לא מקושרות לעץ" value={s.unlinked} tone="bad"
            active={filter.issue === 'unlinked'} onClick={() => setF({ issue: 'unlinked' })} />
          <Counter label="נבדקו, תקין" value={s.reviewedOk} tone="ok"
            sub={`מתוך ${s.families.toLocaleString('he-IL')}`} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-black text-slate-800">
          כפילויות: {s.dup.groups.toLocaleString('he-IL')} קבוצות · {s.dup.familiesAffected.toLocaleString('he-IL')} משפחות מושפעות
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {(['A', 'B', 'C', 'D'] as const).map(l => (
            <Counter key={l} label={`רמה ${l}`} value={s.dup.byLevel[l]}
              sub={l === 'A' || l === 'B' ? 'עורך או מנהל' : 'מנהל בלבד'}
              onClick={() => onOpenTool?.('dupReview')} />
          ))}
          <Counter label="פתוח לעורכים" value={s.dup.editorGroups} onClick={() => onOpenTool?.('dupReview')} />
          <Counter label="מנהל בלבד" value={s.dup.adminOnlyGroups} onClick={() => onOpenTool?.('dupReview')} />
          <Counter label="דור אחרון כפול" value={s.selfDup} onClick={() => onOpenTool?.('selfDups')} />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          קבוצות שהוכרעו &quot;לא כפול&quot; אינן נספרות. צמתי רפאים: {s.ghost.rows.toLocaleString('he-IL')} ({s.ghost.familiesAffected.toLocaleString('he-IL')} משפחות).
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Counter label="משפחות עם כפילות" value={s.dup.familiesAffected} tone="bad"
            active={filter.issue === 'dup'} onClick={() => setF({ issue: 'dup' })} />
          {(['parallel_dup', 'depth_gap', 'no_chain', 'self_dup', 'ghost_card', 'ghost_child', 'node_rejected'] as IssueKind[]).map(k => (
            <Counter key={k} label={issueLabel(k)} value={s.issueCounts[k]} tone="bad"
              active={filter.issue === k} onClick={() => setF({ issue: k })} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-black text-slate-800">
          כפילויות רישום מקביל: {s.parallel.groups.toLocaleString('he-IL')} קבוצות · {s.parallel.familiesAffected.toLocaleString('he-IL')} משפחות מושפעות
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Counter label="קבוצות עותקים" value={s.parallel.groups} sub={`${s.parallel.nodes.toLocaleString('he-IL')} צמתים`} tone="bad"
            active={filter.issue === 'parallel_dup'} onClick={() => setF({ issue: 'parallel_dup' })} />
          <Counter label="בטוחות למיזוג" value={s.parallel.safeGroups} sub="אותו אב, שם ודור" tone="ok"
            onClick={() => onOpenTool?.('safeMerge')} />
          <Counter label="דורשות החלטה" value={s.parallel.needsDecision} sub={`${s.parallel.multiCard} עם כמה כרטסות`}
            onClick={() => onOpenTool?.('mergeCenter')} />
          <Counter label="יתאחדו (בטוחות)" value={s.parallel.safeRemovable} sub={`עץ: ${s.parallel.treeNodes.toLocaleString('he-IL')} ← ${s.parallel.afterSafe.toLocaleString('he-IL')}`} tone="ok" />
          <Counter label="יתאחדו (הכול)" value={s.parallel.removable} sub={`עץ אחרי מיזוג מלא: ${s.parallel.afterAll.toLocaleString('he-IL')}`} />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          אותו שם בדיוק באותו דור, גם תחת הורים שונים — לא נחשבים אנשים שונים. אותם אשכולות של מרכז המיזוגים.
        </p>
        <button onClick={() => setShowPar(v => !v)} className="mt-1 text-xs font-bold text-violet-700 underline">
          {showPar ? 'הסתר קבוצות' : 'הצג קבוצות (הגדולות ראשונות)'}
        </button>
        {showPar && (
          <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto">
            {[...data.parallelGroups].sort((a, b) => b.removable - a.removable).slice(0, 60).map(g => (
              <li key={g.key} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-slate-900">{g.name}</span>
                  <span className="text-xs text-slate-500">דור {g.generation} · {g.nodes.length} צמתים · {g.familiesAffected} משפחות</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${g.safe ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                    {g.safe ? 'בטוח למיזוג' : g.risk === 'multi_card' ? 'כמה כרטסות, דורש החלטה' : 'הורים שונים, דורש בדיקה'}
                  </span>
                  <button onClick={() => onOpenTool?.(g.safe ? 'safeMerge' : 'mergeCenter')}
                    className="mr-auto text-xs font-bold text-violet-700 underline">
                    {g.safe ? 'מיזוג בטוח' : 'מרכז מיזוגים / תכנית מיזוג'}
                  </button>
                </div>
                <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                  {g.nodes.map(n => (
                    <li key={n.id}>
                      תחת {n.parentName} · {n.families} משפחות מקושרות · {n.levelsBelow} דורות מתחתיו · {n.levelsAbove} אבות כפולים מעליו
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── חלק ב: סקירה משפחה-משפחה ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
            <option value="all">כל הסטטוסים</option>
            {statuses.map(k => <option key={k} value={k}>{STATUS_LABEL[k] ?? k}</option>)}
          </select>
          <select value={filter.issue} onChange={e => setFilter(f => ({ ...f, issue: e.target.value as Filter['issue'] }))}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
            <option value="all">הכול</option>
            <option value="any">יש בעיה</option>
            <option value="none">תקינות</option>
            {(Object.keys(s.issueCounts) as IssueKind[]).map(k => <option key={k} value={k}>{issueLabel(k)}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={filter.unreviewedOnly}
              onChange={e => setFilter(f => ({ ...f, unreviewedOnly: e.target.checked }))} /> רק שטרם נבדקו
          </label>
          <div className="relative">
            <Search size={12} className="absolute right-2 top-2 text-slate-400" />
            <input value={filter.q} onChange={e => setFilter(f => ({ ...f, q: e.target.value }))}
              placeholder="חיפוש שם משפחה" className="rounded-lg border border-slate-200 py-1.5 pl-2 pr-7 text-xs" />
          </div>
          <span className="mr-auto text-xs text-slate-500">{list.length.toLocaleString('he-IL')} במסנן</span>
        </div>

        {!cur ? (
          <div className="p-6 text-center text-sm text-slate-500">אין משפחות במסנן הזה.</div>
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <button onClick={() => go(-1)} disabled={idx <= 0}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold disabled:opacity-40">
                <ChevronRight size={14} /> הקודמת
              </button>
              <span className="text-xs text-slate-500 tabular-nums">{Math.min(idx, list.length - 1) + 1} / {list.length.toLocaleString('he-IL')} · חצים במקלדת</span>
              <button onClick={() => go(1)} disabled={idx >= list.length - 1}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold disabled:opacity-40">
                הבאה <ChevronLeft size={14} />
              </button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h4 className="text-lg font-black text-slate-900">{cur.name}</h4>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{STATUS_LABEL[cur.status] ?? cur.status}</span>
              {cur.ok
                ? <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800"><CheckCircle2 size={12} /> תקין</span>
                : <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800"><AlertTriangle size={12} /> דורש טיפול</span>}
              {cur.reviewedAt && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                  נבדקה ע&quot;י {cur.reviewedBy ?? '—'} · {new Date(cur.reviewedAt).toLocaleDateString('he-IL')}
                </span>
              )}
            </div>
            {cur.deepReason && <p className="mb-2 text-xs text-amber-800">סיבת הבדיקה המעמיקה: {cur.deepReason}</p>}

            <div className="mb-3 rounded-xl bg-slate-50 p-3">
              <div className="mb-1 text-xs font-bold text-slate-600">שרשרת יוחסין{cur.generation != null ? ` (דור ${cur.generation})` : ''}</div>
              {cur.chain.length ? (
                <ol className="space-y-0.5 text-sm">
                  {cur.chain.map((n, i) => (
                    <li key={i} style={{ paddingRight: `${i * 12}px` }} className={i === cur.chain.length - 1 ? 'font-black text-slate-900' : 'text-slate-600'}>
                      {i + 1}. {n}
                    </li>
                  ))}
                </ol>
              ) : <div className="text-sm text-slate-500">לא מקושרת לצומת בעץ.</div>}
            </div>

            {cur.issues.length > 0 && (
              <ul className="mb-3 space-y-1.5">
                {cur.issues.map((i, k) => {
                  const t = TOOL_FOR[i.kind]
                  return (
                    <li key={k} className="flex flex-wrap items-center gap-2 rounded-lg border border-red-100 bg-red-50/60 px-3 py-1.5 text-sm">
                      <span className="font-bold text-red-800">{i.label}</span>
                      {i.detail && <span className="text-xs text-slate-600">{i.detail}</span>}
                      {i.adminOnly && !data.isAdmin && <span className="text-[11px] text-slate-500">(מנהל בלבד)</span>}
                      {t && onOpenTool && (
                        <button onClick={() => onOpenTool(t.tool)} className="mr-auto text-xs font-bold text-violet-700 underline">
                          פתח: {t.label}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <a href={`/admin/beneficiaries/${cur.id}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <ExternalLink size={12} /> כרטסת המשפחה
              </a>
              {cur.nodeId && onLocate && (
                <button onClick={() => onLocate(cur.nodeId!)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  הצג בעץ
                </button>
              )}
              {data.marksReady && (cur.reviewedAt ? (
                <button onClick={() => mark(cur, false)} disabled={saving}
                  className="mr-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-50">
                  בטל סימון
                </button>
              ) : (
                <button onClick={() => mark(cur, true)} disabled={saving}
                  className="mr-auto flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} נבדקה, תקין
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
