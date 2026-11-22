'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, Loader2, CheckCircle2, MessageSquare } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// תיקים "ממתינים לתשובת היולדת" שהמשפחה כבר פעלה בהם (22.11.2026).
//
// תיק יצא מההמתנה רק בתשובה למייל. משפחה שתיקנה דורות בקישור/באזור האישי או
// העלתה מסמך נשארה תקועה. מעכשיו זה נרשם מיד; המסך הזה משחרר את מה שנתקע
// לפני התיקון. מציג קודם — ומשחרר רק בלחיצה.
// ─────────────────────────────────────────────────────────────────────────────

type Case = { aidId: string; family: string; askedAt: string; actions: string[] }

const fmt = (d: string) => new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })

export default function InquiryReleasePage() {
  const [cases, setCases] = useState<Case[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/admin/maternity/inquiry-backfill')
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'שגיאה'); setCases(d.cases) })
      .catch(e => setErr(e instanceof Error ? e.message : 'שגיאה'))
  }, [])

  const release = async () => {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/admin/maternity/inquiry-backfill', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'שגיאה')
      setDone(d.released)
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה') }
    finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/admin/maternity" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-navy"><ArrowRight size={16} /> חזרה ליולדות</Link>
      <div>
        <h1 className="text-2xl font-extrabold text-navy-dark">תיקים שהמשפחה כבר השיבה בהם</h1>
        <p className="mt-1 text-sm text-ink-soft">
          תיקים שנמצאים ב&quot;ממתין לתשובת היולדת&quot;, אבל המשפחה כבר פעלה אחרי הבירור — תיקנה את סדר הדורות או העלתה מסמכים — ולא השיבה למייל.
          השחרור מחזיר אותם לרשימה עם תווית &quot;חזר מבירור&quot;. שום דבר אחר בתיק לא משתנה.
        </p>
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>}

      {done !== null ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-800">
          <CheckCircle2 size={20} /> שוחררו {done} תיקים. הם מופיעים עכשיו ב&quot;ממתין לאישור&quot; עם התווית &quot;חזר מבירור&quot;.
        </div>
      ) : cases === null && !err ? (
        <p className="flex items-center gap-2 py-10 text-ink-soft"><Loader2 size={18} className="animate-spin" /> בודק את התיקים…</p>
      ) : cases && cases.length === 0 ? (
        <p className="rounded-xl border border-line bg-white px-4 py-6 text-center text-ink-soft">אין תיקים כאלה — כל התיקים הממתינים באמת ממתינים לתשובה.</p>
      ) : cases && (
        <>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-white">
            {cases.map(c => (
              <li key={c.aidId} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/admin/maternity/${c.aidId}`} className="font-bold text-navy-dark hover:underline">{c.family || 'ללא שם'}</Link>
                  <span className="text-xs text-ink-faint">הבירור נשלח {fmt(c.askedAt)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.actions.map(a => <span key={a} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">✓ {a}</span>)}
                </div>
              </li>
            ))}
          </ul>
          <button type="button" onClick={release} disabled={busy}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-navy px-6 py-3 text-base font-bold text-white hover:bg-navy-dark disabled:opacity-60">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <MessageSquare size={18} />}
            שחרר {cases.length} תיקים לרשימה
          </button>
        </>
      )}
    </div>
  )
}
