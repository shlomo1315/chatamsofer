'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// נתונים "חיים": רענון אוטומטי כל כמה שניות/דקות.
//
// ⚠️ סקר (polling) ולא Realtime של Supabase: ה-Realtime בחבילה החינמית
// איטי ולא אמין (ראו session-2026-07-21), וסקר על נקודה אחת פשוט, צפוי,
// ועובד גם מאחורי נטפרי.
//
// ⚠️ עוצר כשהלשונית מוסתרת וממשיך מיד כשחוזרים — מסך שנשאר פתוח כל
// הלילה לא אמור להפציץ את השרת.
//
// 🔴 nextAt — מתי הרענון הבא, לספירה לאחור במסך. רענון ידני (reload)
// מאפס את הטיימר, כדי שהספירה תמיד תתאים למה שיקרה בפועל.
// ─────────────────────────────────────────────────────────────────────────────

export function useLiveData<T>(url: string, intervalMs = 15000) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<number | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [nextAt, setNextAt] = useState<number | null>(null)
  const busy = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopped = useRef(false)

  const fetchOnce = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const res = await fetch(url, { cache: 'no-store' })
      setStatus(res.status)
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError((d as { error?: string }).error ?? 'הטעינה נכשלה'); return }
      setData(d as T); setError(''); setUpdatedAt(new Date())
    } catch {
      // ⚠️ כשל רשת זמני לא מוחק את הנתונים שכבר מוצגים.
      setError('אין חיבור — מנסה שוב')
    } finally {
      busy.current = false
    }
  }, [url])

  /** טוען עכשיו ומתזמן את הבא בעוד intervalMs. */
  // ⚠️ הקריאה העצמית דרך ref — פונקציה אינה יכולה להפנות לעצמה בתוך
  // useCallback שלה (המשתנה טרם הוגדר).
  const reloadRef = useRef<() => Promise<void>>(async () => {})
  const reload = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    if (document.visibilityState === 'visible') await fetchOnce()
    if (stopped.current) return
    setNextAt(Date.now() + intervalMs)
    timer.current = setTimeout(() => { void reloadRef.current() }, intervalMs)
  }, [fetchOnce, intervalMs])
  useEffect(() => { reloadRef.current = reload }, [reload])

  useEffect(() => {
    stopped.current = false
    // ⚠️ setTimeout(0) ולא קריאה ישירה — כלל set-state-in-effect.
    timer.current = setTimeout(() => { void reload() }, 0)
    const onVis = () => { if (document.visibilityState === 'visible') void reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stopped.current = true
      if (timer.current) clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  return { data, error, status, updatedAt, nextAt, reload }
}

/** "לפני 12 שניות" — לשורת הסטטוס. */
export function agoText(d: Date | null, now: number): string {
  if (!d) return 'טוען…'
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000))
  if (s < 5) return 'עודכן עכשיו'
  if (s < 60) return `עודכן לפני ${s} שניות`
  const m = Math.round(s / 60)
  return m === 1 ? 'עודכן לפני דקה' : `עודכן לפני ${m} דקות`
}

/** "העדכון הבא בעוד 4 דקות ו-12 שניות". */
export function nextText(nextAt: number | null, now: number): string {
  if (!nextAt) return ''
  const total = Math.max(0, Math.round((nextAt - now) / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  if (total === 0) return 'מתעדכן…'
  if (m === 0) return `העדכון הבא בעוד ${s} שניות`
  return `העדכון הבא בעוד ${m === 1 ? 'דקה' : `${m} דקות`} ו-${s} שניות`
}
