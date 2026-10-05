'use client'
import { useState, useEffect } from 'react'
import { PhoneCall, Loader2, Check } from 'lucide-react'

// פרטי הקשר למשרד בדף מעקב ההזמנה.
//
// ⚠️ בלי טלפון מוגדר הדף מציג מייל בלבד — לא ממציאים מספר.

export default function OfficeContact({ canEdit }: { canEdit: boolean }) {
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/api/admin/book-fair/contact', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (alive) { setPhone(d.phone ?? ''); setEmail(d.email ?? ''); setLoaded(true) } })
      .catch(() => { if (alive) { setError('הטעינה נכשלה'); setLoaded(true) } })
    return () => { alive = false }
  }, [])

  async function save() {
    setError(''); setDone(false); setBusy(true)
    try {
      const res = await fetch('/api/admin/book-fair/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, email }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'השמירה נכשלה'); return }
      setPhone(d.phone ?? ''); setEmail(d.email ?? '')
      setDone(true); setTimeout(() => setDone(false), 3000)
    } catch {
      setError('השמירה נכשלה — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
        <PhoneCall size={17} /> פרטי קשר בדף מעקב ההזמנה
      </h2>
      <p className="mb-3 text-sm text-slate-500">
        מוצגים ללקוח ליד ההודעה &quot;המשלוח אמור להגיע תוך 14 ימי עסקים&quot;. בלי טלפון — יוצג כפתור מייל בלבד.
      </p>
      {!loaded ? (
        <Loader2 size={18} className="animate-spin text-slate-400" />
      ) : (
        <div className="flex flex-col gap-2.5 sm:max-w-sm">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            טלפון המשרד
            <input value={phone} onChange={e => setPhone(e.target.value)} disabled={!canEdit}
              dir="ltr" inputMode="tel" placeholder="למשל 03-1234567"
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-400 disabled:bg-slate-50" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            מייל המשרד
            <input value={email} onChange={e => setEmail(e.target.value)} disabled={!canEdit}
              dir="ltr" inputMode="email"
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-400 disabled:bg-slate-50" />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {canEdit && (
            <button onClick={save} disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : done ? <Check size={15} /> : null}
              {done ? 'נשמר' : 'שמירה'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
