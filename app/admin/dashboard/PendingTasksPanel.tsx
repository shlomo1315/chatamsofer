'use client'
import { useState, useCallback } from 'react'
import {
  Clock, ArrowUpRight, Users, Landmark, Baby,
  HeartHandshake, HandCoins, X, Loader2, ExternalLink, Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useStaffPermissions } from '@/components/StaffPermissions'

interface PendingTask {
  id: string
  type: 'beneficiary' | 'loan' | 'maternity' | 'widow' | 'financial_aid'
  name: string
  detail: string
  href: string
  createdAt: string
}

const typeConfig: Record<PendingTask['type'], { label: string; icon: React.ElementType; color: string }> = {
  beneficiary:   { label: 'צאצאים',         icon: Users,          color: 'text-indigo-600 bg-indigo-50' },
  loan:          { label: 'הלוואות',         icon: Landmark,       color: 'text-blue-600 bg-blue-50' },
  maternity:     { label: 'יולדות',          icon: Baby,           color: 'text-pink-600 bg-pink-50' },
  widow:         { label: 'אלמנות ויתומים',  icon: HeartHandshake, color: 'text-violet-600 bg-violet-50' },
  financial_aid: { label: 'סיוע רפואי',     icon: HandCoins,      color: 'text-teal-600 bg-teal-50' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function PendingTasksPanel({ count }: { count: number }) {
  const { isAdmin } = useStaffPermissions()   // רק מנהל מלא רשאי להסתיר בקשות מהלוח
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<PendingTask[]>([])
  const [loading, setLoading] = useState(false)
  const [dismissing, setDismissing] = useState<string | null>(null)
  // המספר הגדול מגיע מ-getStats (ממוטמן), ולכן עלול לפגר אחרי הרשימה הטרייה.
  // ברגע שהפאנל נטען, liveCount מסתנכרן לספירה המדויקת כדי שהמספר יתאים לרשימה.
  const [liveCount, setLiveCount] = useState<number | null>(null)

  const handleOpen = useCallback(async () => {
    setOpen(true)
    setLoading(true)
    try {
      const res = await fetch('/api/admin/dashboard/pending-tasks')
      const data = await res.json()
      const list: PendingTask[] = data.tasks ?? []
      setTasks(list)
      setLiveCount(list.length)
    } finally {
      setLoading(false)
    }
  }, [])

  // הסתרת בקשה מהלוח בלבד (לא נוגע בנתונים) — מנהל מלא. מסיר מיד מהרשימה ומעדכן את המונה.
  async function dismiss(task: PendingTask) {
    if (!window.confirm(`להסיר את "${task.name}" מרשימת הממתינים לטיפול?\n(הבקשה עצמה נשארת במערכת — רק נעלמת מכאן)`)) return
    setDismissing(task.id)
    try {
      const res = await fetch('/api/admin/dashboard/pending-tasks/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: task.type, id: task.id }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'ההסתרה נכשלה'); return }
      setTasks(prev => {
        const next = prev.filter(t => t.id !== task.id)
        setLiveCount(next.length)
        return next
      })
    } finally {
      setDismissing(null)
    }
  }

  const shown = liveCount ?? count

  return (
    <>
      {/* KPI Card — same look as the other KpiCards */}
      <button
        onClick={handleOpen}
        // אותו צל בדיוק כמו KpiCard — קודם היה רק hover:shadow-md, ולכן
        // הקובייה נראתה שטוחה לצד השכנות שלה.
        className="group relative flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-amber-50 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-14px_rgba(15,23,42,0.18)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.08),0_18px_36px_-16px_rgba(79,70,229,0.3)] hover:-translate-y-0.5 transition-all duration-200 text-right w-full cursor-pointer"
      >
        {/* המספר בולט למעלה; האייקון עובר לשורת התווית מתחתיו */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] text-slate-500 mb-1">ממתינים לטיפול</p>
            <p className="text-2xl font-bold text-slate-900 ltr-num">{shown}</p>
          </div>
          <ArrowUpRight size={15} className="text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500 text-white shadow-sm flex-shrink-0">
            <Clock size={18} />
          </span>
          <p className="text-xs font-medium text-amber-600">
            {shown > 0 ? 'בקשות בכל האגפים' : 'אין בקשות ממתינות'}
          </p>
        </div>
      </button>

      {/* Slide-over panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[80vh] animate-[welcome-in_0.2s_ease-out]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500 text-white shadow-sm">
                  <Clock size={18} />
                </span>
                <div>
                  <h2 className="text-base font-bold text-zinc-900">ממתינים לטיפול</h2>
                  <p className="text-xs text-zinc-500">{shown} בקשות פתוחות בכל האגפים</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                aria-label="סגור"
              >
                <X size={18} />
              </button>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-zinc-400">
                  <Loader2 size={22} className="animate-spin text-amber-500" />
                  <span className="text-sm">טוען בקשות...</span>
                </div>
              ) : tasks.length === 0 ? (
                <div className="py-14 text-center text-zinc-400 text-sm">
                  <Clock size={32} className="mx-auto mb-3 text-zinc-200" />
                  אין בקשות ממתינות כרגע
                </div>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {tasks.map(task => {
                    const cfg = typeConfig[task.type]
                    const Icon = cfg.icon
                    return (
                      <Link
                        key={task.id}
                        href={task.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-6 py-3.5 hover:bg-zinc-50 transition-colors group"
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                          <Icon size={15} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-800 truncate">{task.name}</p>
                          <p className="text-xs text-zinc-400">{task.detail} · {formatDate(task.createdAt)}</p>
                        </div>
                        <span className="text-[11px] text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full flex-shrink-0 hidden sm:inline">
                          {cfg.label}
                        </span>
                        {/* הסתרה מהלוח — מנהל מלא בלבד. לא מנווט (preventDefault) ולא נוגע בנתונים */}
                        {isAdmin && (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismiss(task) }}
                            disabled={dismissing === task.id}
                            title="הסר מרשימת הממתינים (הבקשה נשארת במערכת)"
                            className="flex-shrink-0 p-1.5 rounded-lg text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-40"
                          >
                            {dismissing === task.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        )}
                        <ExternalLink size={13} className="text-zinc-300 group-hover:text-zinc-500 transition-colors flex-shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50 rounded-b-2xl text-center">
              <p className="text-xs text-zinc-400">לחץ על כל שורה לפתיחת הפרטים המלאים</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
