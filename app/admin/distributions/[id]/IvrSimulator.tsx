'use client'
import { useState, useCallback } from 'react'
import { Loader2, Phone, RotateCcw, Delete, CheckCircle2, AlertTriangle } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// בדיקת שלוחת בחירת המוקד — בלי לחייג.
//
// מריץ את *אותה* פונקציה שהשלוחה מריצה (nextCenterStep) על הנתונים האמיתיים
// של החלוקה, ומציג את מה שהמתקשר היה שומע בכל הקשה.
//
// 🔴 קריאה בלבד — הצעד האחרון מוצג אך לא נשמר. סימולציה שכותבת למסד הייתה
// תופסת מקום במוקד על שם משפחה אקראית.
//
// ⚠️ הבדיקה שווה משהו רק כי היא עוברת דרך הלוגיקה האמיתית. מסך שמחשב
// בעצמו מה "אמור" לקרות בודק את עצמו, לא את השלוחה.
// ─────────────────────────────────────────────────────────────────────────────

type Tapped = { region?: string; city?: string; center?: string; confirm?: string }

interface StepResult {
  step: string
  text: string
  expects: keyof Tapped | null
  done: boolean
  state: { centersOpen: boolean; centersCount: number; regions: string[]; full: string[] }
}

/** שורה ביומן השיחה — מה נשמע ומה הוקש אחריו. */
interface LogLine { text: string; tap?: string }

export default function IvrSimulator({ distributionId }: { distributionId: string }) {
  const [tapped, setTapped] = useState<Tapped>({})
  const [log, setLog] = useState<LogLine[]>([])
  const [cur, setCur] = useState<StepResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /** מדמה משפחה שכבר בחרה מוקד — הענף שאי אפשר להגיע אליו בשיחה רגילה. */
  const [asChosen, setAsChosen] = useState(false)

  const run = useCallback(async (next: Tapped, lines: LogLine[]) => {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/holiday-centers/ivr-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributionId, tapped: next, currentCenterId: asChosen ? '__any__' : null }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'הסימולציה נכשלה')
      setCur(d)
      setTapped(next)
      setLog([...lines, { text: d.text }])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }, [distributionId, asChosen])

  const start = () => { setLog([]); void run({}, []) }

  const press = (digit: string) => {
    if (!cur?.expects || cur.done) return
    const next = { ...tapped, [cur.expects]: digit }
    // ⚠️ ההקשה נרשמת על השורה האחרונה ולא כשורה חדשה — כך היומן קריא
    // כ"נשמע X, הוקש Y" ולא כרשימה מתחלפת.
    const lines = log.map((l, i) => (i === log.length - 1 ? { ...l, tap: digit } : l))
    void run(next, lines)
  }

  const back = () => {
    if (!cur?.expects) return
    const order: (keyof Tapped)[] = ['region', 'city', 'center', 'confirm']
    const idx = order.indexOf(cur.expects)
    const prev = order[idx - 1]
    if (!prev) { start(); return }
    const next = { ...tapped }
    delete next[prev]
    delete next[cur.expects]
    void run(next, log.slice(0, -1))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
            <Phone size={17} className="text-emerald-600" /> בדיקת השלוחה הטלפונית
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            מריץ את הלוגיקה האמיתית של השלוחה על נתוני החלוקה הזו. אפשר להקיש כמו בטלפון
            ולראות בדיוק מה המשפחה תשמע — <strong className="text-slate-700">שום דבר לא נשמר</strong>.
          </p>
        </div>
        <button
          onClick={start}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Phone size={15} />}
          {log.length ? 'התחלה מחדש' : 'התחלת שיחה'}
        </button>
      </div>

      <label className="flex w-fit items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={asChosen}
          onChange={e => { setAsChosen(e.target.checked); setLog([]); setCur(null) }}
          className="rounded border-slate-300"
        />
        {/* ⚠️ הענף הזה אינו נגיש בשיחה רגילה — משפחה שכבר בחרה מקבלת אישור
            ולא תפריט, ובלי המתג אי אפשר לבדוק אותו. */}
        לדמות משפחה שכבר בחרה מוקד
      </label>

      {err && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} /> {err}
        </div>
      )}

      {cur && (
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          {/* יומן השיחה */}
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {log.map((l, i) => (
              <div key={i} className="flex flex-col gap-1">
                <p className="text-sm leading-relaxed text-slate-800">🔊 {l.text}</p>
                {l.tap && (
                  <p className="text-xs font-bold text-emerald-700">⌨ הוקש {l.tap}</p>
                )}
              </div>
            ))}
            {cur.done && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-500">
                <CheckCircle2 size={14} /> השיחה הסתיימה ({cur.step})
              </p>
            )}
          </div>

          {/* מקלדת */}
          {!cur.done && cur.expects && (
            <div className="flex flex-col items-center gap-2">
              <div className="grid grid-cols-3 gap-1.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                  <button
                    key={d}
                    onClick={() => press(d)}
                    disabled={busy}
                    className="h-11 w-11 rounded-xl border border-slate-200 bg-white text-base font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
                  >
                    {d}
                  </button>
                ))}
              </div>
              <button
                onClick={back}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
              >
                <Delete size={13} /> חזרה
              </button>
            </div>
          )}
        </div>
      )}

      {/* מצב העולם — כדי שהבודק יבין *למה* קיבל את התשובה הזו */}
      {cur && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl bg-white px-4 py-3 text-xs text-slate-500 ring-1 ring-slate-100">
          <span>בחירה: <strong className={cur.state.centersOpen ? 'text-emerald-700' : 'text-red-600'}>
            {cur.state.centersOpen ? 'פתוחה' : 'סגורה'}
          </strong></span>
          <span>מוקדים פתוחים: <strong className="text-slate-700">{cur.state.centersCount}</strong></span>
          {cur.state.regions.length > 0 && <span>אזורים: {cur.state.regions.join(' · ')}</span>}
          {cur.state.full.length > 0 && (
            <span className="text-amber-700">מלאים: {cur.state.full.join(' · ')}</span>
          )}
        </div>
      )}

      {!cur && !busy && (
        <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-400">
          <RotateCcw size={14} /> לחצו &quot;התחלת שיחה&quot; כדי לראות מה המשפחה שומעת.
        </p>
      )}
    </div>
  )
}
