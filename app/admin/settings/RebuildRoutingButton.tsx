'use client'
import { useState, useEffect } from 'react'
import { Loader2, Wrench, AlertTriangle, Check, RefreshCw } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// תיקון רטרואקטיבי של ניתוב מיילים ישנים (שנתקעו ב-office כי Resend לא שלח
// headers). מושך received_for מ-Resend ומנתב מחדש. תמיד תצוגה מקדימה קודם.
// ─────────────────────────────────────────────────────────────────────────────

interface Preview {
  נמשכו_מ_Resend: number
  נסרקו: number
  ללא_התאמה: number
  ללא_שינוי: number
  דולגו_בבטחה: number
  ישונו: number
  פילוח: Record<string, number>
  דוגמאות: { from: string; to: string; subject: string }[]
}

export default function RebuildRoutingButton() {
  const [data, setData] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState('')
  const [err, setErr] = useState('')
  const [confirming, setConfirming] = useState(false)

  const load = () => {
    setLoading(true); setErr('')
    fetch('/api/admin/mail/rebuild-from-resend')
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setData(d) })
      .catch(() => setErr('הטעינה נכשלה'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const run = async () => {
    setRunning(true); setErr(''); setDone('')
    try {
      const res = await fetch('/api/admin/mail/rebuild-from-resend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'התיקון נכשל'); return }
      setDone(`${d.תוקנו} מיילים שויכו מחדש לתיבה הנכונה` + (d.נכשלו ? ` · ${d.נכשלו} נכשלו` : ''))
      setConfirming(false)
      load()
    } catch {
      setErr('שגיאת תקשורת')
    } finally { setRunning(false) }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-500 text-sm py-6"><Loader2 size={16} className="animate-spin" /> בודק את המיילים הישנים…</div>
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-2 py-2">
        <p className="text-sm text-red-600">{err || 'הטעינה נכשלה'}</p>
        <button onClick={load} className="self-start text-sm text-slate-600 inline-flex items-center gap-1.5"><RefreshCw size={13} /> נסה שוב</button>
      </div>
    )
  }

  const toFix = data.ישונו
  const nothing = toFix === 0

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500 leading-relaxed">
        מיילים ישנים שנקלטו לפני תיקון הניתוב נשמרו כולם תחת &quot;משרד ראשי&quot;, כי
        בעבר הנמען האמיתי לא נשמר. כאן מושכים מ-Resend את הנמען המקורי ומשייכים כל
        מייל לתיבה הנכונה. <strong>בטוח</strong> — לא נמחק דבר, רק משתנה השיוך.
      </p>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>נסרקו {data.נסרקו.toLocaleString('he-IL')} מיילים · נמשכו {data.נמשכו_מ_Resend.toLocaleString('he-IL')} מ-Resend</span>
        <button onClick={load} className="text-slate-400 hover:text-slate-600" title="רענון"><RefreshCw size={13} /></button>
      </div>

      {nothing ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
          <Check size={15} /> כל המיילים מנותבים נכון — אין מה לתקן
        </p>
      ) : (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 flex flex-col gap-3">
          <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-1.5">
            <AlertTriangle size={15} /> {toFix} מיילים ישויכו מחדש
          </h4>

          <div className="flex flex-col gap-1 text-sm text-indigo-900">
            {Object.entries(data.פילוח).sort((a, b) => b[1] - a[1]).map(([move, n]) => (
              <div key={move} className="flex items-center justify-between bg-white/60 rounded-lg px-2.5 py-1.5">
                <span dir="ltr" className="text-xs">{move}</span>
                <span className="tabular-nums font-semibold">{n}</span>
              </div>
            ))}
          </div>

          {data.דוגמאות.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-indigo-800 font-medium">הצג דוגמאות</summary>
              <div className="mt-2 flex flex-col gap-1">
                {data.דוגמאות.slice(0, 15).map((d, i) => (
                  <div key={i} className="bg-white/70 rounded-lg px-2.5 py-1.5">
                    <p className="font-medium text-slate-800 truncate">{d.subject}</p>
                    <p className="text-slate-500 text-[11px]" dir="ltr">{d.from} → {d.to}</p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {!confirming ? (
            <button onClick={() => setConfirming(true)}
              className="self-start inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              <Wrench size={14} /> תקן את הניתוב
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-white border border-indigo-300 rounded-lg p-3">
              <p className="text-sm text-slate-700 flex-1">{toFix} מיילים ישויכו מחדש. להמשיך?</p>
              <button onClick={() => setConfirming(false)} disabled={running}
                className="text-sm text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50">ביטול</button>
              <button onClick={run} disabled={running}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3.5 py-1.5 rounded-lg disabled:opacity-50">
                {running ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />} כן, תקן
              </button>
            </div>
          )}
        </div>
      )}

      {done && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
          <Check size={15} /> {done}
        </p>
      )}
      {err && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{err}</p>}
    </div>
  )
}
