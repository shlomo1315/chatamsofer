'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// נתונים "חיים": רענון אוטומטי כל כמה שניות.
//
// ⚠️ סקר (polling) ולא Realtime של Supabase: ה-Realtime בחבילה החינמית
// איטי ולא אמין (ראו session-2026-07-21), וסקר של 15 שניות על נקודה אחת
// פשוט, צפוי, ועובד גם מאחורי נטפרי.
//
// ⚠️ עוצר כשהלשונית מוסתרת וממשיך מיד כשחוזרים — מסך מנהל שנשאר פתוח
// כל הלילה לא אמור להפציץ את השרת.
// ─────────────────────────────────────────────────────────────────────────────

export function useLiveData<T>(url: string, intervalMs = 15000) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<number | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const busy = useRef(false)

  const load = useCallback(async () => {
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

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    const tick = async () => {
      if (stopped) return
      if (document.visibilityState === 'visible') await load()
      if (!stopped) timer = setTimeout(tick, intervalMs)
    }
    // ⚠️ setTimeout(0) ולא קריאה ישירה — כלל set-state-in-effect.
    timer = setTimeout(tick, 0)
    const onVis = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load, intervalMs])

  return { data, error, status, updatedAt, reload: load }
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
