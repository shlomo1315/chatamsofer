'use client'
import { useState, useEffect } from 'react'
import { Loader2, Trash2, AlertTriangle, Check, RefreshCw } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// ניקוי תיבת המייל.
//
// מציג תמיד תצוגה מקדימה קודם — פעולה שמוחקת מיילים לא רצה בלחיצה אחת.
// ─────────────────────────────────────────────────────────────────────────────

interface Preview {
  סהכ_מיילים: number
  פילוח_לפי_תיבה: Record<string, number>
  תשובות_בירור_שיוסרו: number
  מיילים_יתומים_שישויכו_למשרד: number
  דוגמאות: { נושא: string; מאת: string; בתיבה: string; מתי: string }[]
}

export default function MailCleanup() {
  const [data, setData] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState('')
  const [err, setErr] = useState('')
  const [confirming, setConfirming] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/admin/mail/cleanup')
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setData(d) })
      .catch(() => setErr('הטעינה נכשלה'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const run = async () => {
    setRunning(true); setErr(''); setDone('')
    try {
      const res = await fetch('/api/admin/mail/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'הניקוי נכשל'); return }

      setDone(`הוסרו ${d.תשובות_בירור_שהוסרו} תשובות בירור · ${d.יתומים_ששויכו_למשרד} מיילים שויכו למשרד הראשי`)
      setConfirming(false)
      load()
    } catch {
      setErr('שגיאת תקשורת')
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-500 text-sm py-6"><Loader2 size={16} className="animate-spin" /> טוען…</div>
  }
  if (!data) {
    return <p className="text-sm text-red-600 py-4">{err || 'הטעינה נכשלה'}</p>
  }

  const toRemove = data.תשובות_בירור_שיוסרו
  const toFix = data.מיילים_יתומים_שישויכו_למשרד
  const nothing = toRemove === 0 && toFix === 0

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500 leading-relaxed">
        מסיר מהדואר הנכנס תשובות שכבר מוצגות בצ&apos;אט של ההלוואה, ומשייך לתיבה הנכונה
        מיילים שנשמרו תחת כתובת המערכת ולכן לא הופיעו בשום תיבה.
      </p>

      {/* פילוח התיבות */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-slate-700">
            הדואר הנכנס ({data.סהכ_מיילים.toLocaleString('he-IL')})
          </h4>
          <button onClick={load} className="text-slate-400 hover:text-slate-600" title="רענון">
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {Object.entries(data.פילוח_לפי_תיבה)
            .sort((a, b) => b[1] - a[1])
            .map(([box, n]) => {
              const orphan = box.includes('@in.')
              return (
                <div key={box} className={`flex items-center justify-between text-sm px-3 py-1.5 rounded-lg ${orphan ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                  <span className={orphan ? 'text-amber-800 font-medium' : 'text-slate-600'} dir="ltr">
                    {box}{orphan && ' ← אינה תיבה אמיתית'}
                  </span>
                  <span className="text-slate-500 tabular-nums">{n}</span>
                </div>
              )
            })}
        </div>
      </div>

      {nothing ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
          <Check size={15} /> תיבת המייל נקייה — אין מה לתקן
        </p>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3">
          <h4 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
            <AlertTriangle size={15} /> מה יתוקן
          </h4>

          <div className="flex flex-col gap-1.5 text-sm text-amber-900">
            {toRemove > 0 && (
              <p>• <strong>{toRemove}</strong> תשובות בירור <strong>יימחקו</strong> מהדואר — הן מוצגות בצ&apos;אט של ההלוואה</p>
            )}
            {toFix > 0 && (
              <p>• <strong>{toFix}</strong> מיילים <strong>ישויכו למשרד הראשי</strong> — כרגע הם לא מופיעים בשום תיבה</p>
            )}
          </div>

          {data.דוגמאות.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-amber-800 font-medium">הצג את המיילים שיימחקו</summary>
              <div className="mt-2 flex flex-col gap-1">
                {data.דוגמאות.map((d, i) => (
                  <div key={i} className="bg-white/70 rounded-lg px-2.5 py-1.5">
                    <p className="font-medium text-slate-800 truncate">{d.נושא}</p>
                    <p className="text-slate-500" dir="ltr">{d.מאת}</p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="self-start inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <Trash2 size={14} /> נקה את תיבת המייל
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg p-3">
              <p className="text-sm text-slate-700 flex-1">
                {toRemove > 0 ? `${toRemove} מיילים יימחקו לצמיתות. ` : ''}להמשיך?
              </p>
              <button
                onClick={() => setConfirming(false)}
                disabled={running}
                className="text-sm text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50"
              >
                ביטול
              </button>
              <button
                onClick={run}
                disabled={running}
                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-3.5 py-1.5 rounded-lg disabled:opacity-50"
              >
                {running ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                כן, נקה
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
      {err && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{err}</p>
      )}
    </div>
  )
}
