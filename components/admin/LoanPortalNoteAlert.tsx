'use client'
import { useState, useEffect, useCallback } from 'react'
import { MessageSquareWarning, Loader2, Check, X, ExternalLink, CalendarClock } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// התראה על הערות שנכתבו בפורטל הביצוע (/shared/loans) על הלוואה מסוימת.
//
// 🔴 קופצת למזכירות ההלוואות בכניסה לתוכנה, כמו חלונית בקשות שינוי השם.
// לכל הערה: פתיחת הכרטסת · טופל · לטיפול בהמשך (עם תאריך תזכורת).
//
// ⚠️ "לא עכשיו" (סגירת החלונית) נזכר ב-sessionStorage בלבד — ההערות חוזרות
// בכניסה הבאה. רק "טופל" או "לטיפול בהמשך" מורידים הערה באמת.
// ─────────────────────────────────────────────────────────────────────────────

export interface PortalNoteAlertItem {
  id: string
  beneficiary_id: string
  amount: number
  installments: number | null
  status: string
  note: string
  note_at: string | null
  remind_at: string | null
  note_sent_at: string | null
  disbursed_at: string | null
  familyName: string
  id_number: string | null
  phone: string | null
  city: string | null
  /** הגיע מועד הטיפול (או שלא נדחתה) — קופצת ומהבהבת. */
  due: boolean
}

const DISMISS_KEY = 'loan-portal-note-alert-dismissed'
/** אירוע שמסנכרן בין החלונית לרשימת ההלוואות (הבהוב בשורות). */
export const PORTAL_NOTES_CHANGED = 'loan-portal-notes-changed'
/** אירוע שפותח את החלונית מחדש (מהבאנר במסך ההלוואות). */
export const PORTAL_NOTES_OPEN = 'loan-portal-notes-open'

export async function fetchPortalNoteAlerts(): Promise<PortalNoteAlertItem[]> {
  try {
    const r = await fetch('/api/admin/loans/portal-notes', { cache: 'no-store' })
    if (!r.ok) return []
    const d = await r.json().catch(() => ({}))
    return (d.alerts ?? []) as PortalNoteAlertItem[]
  } catch { return [] }
}

/** רשימת ההתראות, מתעדכנת אחרי כל פעולה בחלונית. */
export function usePortalNoteAlerts(enabled = true) {
  const [alerts, setAlerts] = useState<PortalNoteAlertItem[]>([])
  const load = useCallback(async () => { setAlerts(await fetchPortalNoteAlerts()) }, [])
  useEffect(() => {
    if (!enabled) return
    // ⚠️ טעינה אסינכרונית ממקור חיצוני (ה-API) — לא לולאת רינדור.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const on = () => void load()
    window.addEventListener(PORTAL_NOTES_CHANGED, on)
    return () => window.removeEventListener(PORTAL_NOTES_CHANGED, on)
  }, [enabled, load])
  return alerts
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Asia/Jerusalem' }) : ''
const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : ''
const fmtCur = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`

/** מחר, בפורמט YYYY-MM-DD לפי שעון ישראל — ברירת המחדל לתזכורת. */
function tomorrowIl(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

function stageLabel(a: PortalNoteAlertItem): string {
  if (a.disbursed_at) return `בוצעה ${fmtDate(a.disbursed_at)}`
  if (a.note_sent_at) return 'נשלח שטר — ממתין לביצוע'
  return 'ממתינה לביצוע'
}

function AlertCard({ a, onDone }: { a: PortalNoteAlertItem; onDone: (id: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [snoozing, setSnoozing] = useState(false)
  const [date, setDate] = useState(tomorrowIl)
  const [error, setError] = useState('')

  const act = async (action: 'handled' | 'snooze') => {
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/admin/loans/portal-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, action, remind_at: action === 'snooze' ? date : undefined }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'הפעולה נכשלה'); return }
      onDone(a.id)
    } catch {
      setError('שגיאת תקשורת — נסו שוב')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-white px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-slate-800">{a.familyName}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {a.id_number && <span className="ltr-num" dir="ltr">{a.id_number}</span>}
            {a.id_number && ' · '}
            <span className="ltr-num">{fmtCur(a.amount)}</span>
            {a.installments ? ` · ${a.installments} תשלומים` : ''}
            {' · '}{stageLabel(a)}
          </p>
        </div>
        {a.note_at && (
          <span className="flex-shrink-0 text-[10px] text-slate-400 ltr-num">{fmtDateTime(a.note_at)}</span>
        )}
      </div>

      {/* ההערה עצמה — זה מה שהחלונית קיימת בשבילו, ולכן בולטת. */}
      <p className="mt-2 whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-950">
        {a.note}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <a href={`/admin/loans/${a.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-navy-dark">
          <ExternalLink size={11} /> פתיחת הכרטסת
        </a>
        <button type="button" onClick={() => setSnoozing(s => !s)} disabled={busy}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-50 ${
            snoozing ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-700'}`}>
          <CalendarClock size={11} /> לטיפול בהמשך
        </button>
        <button type="button" onClick={() => void act('handled')} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
          {busy && !snoozing ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          טופל
        </button>
      </div>

      {snoozing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2">
          <label className="text-[11px] font-semibold text-sky-900" htmlFor={`remind-${a.id}`}>להזכיר לי ב־</label>
          <input id={`remind-${a.id}`} type="date" value={date} min={tomorrowIl()}
            onChange={e => setDate(e.target.value)}
            className="rounded-lg border border-sky-200 bg-white px-2 py-1 text-[12px] text-slate-800" />
          <button type="button" onClick={() => void act('snooze')} disabled={busy || !date}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-sky-700 disabled:opacity-50">
            {busy ? <Loader2 size={11} className="animate-spin" /> : <CalendarClock size={11} />}
            קביעת תזכורת
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  )
}

export default function LoanPortalNoteAlert({ enabled }: { enabled: boolean }) {
  const [alerts, setAlerts] = useState<PortalNoteAlertItem[]>([])
  const [dismissed, setDismissed] = useState(true)

  const load = useCallback(async () => { setAlerts(await fetchPortalNoteAlerts()) }, [])

  useEffect(() => {
    if (!enabled) return
    // ⚠️ sessionStorage קיים רק בדפדפן — נקרא אחרי ההרכבה כדי לא לשבור hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1') } catch { setDismissed(false) }
    void load()
    // פתיחה מחדש מהבאנר במסך ההלוואות — גם אחרי "לא עכשיו".
    const open = () => { setDismissed(false); void load() }
    window.addEventListener(PORTAL_NOTES_OPEN, open)
    return () => window.removeEventListener(PORTAL_NOTES_OPEN, open)
  }, [enabled, load])

  const due = alerts.filter(a => a.due)

  const done = (id: string) => {
    setAlerts(prev => prev.filter(x => x.id !== id))
    window.dispatchEvent(new Event(PORTAL_NOTES_CHANGED))
  }

  const close = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  if (!enabled || dismissed || !due.length) return null

  return (
    <div className="dlg-backdrop">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden" dir="rtl">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border animate-portal-note-flash">
            <MessageSquareWarning size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800">הערות מפורטל הביצוע</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {due.length === 1 ? 'הערה אחת ממתינה לטיפול' : `${due.length} הערות ממתינות לטיפול`}
            </p>
          </div>
          <button type="button" onClick={close} aria-label="סגירה"
            className="text-slate-400 transition hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto bg-slate-50/60 p-4 flex flex-col gap-2.5">
          {due.map(a => <AlertCard key={a.id} a={a} onDone={done} />)}
        </div>

        {/* ⚠️ נאמר במפורש: סגירה אינה מוחקת. */}
        <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">
            ההערות יחזרו בכניסה הבאה עד שיסומנו ״טופל״ או ״לטיפול בהמשך״
          </span>
          <button type="button" onClick={close}
            className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50">
            לא עכשיו
          </button>
        </div>
      </div>
    </div>
  )
}
