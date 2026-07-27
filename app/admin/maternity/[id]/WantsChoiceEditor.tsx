'use client'
import { useState } from 'react'
import { CreditCard, Home, Check, Loader2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// עריכת בחירת ההטבות של היולדת (כרטיס מזון / בית החלמה) בכרטיס הלידה.
// שני צ'יפים לחיצים; חובה להשאיר לפחות אחד. נשמר דרך /api/admin/maternity/wants.
// ─────────────────────────────────────────────────────────────────────────────
export default function WantsChoiceEditor({
  aidId, initialFoodCard, initialRecovery,
}: {
  aidId: string
  initialFoodCard: boolean
  initialRecovery: boolean
}) {
  const [foodCard, setFoodCard] = useState(initialFoodCard)
  const [recovery, setRecovery] = useState(initialRecovery)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async (nextFood: boolean, nextRec: boolean) => {
    if (!nextFood && !nextRec) { setErr('חובה להשאיר לפחות אחת מסומנת'); return }
    setErr(''); setSaving(true)
    // אופטימי — מעדכן מיד, מחזיר אם נכשל
    const prevFood = foodCard, prevRec = recovery
    setFoodCard(nextFood); setRecovery(nextRec)
    try {
      const res = await fetch('/api/admin/maternity/wants', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: aidId, wants_food_card: nextFood, wants_recovery: nextRec }),
      })
      if (!res.ok) { setFoodCard(prevFood); setRecovery(prevRec); const d = await res.json().catch(() => ({})); setErr(d.error ?? 'השמירה נכשלה') }
    } catch { setFoodCard(prevFood); setRecovery(prevRec); setErr('שגיאת תקשורת') }
    finally { setSaving(false) }
  }

  const chip = (active: boolean, icon: React.ReactNode, label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} disabled={saving}
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all duration-150 disabled:opacity-60 ${
        active
          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
          : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
      }`}>
      {active ? <Check size={13} /> : icon} {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {chip(foodCard, <CreditCard size={13} />, 'כרטיס מזון', () => save(!foodCard, recovery))}
        {chip(recovery, <Home size={13} />, 'בית החלמה', () => save(foodCard, !recovery))}
        {saving && <Loader2 size={13} className="animate-spin text-slate-400" />}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}
