'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RotateCcw, ChevronDown, Copy, Check, Loader2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// גבול השגיאות של מסכי הניהול.
//
// ⚠️ רוב ה"שגיאות" כאן אינן באגים אלא *נתק רגעי בהעברת הנתונים*: השרת רינדר
// את העמוד בהצלחה — ביומן רואים שכל השאילתות הצליחו — אבל הזרם לדפדפן נקטע
// באמצע ("Connection closed."). הסיבות שכיחות ומחוץ לשליטתנו: מסנן תוכן ברשת
// שמנתק חיבורים, נפילת רשת רגעית, מעבר בין רשתות, chunk שטעינתו נקטעה.
//
// עד כה כל נתק כזה החליף את המסך במסך שגיאה אדום, והמשתמש נדרש ללחוץ "נסה
// שוב" בעצמו — על תקלה שנעלמת מעצמה בטעינה חוזרת. עכשיו נתק זמני מטופל
// אוטומטית: העמוד נטען מחדש בשקט (עד שני נסיונות), והמסך האדום נשמר למה
// שהוא באמת — שגיאה שחוזרת גם אחרי טעינה מחדש, ואז חשוב לדעת עליה.
// ─────────────────────────────────────────────────────────────────────────────

/** שגיאות שמשמעותן "הנתונים לא הגיעו", לא "יש באג בקוד" */
const TRANSIENT =
  /connection closed|failed to fetch|network\s?error|load failed|chunkloaderror|loading chunk|loading css chunk|fetch failed|socket hang up|stream closed|terminated|aborted/i

const MAX_AUTO_RETRIES = 2
/** נסיון קודם ותיק מזה נחשב תקלה חדשה, ולא המשך של אותה תקלה */
const ATTEMPT_TTL_MS = 30_000

function isTransient(error: Error & { digest?: string }) {
  if (error?.name === 'ChunkLoadError') return true
  return TRANSIENT.test(`${error?.name ?? ''} ${error?.message ?? ''}`)
}

// מונה הנסיונות נשמר ב-sessionStorage כדי לשרוד גם טעינה מלאה של הדף.
function readAttempts(key: string): number {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return 0
    const { n, t } = JSON.parse(raw) as { n: number; t: number }
    if (!Number.isFinite(n) || !Number.isFinite(t)) return 0
    return Date.now() - t > ATTEMPT_TTL_MS ? 0 : n
  } catch { return 0 }
}
function writeAttempts(key: string, n: number) {
  try { sessionStorage.setItem(key, JSON.stringify({ n, t: Date.now() })) } catch { /* גלישה פרטית — נמשיך בלי */ }
}

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const handled = useRef(false)

  // ⚠️ ההחלטה נגזרת פעם אחת, ברינדור הראשון — ולא ב-setState בתוך אפקט: כך
  // הספינר מוצג מיד ומסך השגיאה האדום אינו מהבהב לרגע לפני שהוא נעלם.
  const [plan] = useState(() => {
    const transient = isTransient(error)
    const key = `admin-error-retry:${typeof window !== 'undefined' ? window.location.pathname : ''}`
    const attempts = transient ? readAttempts(key) : 0
    return { transient, key, attempts, willRetry: transient && attempts < MAX_AUTO_RETRIES }
  })
  const retrying = plan.willRetry

  // ⚠️ השגיאה נשלחת ליומן השרת. בלי זה היא בלתי-ניתנת לאבחון: המשתמש רואה
  // הודעה כללית, וביומן השרת אין דבר — כי העמוד עצמו נטען שם בהצלחה והתקלה
  // קרתה בדפדפן. גם נתק שנפתר אוטומטית מדווח (עם transient + attempt), כדי
  // שנדע אם הוא הופך לתופעה — פשוט בלי להטריד את המשתמש.
  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const { transient, key, attempts, willRetry } = plan

    console.error(error)
    void fetch('/api/admin/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error?.message ?? String(error),
        stack: error?.stack ?? '',
        digest: error?.digest ?? '',
        url: typeof window !== 'undefined' ? window.location.href : '',
        transient,
        attempt: attempts + 1,
        autoRetry: willRetry,
      }),
    }).catch(() => { /* דיווח כושל לא אמור להחמיר את המצב */ })

    if (!willRetry) {
      // נכשל גם אחרי הנסיונות האוטומטיים — מאפסים את המונה כדי שהתקלה הבאה
      // תקבל שוב הזדמנות להיפתר לבד, ומציגים את המסך.
      if (transient) writeAttempts(key, 0)
      return
    }

    writeAttempts(key, attempts + 1)
    const t = setTimeout(() => {
      if (attempts === 0) {
        // נסיון ראשון — משיכת הנתונים מהשרת ואיפוס הגבול, בלי לטעון את כל הדף
        router.refresh()
        reset()
      } else {
        // נסיון שני — טעינה מלאה, שמביאה מחדש גם chunks שנקטעו
        window.location.reload()
      }
    }, 500)
    return () => clearTimeout(t)
  }, [error, reset, router, plan])

  if (retrying) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-4">
        <Loader2 size={26} className="animate-spin text-indigo-600" />
        <p className="text-sm font-medium text-slate-500">רגע, טוענים את הנתונים מחדש…</p>
      </div>
    )
  }

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
        <p className="text-sm text-slate-500 mt-1">ניסינו לטעון מחדש ולא הצלחנו. נסו שוב, ואם הבעיה נמשכת — פנו לצוות המערכת.</p>
      </div>
      <button
        onClick={() => { router.refresh(); reset() }}
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
