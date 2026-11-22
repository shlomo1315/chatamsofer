'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquareWarning, Check, CalendarClock, Loader2 } from 'lucide-react'
import { PORTAL_NOTES_CHANGED } from '@/components/admin/LoanPortalNoteAlert'

// הערת פורטל הביצוע בתוך כרטסת ההלוואה.
// ⚠️ עד עכשיו ההערה לא הוצגה בשום מסך ניהול. כאן היא מוצגת תמיד (גם אחרי
// "טופל"), והכפתורים מופיעים רק כשההתראה פתוחה.

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : ''
const fmtDay = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Asia/Jerusalem' }) : ''
const tomorrowIl = () => new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })

export default function PortalNotePanel({ loanId, note, noteAt, alert, remindAt, handledAt }: {
  loanId: string
  note: string
  noteAt: string | null
  alert: string | null
  remindAt: string | null
  handledAt: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [snoozing, setSnoozing] = useState(false)
  const [date, setDate] = useState(tomorrowIl)
  const [error, setError] = useState('')
  // ⚠️ "עכשיו" נקבע פעם אחת בטעינה — Date.now() ישירות ב-render אינו טהור.
  const [now] = useState(() => Date.now())
  const open = alert === 'open'
  const due = open && (!remindAt || new Date(remindAt).getTime() <= now)

  const act = async (action: 'handled' | 'snooze') => {
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/admin/loans/portal-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: loanId, action, remind_at: action === 'snooze' ? date : undefined }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'הפעולה נכשלה'); return }
      window.dispatchEvent(new Event(PORTAL_NOTES_CHANGED))
      setSnoozing(false)
      router.refresh()
    } catch {
      setError('שגיאת תקשורת — נסו שוב')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`rounded-xl border px-4 py-3 ${due ? 'border-rose-300 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
          due ? 'animate-portal-note-flash' : 'border-amber-300 bg-white text-amber-800'}`}>
          <MessageSquareWarning size={12} /> הערה מפורטל הביצוע
        </span>
        {noteAt && <span className="text-[11px] text-slate-500 ltr-num">{fmt(noteAt)}</span>}
        {open && !due && remindAt && (
          <span className="text-[11px] font-semibold text-sky-700">· תזכורת ב־{fmtDay(remindAt)}</span>
        )}
        {alert === 'handled' && (
          <span className="text-[11px] font-semibold text-emerald-700">· טופל{handledAt ? ` ${fmtDay(handledAt)}` : ''}</span>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-900">{note}</p>

      {open && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void act('handled')} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy && !snoozing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} טופל
          </button>
          <button type="button" onClick={() => setSnoozing(s => !s)} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-sky-300 hover:text-sky-700 disabled:opacity-50">
            <CalendarClock size={12} /> לטיפול בהמשך
          </button>
          {snoozing && (
            <span className="inline-flex flex-wrap items-center gap-2">
              <input type="date" value={date} min={tomorrowIl()} onChange={e => setDate(e.target.value)}
                aria-label="תאריך תזכורת"
                className="rounded-lg border border-sky-200 bg-white px-2 py-1 text-xs text-slate-800" />
              <button type="button" onClick={() => void act('snooze')} disabled={busy || !date}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50">
                {busy ? <Loader2 size={12} className="animate-spin" /> : null} קביעת תזכורת
              </button>
            </span>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}
