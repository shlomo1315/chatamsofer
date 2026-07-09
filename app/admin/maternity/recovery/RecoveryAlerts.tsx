'use client'
import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'

export type RecoveryEvent = { id: string; name: string; kind: 'realized' | 'edit'; at: string }

// חלונית התראה תחתונה: מציגה מי מימש זכאות או ביקש תיקון מאז הכניסה האחרונה למסך.
export default function RecoveryAlerts({ events }: { events: RecoveryEvent[] }) {
  // חישוב האירועים החדשים פעם אחת (initializer רץ פעם אחת, לא בכל render ולא כ-setState ב-effect)
  const [show, setShow] = useState<RecoveryEvent[]>(() => {
    if (typeof window === 'undefined') return []
    const last = Number(localStorage.getItem('recovery_last_seen') || 0)
    return events
      .filter(e => new Date(e.at).getTime() > last)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  })

  // סימון הכניסה הנוכחית כ"נראה" — side-effect בלבד, בלי setState
  useEffect(() => {
    localStorage.setItem('recovery_last_seen', String(Date.now()))
  }, [])

  if (!show.length) return null
  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden" dir="rtl"
      style={{ animation: 'pop-in 0.25s ease-out' }}>
      <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-sm flex items-center gap-2"><Bell size={16} /> עדכונים חדשים ({show.length})</span>
        <button onClick={() => setShow([])} className="text-white/70 hover:text-white" aria-label="סגור"><X size={16} /></button>
      </div>
      <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
        {show.map((e, i) => (
          <li key={i} className="px-4 py-2.5 text-sm flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${e.kind === 'edit' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <span className="font-semibold text-slate-800">{e.name}</span>
            <span className={`text-xs ${e.kind === 'edit' ? 'text-amber-600' : 'text-emerald-600'}`}>
              {e.kind === 'edit' ? 'ביקש/ה תיקון' : 'מימשה זכאות'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
