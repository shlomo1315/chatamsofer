'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-[#1B3256] focus:outline-none focus:ring-2 focus:ring-[#1B3256]/20'
const label = 'mb-1 block text-sm font-medium text-slate-700'

// בדיקה מהירה בדפדפן בלבד. האימות המלא נעשה בשרת (lib/gilyonot normalizeEmail).
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(s.trim())

export default function GilyonotForm() {
  const [website, setWebsite] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!looksLikeEmail(email)) { setError('נא להזין כתובת מייל תקינה'); return }
    if (!consent) { setError('יש לסמן את האישור לקבלת הגיליון במייל'); return }
    setSending(true)
    try {
      const res = await fetch('/api/gilyonot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website, name, email, consent }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'ההרשמה נכשלה. נסו שוב.'); return }
      setDone(true)
    } catch {
      setError('אין חיבור לשרת. נסו שוב.')
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm" role="status">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
        <h2 className="mt-3 text-xl font-bold" style={{ color: '#1B3256' }}>נרשמתם בהצלחה</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          הגיליון הבא יישלח אל <span dir="ltr" className="font-medium text-slate-800">{email.trim()}</span>.
        </p>
      </section>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" noValidate>
      {/* מלכודת לבוטים — מוסתר מבני אדם */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">אתר</label>
        <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
      </div>

      <div>
        <label htmlFor="g-name" className={label}>שם מלא</label>
        <input id="g-name" className={input} value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={80} />
      </div>

      <div>
        <label htmlFor="g-email" className={label}>כתובת מייל <span className="text-rose-700">*</span></label>
        <input
          id="g-email" type="email" dir="ltr" inputMode="email" autoComplete="email" required maxLength={254}
          className={`${input} text-left`} value={email} onChange={e => setEmail(e.target.value)}
          aria-invalid={!!error && !looksLikeEmail(email)}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-700">
        <input
          type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 accent-[#1B3256]"
        />
        <span>אני מאשר/ת לקבל את הגיליון השבועי ועדכונים מגיליונות החתם סופר במייל. אפשר להסיר את עצמכם בכל עת בקישור שבתחתית כל מייל.</span>
      </label>

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <button
        type="submit" disabled={sending}
        className="w-full rounded-lg px-4 py-3 text-base font-bold text-white disabled:opacity-60"
        style={{ background: '#1B3256' }}
      >
        {sending ? 'שולח...' : 'הרשמה'}
      </button>
    </form>
  )
}
