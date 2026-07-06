'use client'

// בקרת אימות מייל/טלפון בקוד חד-פעמי. עצמאית: שולחת קוד, קולטת קוד, מאמתת,
// ומחזירה אסימון חתום דרך onToken. כשהערך משתנה — האימות מתבטל (onToken(null)).
import { useEffect, useRef, useState } from 'react'
import { Loader2, ShieldCheck, Send, CheckCircle2 } from 'lucide-react'

type Channel = 'email' | 'phone'

export default function VerifyControl({
  channel, value, valid, onToken,
}: {
  channel: Channel
  value: string
  valid: boolean            // האם הערך תקין מספיק כדי לשלוח (פורמט מייל/טלפון)
  onToken: (token: string | null) => void
}) {
  const [step, setStep] = useState<'idle' | 'sent'>('idle')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [verifiedValue, setVerifiedValue] = useState<string | null>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  const isVerified = verifiedValue !== null && verifiedValue === value.trim()

  // ערך השתנה אחרי אימות → ביטול האימות וניקוי
  useEffect(() => {
    if (verifiedValue !== null && verifiedValue !== value.trim()) {
      setVerifiedValue(null); setStep('idle'); setCode(''); setError('')
      onTokenRef.current(null)
    }
  }, [value, verifiedValue])

  async function send() {
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/portal/verify/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, value: value.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בשליחה'); return }
      setStep('sent')
    } catch { setError('שגיאת רשת. נסו שוב.') }
    finally { setLoading(false) }
  }

  async function confirm() {
    if (!code) { setError('הזינו את הקוד'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/portal/verify/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, value: value.trim(), code }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'קוד שגוי'); return }
      setVerifiedValue(value.trim()); setStep('idle'); setCode('')
      onTokenRef.current(data.token as string)
    } catch { setError('שגיאת רשת. נסו שוב.') }
    finally { setLoading(false) }
  }

  if (isVerified) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-1.5">
        <CheckCircle2 size={16} /> {channel === 'email' ? 'המייל אומת בהצלחה' : 'הטלפון אומת בהצלחה'}
      </div>
    )
  }

  const sendLabel = channel === 'email' ? 'שליחת קוד אימות למייל' : 'קבלת קוד אימות בשיחה לטלפון'

  return (
    <div className="mt-1.5">
      {step === 'idle' ? (
        <button type="button" onClick={send} disabled={!valid || !value.trim() || loading}
          className="w-full flex items-center justify-center gap-2 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold py-2 px-3 rounded-lg transition-colors text-sm">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} {sendLabel}
        </button>
      ) : (
        <div className="flex flex-col gap-2 bg-indigo-50/60 border border-indigo-100 rounded-lg p-2.5">
          <p className="text-xs text-slate-600">
            {channel === 'email' ? 'נשלח קוד בן 6 ספרות לכתובת המייל.' : 'מתקשרים אליך כעת ומקריאים קוד בן 6 ספרות.'} הזינו אותו כאן:
          </p>
          {channel === 'email' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              📩 לא קיבלתם את המייל? בדקו בתיבת ה<strong>ספאם</strong> וסמנו את ההודעה כ״לא ספאם״.
            </p>
          )}
          <div className="flex items-stretch gap-2">
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000" inputMode="numeric" maxLength={6} dir="ltr"
              className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-center text-base font-semibold tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button type="button" onClick={confirm} disabled={loading || code.length < 4}
              className="shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold px-5 rounded-lg text-sm">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} אימות
            </button>
          </div>
          <button type="button" onClick={send} disabled={loading}
            className="text-xs text-slate-500 hover:text-slate-700 underline self-start">שליחת קוד מחדש</button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
