'use client'
import { useState } from 'react'
import { ShieldCheck, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { useCan } from '@/components/StaffPermissions'
import ReliabilityView, { useReliability } from './LineageReliabilityView'

export default function LineageReliabilityPanel({ beneficiaryId }: { beneficiaryId: string }) {
  const canView = useCan('lineage', 'view')
  const { loading, err, res, run } = useReliability(beneficiaryId)
  // תוצאת הסקירה ניתנת לכיווץ — נפתחת אוטומטית בסקירה חדשה
  const [collapsed, setCollapsed] = useState(false)
  if (!canView) return null

  const doRun = () => { setCollapsed(false); run() }

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-indigo-500" />
          <span className="text-sm font-semibold text-slate-700">סקירת יוחסין דרך הסוכן</span>
          <span className="text-[11px] text-slate-400">(סקירה בלבד)</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* כפתור כיווץ/הרחבה — רק כשיש תוצאה */}
          {res && (
            <button onClick={() => setCollapsed(c => !c)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5"
              title={collapsed ? 'הרחבה' : 'כיווץ'}>
              {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              {collapsed ? 'הצג' : 'כווץ'}
            </button>
          )}
          <button onClick={doRun} disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-3.5 py-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            {res ? 'סקירה מחדש' : 'סקור יוחסין'}
          </button>
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
      {res && !collapsed && <div className="mt-3"><ReliabilityView res={res} beneficiaryId={beneficiaryId} /></div>}
    </div>
  )
}
