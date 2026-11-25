'use client'

import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { modalBtn } from '@/components/admin/system/RecordModal'

// "סנכרון כל המיילים" בלשונית המייל: קולט מיילי קוויטל שאין להם בקשה, מנה אחרי מנה
// (POST /api/admin/kvitel/mail-decode {all:true}). מייל שכבר נקלט מדולג, וכשל במייל אחד לא עוצר.

type Batch = { created: number; noNames: number; failed: number; skipped: number; next: string | null; done: boolean; error?: string }
const MAX_ROUNDS = 40

export default function KvitelMailSync() {
  const [busy, setBusy] = useState(false)
  const [sum, setSum] = useState<{ created: number; noNames: number; failed: number; stopped: boolean } | null>(null)
  const [error, setError] = useState('')

  async function run() {
    setBusy(true); setError('')
    const total = { created: 0, noNames: 0, failed: 0, stopped: false }
    setSum({ ...total })
    try {
      let before: string | null = null
      for (let round = 0; ; round++) {
        if (round >= MAX_ROUNDS) { total.stopped = true; break }
        const res = await fetch('/api/admin/kvitel/mail-decode', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true, before }),
        })
        const b = await res.json().catch(() => ({})) as Batch
        if (!res.ok || b.error) { setError(b.error || 'הסנכרון נכשל'); break }
        total.created += b.created; total.noNames += b.noNames; total.failed += b.failed
        setSum({ ...total })
        if (b.done || !b.next) break
        before = b.next
      }
    } finally {
      setSum({ ...total })
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm">
      <button type="button" disabled={busy} onClick={() => void run()} className={modalBtn.primary}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} סנכרון כל המיילים
      </button>
      <span className="text-ink-faint">
        {sum
          ? `${busy ? 'בסנכרון… ' : ''}נקלטו ${sum.created} מיילים${sum.noNames ? ` · ${sum.noNames} בלי שמות` : ''}${sum.failed ? ` · ${sum.failed} נכשלו` : ''}${sum.stopped ? ' · נעצר אחרי הרבה מנות, אפשר ללחוץ שוב' : ''}`
          : 'קולט מיילי קוויטל שעוד לא נקלטו כבקשה. מייל שכבר נקלט לא נקלט פעמיים.'}
      </span>
      {error && <span role="alert" className="text-rose-700">{error}</span>}
    </div>
  )
}
