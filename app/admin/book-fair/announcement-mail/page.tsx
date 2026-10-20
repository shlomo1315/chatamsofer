'use client'
import { useEffect, useState } from 'react'

// מסך שליחת מייל ההודעה למזמינים: בדיקה לכתובת אחת, ואז שליחה מלאה באישור הספירה.
export default function AnnouncementMailPage() {
  const [count, setCount] = useState<number | null>(null)
  const [started, setStarted] = useState(false)
  const [test, setTest] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/book-fair/announcement-mail').then(r => r.json())
      .then(d => { setCount(d.count ?? null); setStarted(!!d.alreadyStarted) }).catch(() => setMsg('טעינת הספירה נכשלה'))
  }, [])

  async function post(body: object, ok: (d: Record<string, number>) => string) {
    setBusy(true); setMsg('')
    try {
      const r = await fetch('/api/admin/book-fair/announcement-mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      setMsg(r.ok ? ok(d) : (d.error ?? 'השליחה נכשלה'))
    } finally { setBusy(false) }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">מייל הודעה למזמינים</h1>
      <p className="text-sm text-gray-600">אותו נוסח של ההודעה בקול, מכתובת היריד, למזמינים דרך האתר עם משלוח. כתובת אחת מקבלת מייל אחד.</p>
      <section className="space-y-2">
        <h2 className="font-semibold">1. שליחת בדיקה</h2>
        <input dir="ltr" value={test} onChange={e => setTest(e.target.value)} placeholder="name@example.com" className="w-full rounded border p-2" />
        <button disabled={busy || !test} onClick={() => post({ test }, () => 'מייל הבדיקה נשלח')} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">שלח בדיקה</button>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">2. שליחה לכולם</h2>
        <p>נמענים: <b>{count ?? '...'}</b>{started && ' · שליחה מלאה כבר התחילה'}</p>
        <button
          disabled={busy || count == null || started}
          onClick={() => { if (confirm(`לשלוח מייל ל-${count} כתובות?`)) post({ confirm: count }, d => `נשלחו ${d.sent} מתוך ${d.total}, נכשלו ${d.failed}`) }}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">שלח לכל הנמענים</button>
      </section>
      {msg && <p role="status" className="rounded bg-gray-100 p-3">{msg}</p>}
    </div>
  )
}
