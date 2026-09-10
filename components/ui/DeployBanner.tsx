'use client'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// באנר עדכון גרסה — צף בראש המסך.
//
// 🔴 שני מצבים שונים, ושניהם קרו בפועל היום:
//
//   1. "אין לבצע פעולות" — השרת אינו עונה כרגע, כלומר פריסה באמצע. מנהל
//      שעדכן מלאי של 300 כרטיסים בדיוק אז קיבל "שגיאת רשת", לא ידע אם
//      הפעולה נכנסה, והמלאי לא עודכן.
//
//   2. "עלה עדכון — לחצו לרענון" — הפריסה הסתיימה, אבל הדפדפן עדיין מריץ
//      את הקוד הישן. עד עכשיו לא היה שום סימן לכך, והמשתמש המשיך לעבוד
//      מול באנדל ישן.
//
// ⚠️ הבדיקה קלה בכוונה: /api/health בלבד, בלי גישה למסד, כל 20 שניות.
//
// ⚠️ שתי כשלים ברצף לפני שמכריזים "באמצע עדכון": כשל בודד קורה גם ברשת
// רועדת, והבאנר היה קופץ סתם.
// ─────────────────────────────────────────────────────────────────────────────

const POLL_MS = 20_000

export default function DeployBanner() {
  const [state, setState] = useState<'ok' | 'down' | 'updated'>('ok')
  const buildRef = useRef<string | null>(null)
  const failsRef = useRef(0)

  useEffect(() => {
    let alive = true

    const check = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const d = await res.json() as { build?: string }
        if (!alive) return

        failsRef.current = 0
        const build = d.build ?? ''

        // ⚠️ הערך הראשון רק נזכר — אין מולו מה להשוות עדיין.
        if (!buildRef.current) { buildRef.current = build; setState('ok'); return }

        // 🔴 מזהה חדש = מכולה חדשה = הקוד בדפדפן ישן.
        if (build && build !== buildRef.current) { setState('updated'); return }

        // ⚠️ חזר לענות אחרי נפילה — אבל *לא* דורסים 'updated': אם כבר
        // ידוע שעלתה גרסה, ההודעה לרענן חשובה יותר.
        setState(s => (s === 'updated' ? s : 'ok'))
      } catch {
        if (!alive) return
        failsRef.current += 1
        if (failsRef.current >= 2) setState(s => (s === 'updated' ? s : 'down'))
      }
    }

    const t = setInterval(check, POLL_MS)
    check()
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (state === 'ok') return null

  // 🔴 רענון קשיח: reload() לבדו עלול להגיש מהמטמון. ניקוי מטמון ה-Service
  // Worker וה-Cache API לפניו מבטיח שהבאנדל החדש באמת נטען.
  const hardReload = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } catch { /* מטמון חסום — הרענון עדיין שווה ניסיון */ }
    // ⚠️ פרמטר משתנה בכתובת: חלק מהדפדפנים מגישים את ה-HTML מהמטמון
    // גם ב-reload רגיל.
    const u = new URL(window.location.href)
    u.searchParams.set('_v', String(Date.now()))
    window.location.replace(u.toString())
  }

  return (
    <div dir="rtl" className="fixed inset-x-0 top-0 z-[9999] flex justify-center px-3 pt-2">
      {state === 'down' ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 shadow-lg animate-pulse">
          <AlertTriangle size={16} className="shrink-0 text-amber-600" />
          <span className="text-sm font-bold text-amber-900">
            שימו לב — אין לבצע פעולות כרגע, עולה עדכון גרסה
          </span>
        </div>
      ) : (
        <button onClick={hardReload}
          className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 shadow-lg transition hover:bg-emerald-100">
          <RefreshCw size={16} className="shrink-0 text-emerald-600" />
          <span className="text-sm font-bold text-emerald-900">
            בוצע עדכון גרסה — לחצו לרענון
          </span>
        </button>
      )}
    </div>
  )
}
