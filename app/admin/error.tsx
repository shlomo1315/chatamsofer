'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle, RotateCcw, ChevronDown, Copy, Check } from 'lucide-react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // ⚠️ השגיאה נשלחת ליומן השרת. בלי זה היא בלתי-ניתנת לאבחון: המשתמש רואה
  // הודעה כללית, וביומן השרת אין דבר — כי העמוד עצמו נטען שם בהצלחה והתקלה
  // קרתה בדפדפן. כך היא הופכת לשגיאה שאפשר לפתוח ולתקן.
  useEffect(() => {
    console.error(error)
    void fetch('/api/admin/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error?.message ?? String(error),
        stack: error?.stack ?? '',
        digest: error?.digest ?? '',
        url: typeof window !== 'undefined' ? window.location.href : '',
      }),
    }).catch(() => { /* דיווח כושל לא אמור להחמיר את המצב */ })
  }, [error])

  const details = [
    error?.message && `הודעה: ${error.message}`,
    error?.digest && `מזהה: ${error.digest}`,
    typeof window !== 'undefined' && `כתובת: ${window.location.href}`,
    error?.stack,
  ].filter(Boolean).join('\n')

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
      <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
        <AlertTriangle size={28} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900">אירעה שגיאה בטעינת הנתונים</h2>
        <p className="text-sm text-slate-500 mt-1">נסו לרענן את העמוד, ואם הבעיה נמשכת — פנו לצוות המערכת.</p>
      </div>
      <button
        onClick={() => reset()}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
      >
        <RotateCcw size={16} />
        נסה שוב
      </button>

      {/* ⚠️ פרטי השגיאה גלויים למשתמש בכוונה: זו מערכת ניהול פנימית, והדרך
          המהירה ביותר לתקן היא שמי שנתקל בתקלה יוכל להעתיק אותה ולשלוח. */}
      {details && (
        <div className="w-full max-w-2xl mt-2">
          <button onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            פרטים טכניים {open ? '' : '(ללחוץ אם מדווחים על התקלה)'}
          </button>
          {open && (
            <div className="mt-2 relative">
              <pre dir="ltr" className="text-[11px] leading-relaxed text-right bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto max-h-64 text-slate-600 whitespace-pre-wrap break-all">
                {details}
              </pre>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(details).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  })
                }}
                className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700">
                {copied ? <><Check size={12} /> הועתק</> : <><Copy size={12} /> העתק</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
