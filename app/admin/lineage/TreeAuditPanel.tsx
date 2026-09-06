'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ביקורת תקינות העץ — "האם סדר הדורות באמת נכון".
//
// 🔴 מה שהוביל לזה: משתמש הצביע על משפחה שבה דור 3 רשום "רבי אברהם שמואל
// בנימין ורחל פריי" — החתן קיבל את שמו של *חותנו* (הכתב סופר). החתן האמיתי
// קיים בעץ אבל מסומן 'ממתין', בעוד הרשומה השגויה מסומנת 'מאושר'.
//
// הבדיקה חשפה שהמקרה אינו בודד: 211 מתוך 357 ה"מאושרים" (59%) הגיעו
// מייבוא שסימן אותם verified אוטומטית — כלומר איש לא אישר אותם מעולם.
// המסך הזה מציג את כל סוגי התקלות, ממוין לפי כמה תלוי בהן.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, RefreshCw, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import QuickChainModal from './QuickChainModal'

interface Finding {
  kind: string; nodeId: string; name: string; generation: number
  status: string; detail: string; families: number; descendants: number
}
interface SummaryRow {
  kind: string; title: string; why: string
  severity: 'high' | 'medium'; count: number
}

const SEV: Record<string, { bg: string; border: string; fg: string }> = {
  high: { bg: '#FEF2F2', border: '#FECACA', fg: '#B91C1C' },
  medium: { bg: '#FFFBEB', border: '#FDE68A', fg: '#B45309' },
}

const STATUS_LABEL: Record<string, string> = {
  verified: 'מאושר', pending: 'ממתין', rejected: 'נדחה',
}

export default function TreeAuditPanel({ onLocate }: { onLocate?: (id: string) => void }) {
  const toast = useToast()
  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [findings, setFindings] = useState<Finding[]>([])
  const [checked, setChecked] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState<string | null>(null)
  const [quickId, setQuickId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lineage/audit', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'הביקורת נכשלה')
      setSummary(d.summary ?? [])
      setFindings(d.findings ?? [])
      setChecked(d.checkedNodes ?? 0)
      setTotal(d.totalFindings ?? 0)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הביקורת נכשלה')
    } finally { setLoading(false) }
  }, [toast])

  // ⚠️ טעינה אסינכרונית בעלייה — הכלל מסמן גם את הדפוס התקין הזה.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const visible = useMemo(
    () => (kind ? findings.filter(f => f.kind === kind) : findings),
    [findings, kind],
  )
  const active = summary.find(s => s.kind === kind)

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
            <ShieldAlert size={18} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">ביקורת תקינות העץ</h3>
            <p className="text-[11px] text-slate-500">
              נבדקו {checked.toLocaleString('he-IL')} צמתים · {total.toLocaleString('he-IL')} ממצאים
            </p>
          </div>
        </div>
        <button onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          <RefreshCw size={13} /> בדיקה מחדש
        </button>
      </div>

      {total === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 size={16} className="text-green-600" />
          <p className="text-xs text-green-800">לא נמצאו תקלות מבניות בעץ.</p>
        </div>
      )}

      {/* ── סוגי הממצאים ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {summary.filter(s => s.count > 0).map(s => {
          const c = SEV[s.severity]
          const on = kind === s.kind
          return (
            <button key={s.kind} onClick={() => setKind(on ? null : s.kind)}
              className={`rounded-xl border p-3 text-right transition-all ${on ? 'ring-2 ring-indigo-300' : ''}`}
              style={{ background: c.bg, borderColor: c.border }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold" style={{ color: c.fg }}>{s.title}</span>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold tabular-nums"
                  style={{ color: c.fg }}>{s.count.toLocaleString('he-IL')}</span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{s.why}</p>
            </button>
          )
        })}
      </div>

      {/* ── הרשימה ── */}
      {kind && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-700">{active?.title} — {visible.length} ממצאים</p>
            <button onClick={() => setKind(null)}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
              הצג הכל
            </button>
          </div>
          {/* ⚠️ ממוין לפי השפעה — ממצא שתלויים בו אלף צמתים קודם לבודד. */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {visible.slice(0, 200).map(f => (
              <div key={`${f.kind}-${f.nodeId}`}
                className="flex items-center gap-2.5 border-b border-slate-100 px-3 py-2 last:border-0">
                <AlertTriangle size={13} className="flex-shrink-0 text-amber-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{f.name}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-slate-500">
                    <span className="rounded bg-slate-100 px-1 font-bold">דור {f.generation}</span>
                    <span>{STATUS_LABEL[f.status] ?? f.status}</span>
                    <span className="text-slate-400">· {f.detail}</span>
                    {f.descendants > 0 && <span className="text-amber-700">· {f.descendants} צאצאים תלויים</span>}
                    {f.families > 0 && <span className="font-bold text-rose-700">· {f.families} משפחות</span>}
                  </span>
                </span>
                {onLocate && (
                  <button onClick={() => onLocate(f.nodeId)}
                    className="flex-shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 hover:border-indigo-300 hover:text-indigo-600">
                    הצג בעץ
                  </button>
                )}
              </div>
            ))}
            {visible.length > 200 && (
              <p className="py-2 text-center text-[11px] text-slate-400">
                מוצגים 200 מתוך {visible.length}
              </p>
            )}
          </div>
        </div>
      )}

      {!kind && total > 0 && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          לחצו על סוג ממצא כדי לראות את הרשימה. הממצאים ממוינים לפי <b>כמה תלוי בהם</b> —
          משפחות קודם, ואז מספר הצאצאים בענף.
        </p>
      )}

      {quickId && (
        <QuickChainModal beneficiaryId={quickId} onClose={() => setQuickId(null)} onDeleted={() => { void load() }} />
      )}
    </div>
  )
}
