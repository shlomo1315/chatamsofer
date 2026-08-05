'use client'

// ─────────────────────────────────────────────────────────────────────────────
// חלונית אימות כתובת המייל — קופצת בכניסה לאזור האישי למי שטרם אימת.
//
// מי מגיע לכאן: נרשם שהשלים רישום בזמן שחובת אימות המייל הייתה כבויה (מתג
// בהגדרות), ונכנס למערכת בקוד טלפוני. הכתובת שלו שמורה אך לא אומתה מעולם.
//
// ניתן לסגור — האימות אינו חוסם. אימות הטלפון בשיחה כבר מבטיח את זהותו,
// והמטרה כאן היא לשחזר את ערוץ המייל כדי שיקבל עדכונים, לא לחסום כניסה.
//
// ⚠️ למה החלונית מופיעה רק *אחרי* כניסה מוצלחת ולא במסך הכניסה: שיוך כתובת
// מייל לרשומה מאפשר מכאן ואילך כניסה לחשבון בקוד זמני למייל. אילו הפעולה
// הייתה פתוחה לפני הכניסה, כל מי שיודע ת"ז של אחר היה משייך לרשומתו כתובת
// שבשליטתו ונכנס לחשבון. הסשן הוא ההוכחה לבעלות.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { MailCheck, X, Loader2, CheckCircle2 } from 'lucide-react'
import VerifyControl from '@/components/VerifyControl'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function EmailVerifyModal({
  initialEmail, onClose, onVerified,
}: {
  initialEmail?: string | null
  onClose: () => void
  onVerified: (email: string) => void
}) {
  const [email, setEmail] = useState(initialEmail ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // השמירה רצה ברגע שהאסימון מתקבל — אין סיבה לדרוש לחיצה נוספת אחרי
  // שהמשתמש כבר הקליד את הקוד שקיבל.
  async function handleToken(token: string | null) {
    if (!token || saving || saved) return
    setSaving(true); setError('')
    try {
      const clean = email.trim().toLowerCase()
      const r = await fetch('/api/portal/verify-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean, email_verify_token: token }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'שמירת האימות נכשלה. נסו שוב.'); return }
      setSaved(true)
      onVerified(clean)
    } catch {
      setError('שגיאת רשת. נסו שוב.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog" aria-modal="true" aria-labelledby="email-verify-title">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <MailCheck size={20} className="text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="email-verify-title" className="font-bold text-slate-900">אימות כתובת המייל</h3>
            <p className="text-xs text-slate-500 mt-0.5">כתובת המייל שלך טרם אומתה</p>
          </div>
          <button type="button" onClick={onClose} aria-label="סגירה"
            className="text-slate-400 hover:text-slate-600 flex-shrink-0 p-1 -m-1">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-5">
          {saved ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2 text-sm text-green-800">
              <CheckCircle2 size={18} className="flex-shrink-0" />
              כתובת המייל אומתה בהצלחה. תודה!
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600 leading-relaxed">
                כדי לקבל עדכונים על הבקשות שלך במייל, יש לאמת את הכתובת בקוד חד-פעמי.
                אפשר גם לדלג — הכניסה בשיחה לטלפון תמשיך לעבוד כרגיל.
              </p>

              <label className="block text-xs font-semibold text-slate-600 mt-4 mb-1.5">כתובת המייל שלך</label>
              <input
                type="email" value={email} dir="ltr" placeholder="your@email.com" autoFocus
                onChange={e => { setEmail(e.target.value); setError('') }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <VerifyControl channel="email" value={email} valid={EMAIL_RE.test(email.trim())} onToken={handleToken} />

              {saving && (
                <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
                  <Loader2 size={13} className="animate-spin" /> שומר...
                </p>
              )}
              {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            </>
          )}

          <button type="button" onClick={onClose}
            className="w-full mt-4 text-sm text-slate-500 hover:text-slate-700 underline py-1">
            {saved ? 'סגירה' : 'אאמת מאוחר יותר'}
          </button>
        </div>
      </div>
    </div>
  )
}
