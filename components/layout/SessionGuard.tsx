'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
  try { localStorage.setItem(LOGOUT_KEY, String(Date.now())) } catch { /* מצב פרטי */ }
  await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
  // יציאה ידנית מנתקת את כל הסשנים (כמו קודם); ניתוק אוטומטי — רק את המחשב הזה.
  await createClient().auth.signOut(reason === 'manual' ? undefined : { scope: 'local' }).catch(() => {})
  window.location.href = reason === 'manual' ? '/login' : `/login?reason=${reason}`
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/60 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="session-guard-title"
          aria-describedby="session-guard-desc"
          dir="rtl"
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#fffdf8] p-6 shadow-2xl text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-navy text-gold">
              <Clock size={22} aria-hidden />
            </div>
            <h2 id="session-guard-title" className="text-lg font-bold text-navy">האם אתה עדיין כאן?</h2>
            <p id="session-guard-desc" className="mt-2 text-sm text-slate-600">
              לא הייתה פעילות במערכת 30 דקות. מטעמי אבטחה תנותק בעוד
            </p>
            <p className="mt-3 text-4xl font-bold text-navy tabular-nums" aria-live="polite">{secondsLeft}</p>
            <p className="text-xs text-slate-500">שניות</p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                autoFocus
                disabled={busy}
                onClick={stay}
                className="w-full rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white hover:bg-navy/90 disabled:opacity-60"
              >
                אני כאן, המשך
              </button>
              <button
                type="button"
                onClick={() => leave('manual')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e6dfcf] px-4 py-3 text-sm font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-700"
              >
                <LogOut size={15} aria-hidden />
                התנתק
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
