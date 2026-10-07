'use client'
import { useState } from 'react'
import { AudioLines, Loader2, Check } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// שחזור הקלטות שם/כתובת חסרות + תמלול (בקשת המשתמש 08.10).
//
// ⚠️ כפתור ולא קישור: NetFree חוסם ניווט ישיר לכתובת API חדשה, ולכן
// ההפעלה היא בקשה מתוך דף המערכת — כמו כל פעולה אחרת.
//
// ⚠️ הנתיב עובד במנות של ~3 דקות; הכפתור חוזר עליו עד done (בטוח להרצה
// חוזרת — שום דבר לא משוכפל).
// ─────────────────────────────────────────────────────────────────────────────

type Result = {
  name_rescued: number; addr_rescued: number; addr_for_staff: number
  extra_recordings: number; not_found: number; transcribed: number
  stt_remaining: number; orders_remaining: number; done: boolean
  error?: string; blockByNetFree?: boolean
}

const ZERO = { name_rescued: 0, addr_rescued: 0, extra_recordings: 0, not_found: 0, transcribed: 0 }

export default function RecordingRescue({ canEdit }: { canEdit: boolean }) {
  const [busy, setBusy] = useState(false)
  const [round, setRound] = useState(0)
  const [total, setTotal] = useState(ZERO)
  const [last, setLast] = useState<Result | null>(null)
  const [error, setError] = useState('')

  async function run() {
    setBusy(true); setError(''); setTotal(ZERO); setLast(null)
    const sum = { ...ZERO }
    try {
      for (let i = 1; i <= 15; i++) {
        setRound(i)
        const res = await fetch('/api/admin/book-fair/rescue-recordings', { method: 'POST' })
        const d = await res.json().catch(() => ({})) as Result
        if (d.blockByNetFree) { setError('הבקשה נחסמה ע״י NetFree — יש לבקש מהם לאשר את הכתובת'); return }
        if (!res.ok) { setError(d.error ?? `השחזור נכשל (${res.status})`); return }
        for (const k of Object.keys(sum) as (keyof typeof ZERO)[]) sum[k] += d[k] ?? 0
        setTotal({ ...sum })
        setLast(d)
        if (d.done) return
      }
      setError('השחזור לא הסתיים אחרי 15 סבבים — לחצו שוב להמשך')
    } catch {
      setError('השחזור נכשל — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
        <AudioLines size={17} className="text-indigo-600" /> שחזור הקלטות ותמלול
      </h2>
      <p className="mb-3 text-sm text-slate-500">
        מאתר בימות הקלטות שם וכתובת שחסרות בהזמנות הטלפוניות, ומתמלל כל הקלטה שאין לה תמלול.
        כשאי אפשר לדעת בוודאות איזו הקלטה היא הכתובת — כל הקלטות השיחה מצורפות להזמנה לבחירתכם.
      </p>
      <button
        onClick={() => void run()}
        disabled={!canEdit || busy}
        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? <><Loader2 size={15} className="animate-spin" /> סבב {round} — עשוי לקחת כמה דקות…</> : 'הפעלת השחזור'}
      </button>

      {(last || busy) && (
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-3">
          <li>שמות ששוחזרו: <b>{total.name_rescued}</b></li>
          <li>כתובות ששוחזרו: <b>{total.addr_rescued}</b></li>
          <li>הקלטות נוספות שצורפו: <b>{total.extra_recordings}</b></li>
          <li>תומללו: <b>{total.transcribed}</b></li>
          {last && <li>כתובות לבחירתכם: <b>{last.addr_for_staff}</b></li>}
          {total.not_found > 0 && <li className="text-amber-700">לא נמצאו בימות: <b>{total.not_found}</b></li>}
        </ul>
      )}
      {last?.done && (
        <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700"><Check size={15} /> הסתיים</p>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  )
}
