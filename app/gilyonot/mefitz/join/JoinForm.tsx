'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20'
const label = 'mb-1 block text-sm font-medium text-slate-700'
const OTHER = '__other__'

// בדיקה מהירה בדפדפן בלבד. האימות המלא נעשה בשרת (validateJoinRequest).
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(s.trim())
const looksLikePhone = (s: string) => /^0\d{8,9}$/.test(s.replace(/\D/g, ''))

export default function JoinForm({ cities }: { cities: string[] }) {
  const [website, setWebsite] = useState('')
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', city: '', otherCity: '', synagogue: '', address: '', quantity: '', notes: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const city = form.city === OTHER || !cities.length ? form.otherCity : form.city

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.full_name.trim().length < 2) { setError('נא להזין שם מלא'); return }
    if (!looksLikePhone(form.phone)) { setError('נא להזין מספר טלפון תקין'); return }
    if (!looksLikeEmail(form.email)) { setError('נא להזין כתובת מייל תקינה'); return }
    if (!city.trim()) { setError('נא לבחור עיר לחלוקה'); return }
    setSending(true)
    try {
      const res = await fetch('/api/gilyonot/mefitz/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website, full_name: form.full_name, phone: form.phone, email: form.email, city,
          synagogue: form.synagogue, address: form.address, quantity: form.quantity, notes: form.notes,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'השליחה נכשלה. נסו שוב.'); return }
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
        <h2 className="mt-3 text-xl font-bold" style={{ color: '#2563eb' }}>הבקשה התקבלה</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          הבקשה ממתינה לאישור במשרד. אחרי האישור יישלח מייל אל <span dir="ltr" className="font-medium text-slate-800">{form.email.trim()}</span> עם כל הפרטים.
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
        <label htmlFor="j-name" className={label}>שם מלא <span className="text-rose-700">*</span></label>
        <input id="j-name" className={input} value={form.full_name} onChange={set('full_name')} autoComplete="name" required maxLength={80} />
      </div>

      <div>
        <label htmlFor="j-phone" className={label}>טלפון <span className="text-rose-700">*</span></label>
        <input
          id="j-phone" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" required maxLength={20}
          className={`${input} text-left`} value={form.phone} onChange={set('phone')}
        />
      </div>

      <div>
        <label htmlFor="j-email" className={label}>כתובת מייל <span className="text-rose-700">*</span></label>
        <input
          id="j-email" type="email" dir="ltr" inputMode="email" autoComplete="email" required maxLength={254}
          className={`${input} text-left`} value={form.email} onChange={set('email')}
        />
      </div>

      <div>
        <label htmlFor="j-city" className={label}>עיר לחלוקה <span className="text-rose-700">*</span></label>
        {cities.length > 0 && (
          <select id="j-city" className={input} value={form.city} onChange={set('city')} required>
            <option value="">בחרו עיר</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
            <option value={OTHER}>עיר אחרת</option>
          </select>
        )}
        {(form.city === OTHER || !cities.length) && (
          <input
            id={cities.length ? 'j-other-city' : 'j-city'} aria-label="שם העיר" placeholder="שם העיר" maxLength={60}
            className={`${input} ${cities.length ? 'mt-2' : ''}`} value={form.otherCity} onChange={set('otherCity')}
          />
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="j-syn" className={label}>בית כנסת</label>
          <input id="j-syn" className={input} value={form.synagogue} onChange={set('synagogue')} maxLength={120} />
        </div>
        <div>
          <label htmlFor="j-qty" className={label}>כמות שבועית משוערת</label>
          <input id="j-qty" type="number" min={1} max={10000} inputMode="numeric" className={input} value={form.quantity} onChange={set('quantity')} />
        </div>
      </div>

      <div>
        <label htmlFor="j-addr" className={label}>כתובת למשלוח הגיליונות</label>
        <input id="j-addr" className={input} value={form.address} onChange={set('address')} autoComplete="street-address" maxLength={160} />
      </div>

      <div>
        <label htmlFor="j-notes" className={label}>הערה</label>
        <textarea
          id="j-notes" rows={3} maxLength={1000} className={input} value={form.notes} onChange={set('notes')}
          placeholder="למשל: באיזה בית כנסת, באילו ימים, או כל פרט שחשוב שנדע"
        />
      </div>

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <button
        type="submit" disabled={sending}
        className="w-full rounded-lg px-4 py-3 text-base font-bold text-white disabled:opacity-60"
        style={{ background: '#2563eb' }}
      >
        {sending ? 'שולח...' : 'שליחת בקשת הצטרפות'}
      </button>
    </form>
  )
}
