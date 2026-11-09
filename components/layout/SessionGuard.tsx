'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { RETURN_KEY, LOGGED_OUT_AT_KEY, sanitizeReturnTo, ringOffset, isLowCountdown } from '@/lib/returnTo'

// ─── שומר הסשן של מסכי הניהול ─────────────────────────────────────────────────
// • אחרי 30 דקות בלי עכבר/מקלדת: חלון "האם אתה עדיין כאן?" עם מונה של 120
//   שניות. בלי תשובה עד סוף המונה, המשתמש מנותק.
// • מתחת לכפתור היציאה: כמה זמן נשאר עד הניתוק המוחלט (8 שעות מהכניסה).
// • כל הלשוניות חולקות את זמן הפעילות האחרון ואת הניתוק דרך localStorage.
// הזמנים נאכפים גם בשרת (lib/sessionPolicy.ts), כך שזה רק הצד הנראה של המדיניות.

const ACTIVITY_KEY = 'hq-last-activity'
const LOGOUT_KEY = 'hq-logout'
const PING_EVERY_MS = 2 * 60 * 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

type Reason = 'manual' | 'idle' | 'expired'

/** יציאה מלאה: עוגיות השרת, סשן Supabase, ושידור ללשוניות האחרות. */
export async function signOutEverywhere(reason: Reason) {
  if (reason !== 'manual') {
    try { localStorage.setItem(LOGGED_OUT_AT_KEY, String(Date.now())) } catch { /* מצב פרטי */ }
  }
  try { localStorage.setItem(LOGOUT_KEY, String(Date.now())) } catch { /* מצב פרטי */ }
  await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
  // יציאה ידנית מנתקת את כל הסשנים (כמו קודם); ניתוק אוטומטי — רק את המחשב הזה.
  await createClient().auth.signOut(reason === 'manual' ? undefined : { scope: 'local' }).catch(() => {})
  window.location.href = reason === 'manual' ? '/login' : `/login?reason=${reason}`
}

/** שומר את הדף הפתוח, כדי שאחרי כניסה חוזרת נחזור אליו. */
function saveReturnTo() {
  const p = sanitizeReturnTo(window.location.pathname + window.location.search)
  if (!p) return
  try { localStorage.setItem(RETURN_KEY, p) } catch { /* מצב פרטי */ }
}

function readSharedActivity(): number {
  try { return Number(localStorage.getItem(ACTIVITY_KEY)) || 0 } catch { return 0 }
}

function formatLeft(ms: number) {
  const totalMin = Math.max(0, Math.ceil(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

export default function SessionGuard() {
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [idleMs, setIdleMs] = useState(30 * 60 * 1000)
  const [promptMs, setPromptMs] = useState(120 * 1000)
  const [now, setNow] = useState(0)
  const [prompt, setPrompt] = useState(false)
  const [deadline, setDeadline] = useState(0)
  const [busy, setBusy] = useState(false)

  const lastActivity = useRef(0)
  const lastShared = useRef(0)
  const lastPing = useRef(0)
  const pendingPing = useRef(false)
  const promptRef = useRef(false)
  const leaving = useRef(false)

  const leave = useCallback((reason: Reason) => {
    if (leaving.current) return
    leaving.current = true
    void signOutEverywhere(reason)
  }, [])

  const ping = useCallback(async (method: 'GET' | 'POST') => {
    try {
      const r = await fetch('/api/auth/session', { method, cache: 'no-store' })
      if (r.status === 401) {
        const j = await r.json().catch(() => ({}))
        leave(j.reason === 'expired' ? 'expired' : 'idle')
        return false
      }
      if (!r.ok) return true // תקלת רשת/שרת רגעית — לא מנתקים בגללה
      const j = await r.json()
      setExpiresAt(typeof j.expiresAt === 'number' ? j.expiresAt : null)
      if (j.idleMs) setIdleMs(j.idleMs)
      if (j.promptMs) setPromptMs(j.promptMs)
      return true
    } catch {
      return true
    }
  }, [leave])

  const markActive = useCallback((t: number) => {
    lastActivity.current = t
    saveReturnTo()
    pendingPing.current = true
    if (t - lastShared.current > 5000) {
      lastShared.current = t
      try { localStorage.setItem(ACTIVITY_KEY, String(t)) } catch { /* מצב פרטי */ }
    }
  }, [])

  // טעינה: מצב מהשרת + רישום פעילות ראשון
  useEffect(() => {
    lastPing.current = Date.now()
    markActive(Date.now())
    // ה-setState ב-ping קורה רק אחרי await של הרשת, לא בסנכרון בתוך האפקט
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void ping('POST')
  }, [ping, markActive])

  // מאזיני פעילות. בזמן שהחלון פתוח תנועת עכבר לא נחשבת — רק לחיצה על "המשך".
  useEffect(() => {
    const onActivity = () => { if (!promptRef.current) markActive(Date.now()) }
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true, capture: true }))
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOGOUT_KEY && e.newValue) {
        leaving.current = true
        window.location.href = '/login'
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity, { capture: true }))
      window.removeEventListener('storage', onStorage)
    }
  }, [markActive])

  // שעון אחד לכל הבדיקות. מחושב לפי חותמות זמן, ולכן נכון גם אחרי שהלשונית
  // הייתה ברקע או מוקפאת (הדפדפן מאט שם טיימרים).
  useEffect(() => {
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (leaving.current) return
      if (expiresAt !== null && t >= expiresAt) return leave('expired')

      const last = Math.max(lastActivity.current, readSharedActivity())
      const idle = t - last
      if (idle >= idleMs + promptMs) return leave('idle')
      if (idle >= idleMs) {
        if (!promptRef.current) { promptRef.current = true; setDeadline(last + idleMs + promptMs); setPrompt(true) }
      } else if (promptRef.current) {
        // "המשך" נלחץ בלשונית אחרת
        promptRef.current = false
        setPrompt(false)
      }

      if (pendingPing.current && t - lastPing.current >= PING_EVERY_MS) {
        pendingPing.current = false
        lastPing.current = t
        void ping('POST')
      }
    }
    const id = window.setInterval(tick, 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [expiresAt, idleMs, promptMs, leave, ping])

  const stay = async () => {
    setBusy(true)
    const ok = await ping('POST')
    setBusy(false)
    if (!ok) return
    const t = Date.now()
    lastShared.current = 0
    markActive(t)
    pendingPing.current = false
    lastPing.current = t
    promptRef.current = false
    setPrompt(false)
  }

  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000))
  const low = isLowCountdown(secondsLeft)

  return (
    <>
      {expiresAt !== null && now > 0 && (
        <span
          className="text-[10px] leading-none text-slate-500 whitespace-nowrap tabular-nums"
          title="לאחר מכן תתבקש להיכנס מחדש"
        >
          מחובר לעוד <bdi>{formatLeft(expiresAt - now)}</bdi> שעות
        </span>
      )}
      {prompt && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0e1830]/75 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="session-guard-title"
          aria-describedby="session-guard-desc"
          dir="rtl"
        >
          <div className="relative w-full max-w-[380px] rounded-[14px] bg-[#fffdf8] p-8 text-center shadow-[0_30px_70px_-20px_rgba(0,0,0,.5)]">
            <div className="pointer-events-none absolute inset-[6px] rounded-[10px] border border-[#e6dfcf]" aria-hidden />
            <div className="relative mx-auto h-[132px] w-[132px]">
              <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden>
                <circle cx="70" cy="70" r="62" fill="none" strokeWidth="6" stroke="#f3e9cf" />
                <circle
                  cx="70" cy="70" r="62" fill="none" strokeWidth="6" strokeLinecap="round"
                  stroke={low ? '#b4442c' : '#14213d'}
                  strokeDasharray="389.6"
                  strokeDashoffset={ringOffset(secondsLeft, promptMs / 1000)}
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke .3s' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <b className={`text-[49px] font-extrabold leading-none tabular-nums ${low ? 'text-[#b4442c]' : 'text-navy'}`} aria-live="polite">{secondsLeft}</b>
                <small className="text-xs text-[#958c78]">שניות</small>
              </div>
            </div>
            <h2 id="session-guard-title" className="relative mt-4 text-[25px] font-extrabold text-[#1b2338]">האם אתה עדיין כאן?</h2>
            <p id="session-guard-desc" className="relative mt-2 text-sm text-[#6b6352]">
              30 דקות בלי פעילות. מטעמי אבטחה המערכת תנתק אותך כשהטבעת תיסגר.
            </p>
            <div className="relative mt-6 flex flex-col gap-2">
              <button
                type="button"
                autoFocus
                disabled={busy}
                onClick={stay}
                className="min-h-12 w-full rounded-[10px] bg-navy px-4 font-bold text-white transition hover:bg-[#22345e] active:scale-[.98] disabled:opacity-60"
              >
                אני כאן, המשך
              </button>
              <button
                type="button"
                onClick={() => leave('manual')}
                className="min-h-11 w-full rounded-[10px] border border-[#e6dfcf] px-4 font-medium text-[#6b6352] transition hover:border-[#e8c4bb] hover:bg-[#fdf3f0] hover:text-[#9b3a24]"
              >
                התנתק עכשיו
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
