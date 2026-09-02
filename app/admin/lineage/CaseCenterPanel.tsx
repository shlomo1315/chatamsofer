'use client'

// ─────────────────────────────────────────────────────────────────────────────
// מרכז בקרת העץ — כל תקלות העץ ברשימה אחת, כל אחת עם ההכרעה שלה.
//
// 🔴 הבעיה שזה פותר: הכלים היו פזורים בתשעה פאנלים, ואף אחד לא זכר מה כבר
// נבדק. מקרה שנדחה ("בדקתי, שני אנשים שונים") חזר בטעינה הבאה, ואחרי שעת
// עבודה הרשימות נראו באותו אורך. אי אפשר היה לדעת מה נשאר.
//
// שני מצבי עבודה, כי הם עונים על שתי שאלות שונות:
//   · טבלה — "איפה אני עומד": כל המקרים, פס סטטוס בקצה כל שורה, סינון.
//   · מיקוד — "מה עושים עם זה": מקרה אחד גדול עם כל הנתונים והכרעה, הבא/הקודם.
//
// ⚠️ הפאנל מנהל *החלטות*, לא מבצע שינויי מבנה. המיזוג עצמו נעשה בכלים
// הקיימים — הפרדה מכוונת: החלטה אפשר לבטל, מיזוג הרבה פחות.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Loader2, RefreshCw, Check, X, Clock, ChevronRight, ChevronLeft,
  LayoutGrid, Focus, Users, UserCheck, AlertTriangle, ExternalLink,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { KIND_LABEL, type CaseKind, type CaseDecision } from '@/lib/lineageCaseKey'

interface CaseNode {
  id: string; name: string; status: string | null
  children: number; beneficiaries: number
}
interface Case {
  key: string
  kind: CaseKind
  title: string
  parentName: string | null
  generation: number | null
  nodes: CaseNode[]
  severity: 'high' | 'medium' | 'low'
  decision: CaseDecision | null
  note: string | null
  decidedAt: string | null
}
interface Summary {
  total: number; open: number; done: number
  byKind: Record<string, { total: number; open: number }>
}

// פס הסטטוס בקצה השורה. הצבע הוא הסימן — תגית טקסט בכל שורה הופכת
// סריקה של 50 שורות לקריאה של 50 מילים.
const DECISION_BAR: Record<string, string> = {
  open: '#cbd5e1',       // אפור — טרם הוכרע
  later: '#f59e0b',      // ענבר — סומן לחזרה
  resolved: '#059669',   // ירוק — טופל
  dismissed: '#64748b',  // אפור כהה — נבדק, אינו בעיה
}
const SEVERITY_DOT: Record<Case['severity'], { color: string; label: string }> = {
  high: { color: '#dc2626', label: 'דורש תשומת לב — יש משפחות או ילדים תלויים' },
  medium: { color: '#f59e0b', label: 'בינוני' },
  low: { color: '#94a3b8', label: 'נמוך — דמיון שמות בלבד' },
}

type Filter = 'open' | 'all' | 'done'

export default function CaseCenterPanel() {
  const toast = useToast()
  const [cases, setCases] = useState<Case[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('open')
  const [kindFilter, setKindFilter] = useState<CaseKind | 'all'>('all')
  // null = מצב טבלה. מספר = אינדקס המקרה במצב מיקוד.
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lineage/cases', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'טעינת הממצאים נכשלה')
      setCases(d.cases ?? [])
      setSummary(d.summary ?? null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת הממצאים נכשלה')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => cases.filter(c => {
    const isOpen = c.decision === null || c.decision === 'later'
    if (filter === 'open' && !isOpen) return false
    if (filter === 'done' && isOpen) return false
    if (kindFilter !== 'all' && c.kind !== kindFilter) return false
    return true
  }), [cases, filter, kindFilter])

  // ⚠️ המיקוד עוקב אחרי הרשימה המסוננת. אם ההכרעה הוציאה את המקרה מהסינון,
  // נשארים באותו אינדקס — כלומר המקרה הבא נכנס למקומו, וזו ההתנהגות הרצויה
  // בעבודה רצופה: מכריעים ומיד רואים את הבא.
  const focused = focusIdx !== null ? visible[Math.min(focusIdx, visible.length - 1)] ?? null : null

  useEffect(() => { setNote(focused?.note ?? '') }, [focused?.key, focused?.note])

  const decide = async (c: Case, decision: CaseDecision | null, withNote?: string) => {
    setSaving(c.key)
    try {
      const res = await fetch('/api/admin/lineage/cases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: c.key, kind: c.kind, decision,
          note: withNote ?? note, nodeIds: c.nodes.map(n => n.id),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שמירת ההכרעה נכשלה')
      setCases(prev => prev.map(x => x.key === c.key
        ? { ...x, decision, note: (withNote ?? note) || null, decidedAt: new Date().toISOString() }
        : x))
      setSummary(prev => {
        if (!prev) return prev
        const wasOpen = c.decision === null || c.decision === 'later'
        const nowOpen = decision === null || decision === 'later'
        if (wasOpen === nowOpen) return prev
        const delta = nowOpen ? 1 : -1
        return { ...prev, open: prev.open + delta, done: prev.done - delta }
      })
      setNote('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שמירת ההכרעה נכשלה')
    } finally {
      setSaving(null)
    }
  }

  const openFocus = (c: Case) => setFocusIdx(visible.findIndex(x => x.key === c.key))
  const step = (d: 1 | -1) => setFocusIdx(i => {
    if (i === null) return null
    return Math.max(0, Math.min(visible.length - 1, i + d))
  })

  const pct = summary && summary.total > 0
    ? Math.round((summary.done / summary.total) * 100)
    : 0

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" dir="rtl">
      {/* ── כותרת + התקדמות ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-800">מרכז בקרת העץ</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            כל תקלות העץ במקום אחד. ההכרעה נשמרת — מה שטופל לא יחזור לרשימה.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setFocusIdx(focusIdx === null ? 0 : null)}
            disabled={visible.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            {focusIdx === null ? <><Focus size={13} /> מצב מיקוד</> : <><LayoutGrid size={13} /> תצוגת טבלה</>}
          </button>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} סריקה מחדש
          </button>
        </div>
      </div>

      {summary && (
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-600">
              {summary.done} מתוך {summary.total} הוכרעו
            </span>
            <span className="text-xs font-extrabold text-emerald-700 ltr-num">{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
              style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* ── מסננים ── */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {([
          ['open', `פתוחים${summary ? ` (${summary.open})` : ''}`],
          ['done', `הוכרעו${summary ? ` (${summary.done})` : ''}`],
          ['all', 'הכול'],
        ] as [Filter, string][]).map(([v, label]) => (
          <button key={v} type="button" onClick={() => { setFilter(v); setFocusIdx(null) }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-colors ${
              filter === v
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
            }`}>
            {label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <button type="button" onClick={() => { setKindFilter('all'); setFocusIdx(null) }}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-colors ${
            kindFilter === 'all'
              ? 'bg-slate-700 text-white border-slate-700'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
          }`}>
          כל הסוגים
        </button>
        {summary && Object.entries(summary.byKind).map(([k, v]) => (
          <button key={k} type="button"
            onClick={() => { setKindFilter(k as CaseKind); setFocusIdx(null) }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-colors ${
              kindFilter === k
                ? 'bg-slate-700 text-white border-slate-700'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}>
            {KIND_LABEL[k as CaseKind] ?? k}
            <span className="mr-1.5 opacity-60 ltr-num">{v.open}/{v.total}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" /> סורק את העץ…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-10 text-center">
          <Check size={26} className="mx-auto mb-2 text-emerald-600" />
          <p className="text-sm font-bold text-emerald-800">
            {filter === 'open' ? 'אין מקרים פתוחים' : 'אין מקרים בסינון הזה'}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            {filter === 'open' ? 'כל מה שנסרק הוכרע.' : 'שנו את הסינון כדי לראות מקרים אחרים.'}
          </p>
        </div>
      ) : focused ? (
        <FocusView
          c={focused}
          index={Math.min(focusIdx ?? 0, visible.length - 1)}
          total={visible.length}
          note={note}
          onNote={setNote}
          saving={saving === focused.key}
          onDecide={(d) => void decide(focused, d)}
          onStep={step}
        />
      ) : (
        <CaseTable
          cases={visible}
          saving={saving}
          onOpen={openFocus}
          onDecide={(c, d) => void decide(c, d, c.note ?? '')}
        />
      )}
    </div>
  )
}

// ─── תצוגת טבלה ───────────────────────────────────────────────────────────────
function CaseTable({ cases, saving, onOpen, onDecide }: {
  cases: Case[]
  saving: string | null
  onOpen: (c: Case) => void
  onDecide: (c: Case, d: CaseDecision | null) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="text-right text-[11px] font-bold text-slate-500">
            <th className="px-3 py-2.5 w-1" />
            <th className="px-3 py-2.5">הממצא</th>
            <th className="px-3 py-2.5">סוג</th>
            <th className="px-3 py-2.5">תחת</th>
            <th className="px-3 py-2.5 text-center">תלויים</th>
            <th className="px-3 py-2.5 text-center">הכרעה</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cases.map(c => {
            const state = c.decision ?? 'open'
            const deps = c.nodes.reduce((s, n) => s + n.beneficiaries, 0)
            const kids = c.nodes.reduce((s, n) => s + n.children, 0)
            return (
              <tr key={c.key} className="group hover:bg-slate-50/70">
                {/* פס הסטטוס — הסימן העיקרי בסריקה מהירה */}
                <td className="p-0">
                  <div className="h-full w-1" style={{ background: DECISION_BAR[state], minHeight: 44 }} />
                </td>
                <td className="px-3 py-2.5">
                  <button type="button" onClick={() => onOpen(c)}
                    className="text-right font-bold text-slate-800 hover:text-indigo-700 hover:underline">
                    {c.title}
                  </button>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: SEVERITY_DOT[c.severity].color }}
                      title={SEVERITY_DOT[c.severity].label} />
                    <span className="text-[11px] text-slate-400">
                      {c.nodes.length} רשומות
                      {c.generation != null && ` · דור ${c.generation}`}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-600">{KIND_LABEL[c.kind] ?? c.kind}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{c.parentName ?? '—'}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-xs text-slate-600 ltr-num">
                    {deps > 0 && <span className="font-bold text-red-600">{deps} משפחות</span>}
                    {deps > 0 && kids > 0 && ' · '}
                    {kids > 0 && `${kids} ילדים`}
                    {deps === 0 && kids === 0 && '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <DecideButtons c={c} saving={saving === c.key} onDecide={onDecide} compact />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── מצב מיקוד ────────────────────────────────────────────────────────────────
function FocusView({ c, index, total, note, onNote, saving, onDecide, onStep }: {
  c: Case
  index: number
  total: number
  note: string
  onNote: (v: string) => void
  saving: boolean
  onDecide: (d: CaseDecision | null) => void
  onStep: (d: 1 | -1) => void
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => onStep(-1)} disabled={index === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30">
          <ChevronRight size={13} /> הקודם
        </button>
        <span className="text-xs font-bold text-slate-500 ltr-num">{index + 1} / {total}</span>
        <button type="button" onClick={() => onStep(1)} disabled={index >= total - 1}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30">
          הבא <ChevronLeft size={13} />
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
            {KIND_LABEL[c.kind] ?? c.kind}
          </span>
          {c.severity === 'high' && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
              <AlertTriangle size={11} /> יש תלויים — בדקו לפני מיזוג
            </span>
          )}
          {c.decision && (
            <span className="rounded-lg px-2 py-0.5 text-[11px] font-bold text-white"
              style={{ background: DECISION_BAR[c.decision] }}>
              {c.decision === 'resolved' ? 'טופל' : c.decision === 'dismissed' ? 'אינו בעיה' : 'לטיפול בהמשך'}
            </span>
          )}
        </div>

        <h4 className="text-lg font-extrabold text-slate-900">{c.title}</h4>
        {c.parentName && (
          <p className="mt-0.5 text-xs text-slate-500">
            תחת <span className="font-bold text-slate-700">{c.parentName}</span>
            {c.generation != null && ` · דור ${c.generation}`}
          </p>
        )}

        {/* הרשומות המעורבות — כאן ההכרעה נופלת */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {c.nodes.map(n => (
            <div key={n.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="font-bold text-slate-800 text-sm leading-snug">{n.name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <Users size={11} className="text-slate-400" />
                  <span className="ltr-num">{n.children}</span> ילדים
                </span>
                <span className="inline-flex items-center gap-1">
                  <UserCheck size={11} className={n.beneficiaries > 0 ? 'text-red-500' : 'text-slate-400'} />
                  <span className={`ltr-num ${n.beneficiaries > 0 ? 'font-bold text-red-600' : ''}`}>
                    {n.beneficiaries}
                  </span> משפחות
                </span>
                {n.status && (
                  <span className="rounded bg-white px-1.5 py-0.5 border border-slate-200">
                    {n.status === 'verified' ? 'מאומת' : n.status === 'pending' ? 'ממתין' : n.status}
                  </span>
                )}
              </div>
              <a href={`/admin/lineage?focus=${n.id}`} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
                <ExternalLink size={10} /> פתח בעץ
              </a>
            </div>
          ))}
        </div>

        {/* הערה — למה הוכרע כך. ⚠️ זה מה שמאפשר לחזור למקרה בעוד חודש ולהבין. */}
        <div className="mt-4">
          <label className="mb-1 block text-[11px] font-bold text-slate-500">
            הערה (למה הוכרע כך)
          </label>
          <input value={note} onChange={e => onNote(e.target.value)}
            placeholder="למשל: בדקתי מול המשרד — שני אחים שונים"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
        </div>

        <div className="mt-3">
          <DecideButtons c={c} saving={saving} onDecide={(_, d) => onDecide(d)} />
        </div>
      </div>
    </div>
  )
}

// ─── כפתורי ההכרעה ────────────────────────────────────────────────────────────
function DecideButtons({ c, saving, onDecide, compact }: {
  c: Case
  saving: boolean
  onDecide: (c: Case, d: CaseDecision | null) => void
  compact?: boolean
}) {
  const btn = (d: CaseDecision, label: string, Icon: typeof Check, cls: string) => {
    const active = c.decision === d
    return (
      <button key={d} type="button" disabled={saving}
        // ⚠️ לחיצה על הכרעה פעילה מבטלת אותה — בלי דרך חזרה, סימון בטעות
        // מעלים את המקרה ואין איך להחזירו.
        onClick={() => onDecide(c, active ? null : d)}
        title={active ? 'לחצו לביטול ההכרעה' : label}
        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-40 ${
          active ? cls : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
        }`}>
        <Icon size={11} />
        {!compact && label}
      </button>
    )
  }
  return (
    <div className={`flex items-center gap-1.5 ${compact ? 'justify-center' : ''}`}>
      {saving && <Loader2 size={12} className="animate-spin text-slate-400" />}
      {btn('resolved', 'טופל', Check, 'border-emerald-300 bg-emerald-50 text-emerald-700')}
      {btn('dismissed', 'אינו בעיה', X, 'border-slate-400 bg-slate-100 text-slate-700')}
      {btn('later', 'בהמשך', Clock, 'border-amber-300 bg-amber-50 text-amber-700')}
    </div>
  )
}
