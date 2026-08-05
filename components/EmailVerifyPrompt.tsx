'use client'

// ─────────────────────────────────────────────────────────────────────────────
// בקשה לאמת את כתובת המייל, לאחר כניסה לאזור האישי.
//
// מוצג רק למי שנרשם בזמן שחובת אימות המייל הייתה כבויה (מתג בהגדרות), ולכן
// יש לו כתובת שלא אומתה מעולם. ניתן לדלג — אימות הטלפון בשיחה כבר מבטיח את
// זהותו, והמטרה כאן היא לשחזר את ערוץ המייל, לא לחסום את הכניסה.
//
// ⚠️ למה דווקא כאן ולא במסך הכניסה: שיוך כתובת מייל לרשומה הוא פעולה רגישה —
// מי שמשייך כתובת שבשליטתו יכול מכאן ואילך להיכנס לחשבון בקוד זמני למייל.
// לכן היא מותרת רק אחרי כניסה מוצלחת, כשהסשן כבר מוכיח בעלות על הרשומה.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { MailCheck, X, Loader2, CheckCircle2 } from 'lucide-react'
import VerifyControl from '@/components/VerifyControl'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function EmailVerifyPrompt() {
  const [needed, setNeeded] = useState(false)
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    fetch('/api/portal/verify-email')
      .then(r => r.json())
      .then(d => {
        if (d?.verified === false) {
          setNeeded(true)
          if (typeof d.email === 'string') setEmail(d.email)
        }
      })
      .catch(() => {})   // כשל ברשת — לא מציקים למשתמש
  }, [])

  // שמירה מופעלת ברגע שהאסימון מתקבל — אין סיבה לדרוש לחיצה נוספת אחרי
  // שהמשתמש כבר הקליד את הקוד שקיבל.
  async function handleToken(t: string | null) {
    if (!t || saving || saved) return
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/portal/verify-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), email_verify_token: t }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'שמירת האימות נכשלה. נסו שוב.'); return }
      setSaved(true)
    } catch {
      setError('שגיאת רשת. נסו שוב.')
    } finally {
      setSaving(false)
    }
  }

  if (!needed || dismissed) return null

  if (saved) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2 text-sm text-green-800">
        <CheckCircle2 size={18} className="flex-shrink-0" />
        כתובת המייל אומתה בהצלחה. תודה!
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <MailCheck size={20} className="text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-900">כתובת המייל שלך טרם אומתה</p>
          <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
            אימות הכתובת מאפשר לקבל קוד כניסה במייל ועדכונים על הבקשות שלך.
            אפשר גם לדלג — הכניסה בשיחה לטלפון תמשיך לעבוד כרגיל.
          </p>
        </div>
        <button type="button" onClick={() => setDismissed(true)} aria-label="סגירה"
          className="text-amber-600 hover:text-amber-800 flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      <div className="mt-3">
        <input
          type="email" value={email} dir="ltr" placeholder="your@email.com"
          onChange={e => { setEmail(e.target.value); setError('') }}
          className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <VerifyControl channel="email" value={email} valid={EMAIL_RE.test(email.trim())} onToken={handleToken} />
        {saving && (
          <p className="flex items-center gap-1.5 text-xs text-amber-800 mt-1.5">
            <Loader2 size={13} className="animate-spin" /> שומר...
          </p>
        )}
        {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      </div>

      <button type="button" onClick={() => setDismissed(true)}
        className="text-xs text-amber-700 hover:text-amber-900 underline mt-2">
        אאמת בפעם אחרת
      </button>
    </div>
  )
}
