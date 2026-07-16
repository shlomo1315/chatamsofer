'use client'
import { useState } from 'react'
import { ShieldCheck, Loader2, X } from 'lucide-react'
import { useCan } from '@/components/StaffPermissions'
import ReliabilityView, { useReliability } from './LineageReliabilityView'

/** כפתור קצר בכותרת הכרטסת — פותח סקירת יוחסין דרך הסוכן במודאל. */
export default function LineageReliabilityHeaderButton({ beneficiaryId }: { beneficiaryId: string }) {
  const canView = useCan('lineage', 'view')
  const [open, setOpen] = useState(false)
  const { loading, err, res, run } = useReliability(beneficiaryId)
  if (!canView) return null

  const openAndRun = () => { setOpen(true); run() }

  return (
    <>
      <button onClick={openAndRun}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-3 py-2">
        <ShieldCheck size={15} /> בדוק אמינות (AI)
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <ShieldCheck size={17} className="text-indigo-500" />
                <h3 className="font-bold text-slate-900">סקירת יוחסין דרך הסוכן</h3>
                <span className="text-[11px] text-slate-400">(סקירה בלבד)</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="p-5">
              {loading && <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center"><Loader2 size={16} className="animate-spin" /> סוקר את קו היוחסין…</div>}
              {err && <p className="text-sm text-rose-600 py-4 text-center">{err}</p>}
              {res && <ReliabilityView res={res} />}
              {res && (
                <button onClick={run} disabled={loading}
                  className="mt-4 w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg py-2">
                  <ShieldCheck size={14} /> סקירה מחדש
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
