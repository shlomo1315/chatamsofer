'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Bell, MessageSquare } from 'lucide-react'

// פעמון ההתראות. כרגע מציג תשובות שהתקבלו בבירורי הלוואות.
// נטען כל דקה, וגם מיד עם חזרה ללשונית.

interface Notification {
  id: string
  kind: string
  title: string
  detail: string
  href: string
  at: string
}

const fmt = (d: string) => {
  const diff = Date.now() - new Date(d).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'הרגע'
  if (min < 60) return `לפני ${min} דק׳`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `לפני ${hr} שע׳`
  return new Date(d).toLocaleDateString('he-IL')
}

export default function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const load = () => {
    fetch('/api/admin/notifications')
      .then(r => r.json())
      .then(d => setItems(d.notifications ?? []))
      .catch(() => {})
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    // רענון מיידי כשחוזרים ללשונית — אחרת ההתראה מתעכבת עד לטיק הבא
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [])

  useEffect(() => {
    const f = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        title={items.length ? `${items.length} התראות` : 'אין התראות'}
      >
        <Bell size={18} />
        {items.length > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-bold text-slate-800">התראות</p>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">אין התראות חדשות</p>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
              {items.map(n => (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2.5 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquare size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-slate-800 leading-snug">{n.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-snug">{n.detail}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{fmt(n.at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
