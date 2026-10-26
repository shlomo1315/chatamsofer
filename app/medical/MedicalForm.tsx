'use client'

import { useRef, useState } from 'react'

type Known = 'unknown' | 'yes' | 'no'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-[#1B3256] focus:outline-none focus:ring-2 focus:ring-[#1B3256]/20'

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-800">{label}</span>
      {children}
      <span className="mt-1 block text-xs leading-relaxed text-slate-500">{hint}</span>
    </label>
  )
}

export default function MedicalForm() {
  const [known, setKnown] = useState<Known>('unknown')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const lastId = useRef('')

  // בודק רק אם המספר רשום (בלי פרטים אישיים), כדי לדעת אילו שדות להציג
  async function checkId(raw: string) {
    const id = raw.replace(/\D/g, '')
    if (id.length < 5 || id === lastId.current) return
    lastId.current = id
    try {
      const r = await fetch(`/api/portal/lookup?id=${id}`)
      const j = await r.json()
      setKnown(j.found ? 'yes' : 'no')
    } catch { setKnown('no') }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await fetch('/api/medical/submit', { method: 'POST', body: new FormData(e.currentTarget) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'אירעה שגיאה. נסו שוב.'); return }
      setDone(true)
    } catch { setError('אירעה שגיאה בחיבור. נסו שוב.') }
    finally { setBusy(false) }
  }

  if (done) {
    return (
      <div role="status" className="rounded-xl border border-emerald-200 bg-white p-8 text-center">
        <h2 className="text-xl font-bold text-emerald-800">הבקשה התקבלה</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">תודה. הבקשה תיבדק ותקבלו הודעה בהמשך.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      {/* מלכודת לבוטים */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

      <Field label="תעודת זהות" hint="מספר תעודת הזהות של המבקש, 9 ספרות.">
        <input name="id_number" inputMode="numeric" required className={input} dir="ltr" onBlur={e => checkId(e.target.value)} />
      </Field>

      {known === 'no' && (
        <>
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            מספר זה אינו רשום אצלנו, לכן נבקש כמה פרטים נוספים.
          </p>
          <Field label="שם מלא" hint="שם פרטי ושם משפחה, כפי שמופיע בתעודת הזהות.">
            <input name="full_name" required className={input} />
          </Field>
          <Field label="כתובת" hint="רחוב ומספר בית.">
            <input name="address" required className={input} />
          </Field>
          <Field label="עיר" hint="עיר המגורים.">
            <input name="city" required className={input} />
          </Field>
          <Field label="צילום תעודת זהות" hint="תמונה או PDF ברורים, כולל הספח. עד 10MB.">
            <input name="id_card" type="file" required accept=".jpg,.jpeg,.png,.webp,.heic,.gif,.pdf" className={input} />
          </Field>
        </>
      )}

      <Field label="טלפון" hint="מספר שנוכל לחזור אליו.">
        <input name="phone" type="tel" required className={input} dir="ltr" />
      </Field>
      <Field label="מייל (לא חובה)" hint="לשליחת הודעה על הבקשה.">
        <input name="email" type="email" className={input} dir="ltr" />
      </Field>
      <Field label="פירוט הבקשה" hint="מה המצב הרפואי ולמה נדרש הסיוע.">
        <textarea name="reason" required rows={5} maxLength={3000} className={input} />
      </Field>
      <Field label="סכום מבוקש (בשקלים)" hint="הסכום שאתם מבקשים. ההחלטה הסופית נקבעת בבדיקה.">
        <input name="amount" type="number" inputMode="numeric" min={1} required className={input} dir="ltr" />
      </Field>
      <Field label="מסמכים רפואיים" hint="אפשר לבחור כמה קבצים (עד 6): סיכום רפואי, הפניה או חשבון. תמונה או PDF, עד 10MB לקובץ.">
        <input name="medical" type="file" required multiple accept=".jpg,.jpeg,.png,.webp,.heic,.gif,.pdf" className={input} />
      </Field>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <button type="submit" disabled={busy}
        className="w-full rounded-lg bg-[#1B3256] px-4 py-3 text-base font-bold text-white disabled:opacity-60">
        {busy ? 'שולח...' : 'שליחת הבקשה'}
      </button>
    </form>
  )
}
