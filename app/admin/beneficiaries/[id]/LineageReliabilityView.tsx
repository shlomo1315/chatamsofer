'use client'
import { useState, useCallback } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react'

export type Band = 'high' | 'medium' | 'low'
export interface Result {
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

export const BANDS: Record<Band, { bg: string; text: string; ring: string; Icon: typeof CheckCircle2 }> = {
  high: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'border-emerald-200', Icon: CheckCircle2 },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'border-amber-200', Icon: HelpCircle },
  low: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'border-rose-200', Icon: AlertTriangle },
}

/** קריאה ל-API הסקירה — משותף לפאנל בטאב ולכפתור בכותרת. */
export function useReliability(beneficiaryId: string) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<Result | null>(null)
  const run = useCallback(async () => {
    setLoading(true); setErr(''); setRes(null)
    try {
      const r = await fetch(`/api/admin/lineage-reliability?beneficiaryId=${encodeURIComponent(beneficiaryId)}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'שגיאה בסקירה'); return }
      setRes(d as Result)
    } catch { setErr('שגיאת רשת — נסו שוב') }
    finally { setLoading(false) }
  }, [beneficiaryId])
  return { loading, err, res, run }
}

/** תצוגת תוצאת הסקירה — עובדתית, ללא המלצה לאשר/לא לאשר. */
export default function ReliabilityView({ res }: { res: Result }) {
  const band = res.band ? BANDS[res.band] : BANDS.medium
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-3 rounded-xl border ${band.ring} ${band.bg} px-4 py-3`}>
        <band.Icon size={22} className={band.text} />
        <div className="flex-1">
          <p className={`text-base font-bold ${band.text}`}>{res.label} · ציון {res.score}/100</p>
          {res.anchor
            ? <p className="text-xs text-slate-500 mt-0.5">עוגן מאומת: {res.anchor.name} (דור {res.anchor.generation})</p>
            : <p className="text-xs text-slate-500 mt-0.5">אין עוגן מאומת בעץ</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white border border-slate-200 py-2">
          <p className="text-lg font-extrabold text-slate-800">{res.trunkFamilies ?? 0}</p>
          <p className="text-[11px] text-slate-500">משפחות על הענף</p>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 py-2">
          <p className="text-lg font-extrabold text-slate-800">{res.lineFamilies ?? 0}</p>
          <p className="text-[11px] text-slate-500">על אותה שורה</p>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 py-2">
          <p className="text-lg font-extrabold text-slate-800">{res.newNodesAdded ?? 0}</p>
          <p className="text-[11px] text-slate-500">דורות חדשים</p>
        </div>
      </div>

      {!!res.reasons?.length && (
        <ul className="space-y-1.5">
          {res.reasons.map((rs, i) => (
            <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
              <span className="text-slate-300 mt-1">•</span><span>{rs}</span>
            </li>
          ))}
        </ul>
      )}

      {!!res.siblingLines?.length && (
        <div className="rounded-lg bg-white border border-slate-200 p-3">
          <p className="text-[11px] font-semibold text-slate-500 mb-1.5">שורות אחרות על אותו ענף:</p>
          <div className="flex flex-wrap gap-1.5">
            {res.siblingLines.map((s, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{s.name} · {s.count}</span>
            ))}
          </div>
        </div>
      )}

      {res.disclaimer && <p className="text-[11px] text-slate-400 italic">{res.disclaimer}</p>}
    </div>
  )
}
