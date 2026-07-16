'use client'
import { useState } from 'react'
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react'
import { useCan } from '@/components/StaffPermissions'

type Band = 'consistent' | 'review' | 'anomaly'
interface Result {
  registrant?: { name: string; status: string }
  anchor?: { name: string; generation: number } | null
  claimedLine?: string | null
  trunkFamilies?: number
  lineFamilies?: number
  siblingLines?: { name: string; count: number }[]
  newNodesAdded?: number
  score?: number
  band?: Band
  label?: string
  reasons?: string[]
  disclaimer?: string
}

const BANDS: Record<Band, { bg: string; text: string; ring: string; Icon: typeof CheckCircle2 }> = {
  consistent: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'border-emerald-200', Icon: CheckCircle2 },
  review: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'border-amber-200', Icon: HelpCircle },
  anomaly: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'border-rose-200', Icon: AlertTriangle },
}

export default function LineageReliabilityPanel({ beneficiaryId }: { beneficiaryId: string }) {
  const canView = useCan('lineage', 'view')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<Result | null>(null)

  if (!canView) return null

  const run = async () => {
    setLoading(true); setErr(''); setRes(null)
    try {
      const r = await fetch(`/api/admin/lineage-reliability?beneficiaryId=${encodeURIComponent(beneficiaryId)}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'שגיאה בבדיקה'); return }
      setRes(d as Result)
    } catch { setErr('שגיאת רשת — נסו שוב') }
    finally { setLoading(false) }
  }

  const band = res?.band ? BANDS[res.band] : null

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-indigo-500" />
          <span className="text-sm font-semibold text-slate-700">בדיקת אמינות יוחסין</span>
          <span className="text-[11px] text-slate-400">(ייעוצי — אינו מאשר)</span>
        </div>
        <button onClick={run} disabled={loading}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-3.5 py-1.5">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          {res ? 'בדיקה מחדש' : 'בדוק אמינות'}
        </button>
      </div>

      {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}

      {res && band && (
        <div className="mt-3 space-y-3">
          {/* Score + band */}
          <div className={`flex items-center gap-3 rounded-xl border ${band.ring} ${band.bg} px-4 py-3`}>
            <band.Icon size={22} className={band.text} />
            <div className="flex-1">
              <p className={`text-base font-bold ${band.text}`}>{res.label} · ציון {res.score}/100</p>
              {res.anchor
                ? <p className="text-xs text-slate-500 mt-0.5">עוגן מאומת: {res.anchor.name} (דור {res.anchor.generation})</p>
                : <p className="text-xs text-slate-500 mt-0.5">אין עוגן מאומת בעץ</p>}
            </div>
          </div>

          {/* Key numbers */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white border border-slate-200 py-2">
              <p className="text-lg font-extrabold text-slate-800">{res.trunkFamilies ?? 0}</p>
              <p className="text-[11px] text-slate-500">משפחות על הגזע</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 py-2">
              <p className="text-lg font-extrabold text-slate-800">{res.lineFamilies ?? 0}</p>
              <p className="text-[11px] text-slate-500">תומכות בשורה</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 py-2">
              <p className="text-lg font-extrabold text-slate-800">{res.newNodesAdded ?? 0}</p>
              <p className="text-[11px] text-slate-500">דורות חדשים</p>
            </div>
          </div>

          {/* Reasons */}
          {!!res.reasons?.length && (
            <ul className="space-y-1.5">
              {res.reasons.map((rs, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="text-slate-300 mt-1">•</span><span>{rs}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Sibling distribution */}
          {!!res.siblingLines?.length && (
            <div className="rounded-lg bg-white border border-slate-200 p-3">
              <p className="text-[11px] font-semibold text-slate-500 mb-1.5">שורות אחרות על אותו גזע:</p>
              <div className="flex flex-wrap gap-1.5">
                {res.siblingLines.map((s, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{s.name} · {s.count}</span>
                ))}
              </div>
            </div>
          )}

          {res.disclaimer && <p className="text-[11px] text-slate-400 italic">{res.disclaimer}</p>}
        </div>
      )}
    </div>
  )
}
