'use client'
import { useState, useEffect } from 'react'
import { KeyRound, Loader2, Check, ExternalLink } from 'lucide-react'

// סיסמת הדוכן ביריד.
//
// 🔴 נשמרת כ-HMAC ולכן אי אפשר להציג אותה שוב — רק להחליף. זו אינה
// מגבלה אלא הנקודה: מי שקורא את app_settings (גיבוי, תמיכה) אינו
// לומד את הסיסמה.

export default function SellerPassword() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/book-fair/seller-password', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setConfigured(!!d.configured); setUpdatedAt(d.updatedAt ?? null) })
      .catch(() => setConfigured(false))
  }, [])

  async function save() {
    setError(''); setDone(false)
    if (pw.length < 6) return setError('הסיסמה חייבת להיות באורך 6 תווים לפחות')
    // ⚠️ אימות כפול: סיסמה משותפת שהוקלדה בשגיאה נועלת את כל הדוכן,
    // ואי אפשר לקרוא אותה בחזרה כדי לבדוק מה נשמר.
    if (pw !== pw2) return setError('הסיסמאות אינן תואמות')

    setBusy(true)
    try {
      const res = await fetch('/api/admin/book-fair/seller-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'השמירה נכשלה'); return }
      setConfigured(true); setDone(true); setPw(''); setPw2('')
      setTimeout(() => setDone(false), 3000)
    } catch {
      setError('השמירה נכשלה — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
        <KeyRound size={17} /> סיסמת הדוכן ביריד
      </h2>
      <p className="mb-3 text-sm text-slate-500">
        סיסמה אחת משותפת למוכרים בדוכן. המוכר מזין את שמו בנפרד — לתיעוד
        המכירות, לא לאימות.
      </p>

      {configured === null ? (
        <Loader2 size={18} className="animate-spin text-slate-400" />
      ) : (
        <>
          <p className={`mb-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${
            configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
          }`}>
            {configured
              ? `מוגדרת${updatedAt ? ` · עודכנה ${new Date(updatedAt).toLocaleDateString('he-IL')}` : ''}`
              : '🔴 טרם הוגדרה — אזור המוכרים סגור'}
          </p>

          <div className="flex flex-col gap-2.5 sm:max-w-sm">
            <input
              type="password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder={configured ? 'סיסמה חדשה' : 'בחרו סיסמה'}
              dir="ltr"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
            <input
              type="password"
              value={pw2}
              onChange={e => setPw2(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && pw && pw2) void save() }}
              placeholder="אימות הסיסמה"
              dir="ltr"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex items-center gap-2">
              <button
                onClick={save}
                disabled={busy || !pw || !pw2}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : done ? <Check size={15} /> : null}
                {done ? 'נשמרה' : configured ? 'החלפת הסיסמה' : 'שמירת הסיסמה'}
              </button>
              <a
                href="/yerid/seller"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
              >
                אזור המוכרים <ExternalLink size={13} />
              </a>
            </div>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            ⚠️ הסיסמה נשמרת מוצפנת ולא ניתן להציגה שוב — רק להחליף.
          </p>
        </>
      )}
    </section>
  )
}
