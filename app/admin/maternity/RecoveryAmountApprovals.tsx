'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2, HandCoins } from 'lucide-react'

export type PendingAmount = {
  id: string
  recovery_amount: number | null
  recovery_home: string | null
  recovery_amount_at: string | null
  motherName: string
  babyName: string | null
}

const ils = (n?: number | null) => (n != null ? `₪${Number(n).toLocaleString('he-IL')}` : '—')
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')

export default function RecoveryAmountApprovals({ items }: { items: PendingAmount[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  if (!items.length) return null

  const decide = async (aidId: string, action: 'approve' | 'reject') => {
    setBusy(aidId); setErr('')
    try {
      const r = await fetch('/api/admin/maternity/recovery-amount-decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aidId, action }),
      })
      if (!r.ok) { const d = await r.json(); setErr(d.error || 'שגיאה'); setBusy(null); return }
      router.refresh()
    } catch { setErr('שגיאת רשת') }
    setBusy(null)
  }

  return (
    <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/60 flex items-center gap-2">
        <HandCoins size={18} className="text-amber-600" />
        <h2 className="font-semibold text-slate-900">סכומי החלמה לאישור</h2>
        <span className="text-xs font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">{items.length}</span>
      </div>
      {err && <p className="px-5 pt-3 text-sm text-red-600">{err}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {['שם היולדת', 'תינוק', 'בית החלמה', 'סכום שמומש', 'נשלח בתאריך', 'פעולות'].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map(it => {
              const b = busy === it.id
              return (
                <tr key={it.id} className="hover:bg-amber-50/30">
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{it.motherName}</td>
                  <td className="px-4 py-3 text-slate-700">{it.babyName ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{it.recovery_home ?? '—'}</td>
                  <td className="px-4 py-3 font-bold text-emerald-700">{ils(it.recovery_amount)}</td>
                  <td className="px-4 py-3 text-slate-500 ltr-num">{fmt(it.recovery_amount_at)}</td>
                  <td className="px-4 py-3">
                    {b ? <Loader2 size={15} className="animate-spin text-slate-400" /> : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => decide(it.id, 'approve')}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5"><Check size={14} /> אשר</button>
                        <button onClick={() => decide(it.id, 'reject')}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-2.5 py-1.5"><X size={13} /> דחה</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
