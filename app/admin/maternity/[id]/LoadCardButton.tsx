'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, Loader2, Check, AlertTriangle } from 'lucide-react'
import type { MaternityAid } from '@/types'

export default function LoadCardButton({ aid }: { aid: MaternityAid }) {
  const router = useRouter()
  const defaultAmount = (Number(aid.weekly_amount) || 0) * (Number(aid.total_weeks) || 0)
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const approved = aid.status === 'active'

  const handleLoad = async () => {
    setMsg(null)
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg({ type: 'err', text: 'יש להזין סכום תקין' })
      return
    }
    if (!confirm(`להטעין ₪${amt.toLocaleString('he-IL')} לכרטיס נדרים?`)) return
    setLoading(true)
    try {
      const res = await fetch('/api/nedarim/load-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aidId: aid.id, amount: amt }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) {
        setMsg({ type: 'err', text: data.error || 'ההטענה נכשלה' })
      } else {
        const created = data.familyCreated ? `המשפחה הוקמה בנדרים (מזהה ${data.clientId}). ` : ''
        setMsg({ type: 'ok', text: `${created}הכרטיס הוטען בהצלחה (₪${amt.toLocaleString('he-IL')}).` })
        router.refresh()
      }
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'שגיאה בלתי צפויה' })
    } finally {
      setLoading(false)
    }
  }

  if (!approved) {
    return (
      <p className="text-xs text-slate-400 mt-2">ניתן להטעין כרטיס רק לאחר אישור הלידה</p>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 text-sm">₪</span>
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="סכום הטענה"
            className="w-full pr-7 pl-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-700 ltr-num text-left focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
          />
        </div>
        <button
          onClick={handleLoad}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60 whitespace-nowrap"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />} הטען כרטיס
        </button>
      </div>
      {msg && (
        <div className={`flex items-start gap-1.5 text-xs rounded-lg px-2.5 py-1.5 ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.type === 'ok' ? <Check size={13} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  )
}
