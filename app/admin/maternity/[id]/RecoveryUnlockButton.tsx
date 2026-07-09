'use client'
import { useState } from 'react'
import { Unlock } from 'lucide-react'

// כפתור שמאפשר למשרד לפתוח רשומת החלמה נעולה לעריכה מחדש בצד בית ההחלמה.
export default function RecoveryUnlockButton({ aidId }: { aidId: string }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const unlock = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/admin/maternity/recovery-unlock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aidId }),
      })
      if (r.ok) { setDone(true); location.reload() }
    } catch { /* התעלם */ }
    setBusy(false)
  }

  if (done) return <span className="text-xs font-medium text-emerald-600">נפתח לעריכה ✓</span>
  return (
    <button onClick={unlock} disabled={busy}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 disabled:opacity-40">
      <Unlock size={13} /> {busy ? 'פותח…' : 'פתח לעריכה'}
    </button>
  )
}
