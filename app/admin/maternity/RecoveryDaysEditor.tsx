'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Loader2, Check, Minus, Plus, RotateCcw } from 'lucide-react'
import { defaultRecoveryDays, recoveryDaysOf } from '@/lib/maternity'
import type { MaternityAid } from '@/types'

type AidLike = Pick<MaternityAid, 'id' | 'is_twins' | 'recovery_eligibility_days'>

// עורך ימי הזכאות בבית ההחלמה — מאפשר למזכירות להוסיף/להפחית ימים מעבר לברירת המחדל
// (לידה רגילה = 2 · תאומים = 4). הערך מוצג בפורטל בתי ההחלמה ובעמודת הלידות בתוכנה.
export default function RecoveryDaysEditor({ aid }: { aid: AidLike }) {
  const router = useRouter()
  const initial = recoveryDaysOf(aid)
  const fallback = defaultRecoveryDays(aid.is_twins)
  const [days, setDays] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [savedAt, setSavedAt] = useState(initial)

  const dirty = days !== savedAt

  const save = async () => {
    setErr(''); setSaving(true)
    try {
      const res = await fetch('/api/admin/maternity/recovery-days', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aidId: aid.id, days }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { setErr(data.error || 'הפעולה נכשלה'); setSaving(false); return }
      setSavedAt(days)
      router.refresh()
    } catch {
      setErr('שגיאת רשת — נסה שוב')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
          <CalendarDays size={15} className="text-sky-500" /> ימי זכאות בבית ההחלמה:
        </span>
        <div className="inline-flex items-center rounded-lg border border-slate-300 overflow-hidden">
          <button type="button" onClick={() => setDays(d => Math.max(0, d - 1))}
            className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40" disabled={days <= 0}>
            <Minus size={14} />
          </button>
          <input
            value={days}
            onChange={e => { const v = e.target.value.replace(/\D/g, ''); setDays(v ? Math.min(60, parseInt(v)) : 0) }}
            inputMode="numeric"
            className="w-12 text-center text-sm font-bold text-slate-800 border-x border-slate-200 py-1.5 focus:outline-none"
          />
          <button type="button" onClick={() => setDays(d => Math.min(60, d + 1))}
            className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40" disabled={days >= 60}>
            <Plus size={14} />
          </button>
        </div>
        <span className="text-xs text-slate-400">ימים</span>
        {dirty && (
          <button type="button" onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white text-sm font-medium rounded-lg px-3 py-1.5 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} שמירה
          </button>
        )}
        {days !== fallback && (
          <button type="button" onClick={() => setDays(fallback)}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <RotateCcw size={12} /> ברירת מחדל ({fallback})
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400">
        ברירת המחדל: לידה רגילה 2 ימים · לידת תאומים 4 ימים. ניתן לעדכן ידנית — הערך יוצג לבית ההחלמה.
      </p>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}
