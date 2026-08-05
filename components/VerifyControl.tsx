'use client'

// בקרת אימות מייל/טלפון בקוד חד-פעמי. עצמאית: שולחת קוד, קולטת קוד, מאמתת,
// ומחזירה אסימון חתום דרך onToken. כשהערך משתנה — האימות מתבטל (onToken(null)).
import { useEffect, useRef, useState } from 'react'
import { Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react'

type Channel = 'email' | 'phone'

// שניות → m:ss (למשל 118 → "1:58")
const fmtLeft = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function VerifyControl({
  channel, value, valid, onToken, optionalHint,
}: {
  channel: Channel
  value: string
  valid: boolean            // האם הערך תקין מספיק כדי לשלוח (פורמט מייל/טלפון)
  onToken: (token: string | null) => void
  optionalHint?: string     // טקסט הבהרה: אימות מספר זה אינו חובה (מוצג רק כשלא אומת)
}) {
  const [step, setStep] = useState<'idle' | 'sent'>('idle')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [verifiedValue, setVerifiedValue] = useState<string | null>(null)
  // שניות שנותרו עד שמותר לבקש קוד חדש. מקור המספר הוא תמיד השרת (cooldown
  // בהצלחה, retryAfter בחסימה) — כאן רק סופרים אותו לאחור.
  const [cooldown, setCooldown] = useState(0)
  // הכתובת שעבורה נספר הקירור. השרת אוכף לפי הערך עצמו, ולכן כתובת חדשה
  // מתחילה נקייה — מי שמתקן שגיאת כתיב במייל לא ממתין שתי דקות על לא כלום.
  const [cooldownFor, setCooldownFor] = useState('')
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken
  // מונע אימות כפול כשמגיעים ל-6 ספרות תוך כדי אימות פעיל
  const confirmingRef = useRef(false)

  const isVerified = verifiedValue !== null && verifiedValue === value.trim()

  // ערך השתנה אחרי אימות → ביטול האימות וניקוי
  useEffect(() => {
    if (verifiedValue !== null && verifiedValue !== value.trim()) {
      setVerifiedValue(null); setStep('idle'); setCode(''); setError('')
      onTokenRef.current(null)
    }
  }, [value, verifiedValue])

  // ספירה לאחור. השרת הוא האוכף; אם הספירה כאן תסתיים מוקדם מדי, הבקשה תיענה
  // ב-429 עם retryAfter והשעון יסתנכרן מחדש.
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // הקירור תקף רק לכתובת שעבורה נמדד — נגזר בזמן רינדור, בלי אפקט שמאפס מצב.
  const cooldownLeft = cooldownFor === value.trim() ? cooldown : 0
  const startCooldown = (secs: number) => { setCooldown(Math.ceil(secs)); setCooldownFor(value.trim()) }

  async function send() {
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/portal/verify/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, value: value.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        // חסימת קירור מגיעה עם retryAfter — מסנכרנים אליו את הספירה, כך שגם
        // רענון דף או לשונית שנייה מציגים את הזמן האמיתי שנותר.
        if (typeof data.retryAfter === 'number' && data.retryAfter > 0) {
          startCooldown(data.retryAfter)
          // הקוד הקודם עדיין בתוקף (10 דקות) — פותחים את שדה ההזנה כדי שישתמש
          // במייל שכבר נשלח אליו, במקום להמתין לשליחה חדשה שאינה נחוצה.
          setStep('sent')
        }
        setError(data.error || 'שגיאה בשליחה')
        return
      }
      setStep('sent'); setCode('')
      if (typeof data.cooldown === 'number') startCooldown(data.cooldown)
    } catch { setError('שגיאת רשת. נסו שוב.') }
    finally { setLoading(false) }
  }

  async function confirm(codeToCheck: string) {
    if (confirmingRef.current) return
    if (codeToCheck.length < 6) { setError('הזינו את הקוד המלא (6 ספרות)'); return }
    confirmingRef.current = true
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/portal/verify/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, value: value.trim(), code: codeToCheck }),
      })
      const data = await res.json()
      if (!res.ok) {
        // קוד לא תקין — ניקוי השדה כדי לאפשר הקלדה מחדש
        setError(data.error || 'הקוד לא תקין. אנא הזינו קוד תקין.')
        setCode('')
        return
      }
      setVerifiedValue(value.trim()); setStep('idle'); setCode('')
      onTokenRef.current(data.token as string)
    } catch { setError('שגיאת רשת. נסו שוב.') }
    finally { setLoading(false); confirmingRef.current = false }
  }

  // הזנת קוד — כשמגיעים ל-6 ספרות, אימות מיידי אוטומטי
  function onCodeChange(raw: string) {
    const next = raw.replace(/\D/g, '').slice(0, 6)
    setCode(next)
    if (error) setError('')
    if (next.length === 6) confirm(next)
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
        <>
          {optionalHint && (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mb-1.5 leading-relaxed">
              {optionalHint}
            </p>
          )}
          <button type="button" onClick={send} disabled={!valid || !value.trim() || loading || cooldownLeft > 0}
            className="w-full flex items-center justify-center gap-2 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold py-2 px-3 rounded-lg transition-colors text-sm">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}{' '}
            {cooldownLeft > 0 ? `אפשר לשלוח קוד חדש בעוד ${fmtLeft(cooldownLeft)}` : sendLabel}
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-2 bg-indigo-50/60 border border-indigo-100 rounded-lg p-2.5">
          <p className="text-xs text-slate-600">
            {channel === 'email' ? 'נשלח קוד בן 6 ספרות לכתובת המייל.' : 'מתקשרים אליך כעת ומקריאים קוד בן 6 ספרות.'} הזינו אותו כאן — האימות יתבצע אוטומטית:
          </p>
          {channel === 'email' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              📩 לא קיבלתם את המייל? בדקו בתיבת ה<strong>ספאם</strong> וסמנו את ההודעה כ״לא ספאם״.
            </p>
          )}
          {/* אותה הנחיה שמופיעה באימות הטלפון בבקשות — המערכת מקריאה את הקוד
              רק כמה שניות אחרי המענה, ובלי ההסבר נדמה שהשיחה נכשלה. */}
          {channel !== 'email' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              ☎️ לאחר המענה יש להמתין מספר שניות עד שהמערכת תקריא את הקוד, ואז להזין אותו בשדה שלמטה.
            </p>
          )}
          <div className="relative flex items-center">
            <input value={code} onChange={e => onCodeChange(e.target.value)}
              placeholder="000000" inputMode="numeric" maxLength={6} dir="ltr" disabled={loading} autoFocus
              className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-center text-base font-semibold tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60" />
            {loading && <Loader2 size={18} className="animate-spin text-indigo-600 absolute left-3" />}
          </div>
          {/* ⚠️ הכפתור מוסתר לגמרי עד תום הקירור — לא רק מושבת. כפתור שנראה על
              המסך מזמין לחיצה, וכל לחיצה מייצרת קוד חדש שמבטל את הקודם: גם המייל
              שכן הגיע מפסיק לעבוד, והשליחות הכפולות מחריפות את עומס המסירה.
              במקומו מוצגת ספירה, כדי שיהיה ברור שממתינים — ולא שנתקע. */}
          {cooldownLeft > 0 ? (
            <p className="text-xs text-slate-500 self-start">
              המייל בדרך. אפשר לבקש קוד חדש בעוד {fmtLeft(cooldownLeft)}
            </p>
          ) : (
            <button type="button" onClick={send} disabled={loading}
              className="text-xs text-slate-500 hover:text-slate-700 underline self-start">שליחת קוד מחדש</button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
