'use client'
import { useEffect, useState } from 'react'

// הודעה קולית לכל מי שרכש ביריד: בדיקה אליי (0527101315), ואז שליחה לכולם באישור הספירה.
export default function VoiceBroadcastPage() {
  const [count, setCount] = useState<number | null>(null)
  const [started, setStarted] = useState(false)
  const [last, setLast] = useState<{ total: number; dialed: number; at: string } | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/book-fair/voice-broadcast').then(r => r.json())
      .then(d => { setCount(d.count ?? null); setStarted(!!d.alreadyStarted); setLast(d.last ?? null) }).catch(() => setMsg('טעינת הספירה נכשלה'))
  }, [])

  async function post(body: object, ok: (d: Record<string, number>) => string) {
    setBusy(true); setMsg('')
    try {
      const r = await fetch('/api/admin/book-fair/voice-broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      setMsg(r.ok ? ok(d) : (d.error ?? 'הפעולה נכשלה'))
    } finally { setBusy(false) }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">הודעה קולית לרוכשים</h1>
      <p className="text-sm text-gray-600">מי שעונה שומע את ההודעה המוקלטת והשיחה מסתיימת. בלי תפריט.</p>
      <section className="space-y-2">
        <h2 className="font-semibold">1. בדיקה אליי</h2>
        <p className="text-sm text-gray-600">חיוג ל-0527101315 בלבד.</p>
        <button disabled={busy} onClick={() => post({ test: true }, () => 'מחייגים אליך עכשיו')} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">בדיקה אליי</button>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">2. שליחה לכולם</h2>
        <p>מספרים ייחודיים (כולל איסוף עצמי ומשלוחים): <b>{count ?? '...'}</b>{started && ' · שליחה מלאה כבר התחילה'}</p>
        <button
          disabled={busy || count == null || started}
          onClick={() => { if (confirm(`לחייג ל-${count} מספרים ולהשמיע את ההודעה?`)) post({ confirm: count }, d => `חויגו ${d.dialed} מתוך ${d.total}`) }}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">שליחה לכולם</button>
      </section>
      {last && <p className="rounded border p-3">שליחה אחרונה ({new Date(last.at).toLocaleString('he-IL')}): חויגו {last.dialed} מתוך {last.total}</p>}
      {msg && <p role="status" className="rounded bg-gray-100 p-3">{msg}</p>}
    </div>
  )
}
