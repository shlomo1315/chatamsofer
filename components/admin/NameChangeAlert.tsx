'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { UserPen, Loader2, Check, X } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// חלונית התראה על בקשות שינוי שם ממתינות.
//
// 🔴 קופצת בכניסה לתוכנה: בקשת שינוי שם חוסמת את המשתמש — הוא רואה במסך
// שלו שם שגוי ואינו יכול לתקן בעצמו. התראה שממתינה לכניסה למסך ייעודי
// הייתה משאירה אותו כך לימים.
//
// ⚠️ סגירה אינה מכריעה: הבקשות נשארות גם ב"ממתינים לטיפול", כדי שמנהל
// שסגר בטעות לא יאבד אותן.
// ─────────────────────────────────────────────────────────────────────────────

interface Req {
  id: string
  beneficiary_id: string
  target: 'self' | 'spouse'
  old_name: string | null
  new_name: string
  requested_at: string
  familyName: string
}

/** ⚠️ נזכר ב-sessionStorage ולא ב-localStorage: "לא עכשיו" תקף לסשן הזה
 *  בלבד. בקשה שלא הוכרעה חייבת לחזור ולהופיע מחר. */
const DISMISS_KEY = 'name-change-alert-dismissed'

export default function NameChangeAlert() {
  const router = useRouter()
  const [reqs, setReqs] = useState<Req[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/name-changes', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (r.ok) setReqs(d.requests ?? [])
    } catch { /* שקט — לא מפילים את הכניסה לתוכנה */ }
  }, [])

  useEffect(() => {
    try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1') } catch { setDismissed(false) }
    void load()
  }, [load])

  const decide = async (id: string, approve: boolean) => {
    setBusy(id)
    try {
      const r = await fetch('/api/admin/name-changes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approve }),
      })
      if (r.ok) {
        setReqs(prev => prev.filter(x => x.id !== id))
        router.refresh()
      }
    } catch { /* נשאר ברשימה — ניסיון חוזר */ }
    finally { setBusy(null) }
  }

  const close = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  if (dismissed || !reqs.length) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <UserPen size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800">בקשות לתיקון שם</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {reqs.length} ממתינות לאישורך
            </p>
          </div>
          <button type="button" onClick={close} aria-label="סגירה"
            className="text-slate-400 transition hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 flex flex-col gap-2.5">
          {reqs.map(r => (
            <div key={r.id} className="rounded-xl border border-slate-200 px-3.5 py-3">
              <p className="text-[13px] font-bold text-slate-800">{r.familyName}</p>
              <p className="mt-1 text-[12px] text-slate-600">
                {r.target === 'spouse' ? 'שם האישה' : 'שם הבעל'}:{' '}
                <span className="text-rose-600 line-through">{r.old_name || '—'}</span>
                <span className="mx-1.5 text-slate-400">→</span>
                <span className="font-bold text-emerald-700">{r.new_name}</span>
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button type="button" onClick={() => void decide(r.id, true)} disabled={busy === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                  {busy === r.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  אישור
                </button>
                <button type="button" onClick={() => void decide(r.id, false)} disabled={busy === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-50">
                  <X size={11} /> דחייה
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ⚠️ נאמר במפורש: סגירה אינה מוחקת. אחרת מנהל שממהר חושש לסגור. */}
        <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">
            הבקשות נשמרות גם ב״ממתינים לטיפול״
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
