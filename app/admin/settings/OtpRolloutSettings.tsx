'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Check, ShieldAlert, TrendingUp } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// העברה הדרגתית של קודי האימות מ-Gmail ל-Resend.
//
// 🔴 קוד אימות הוא המייל הקריטי ביותר במערכת — בלעדיו אף אחד לא נכנס
// לפורטל, ואין מסלול עוקף. לכן ההעברה באחוזים ולא במתג: אם המסירה יורדת,
// זה נראה על חלק מהמשתמשים ואפשר לחזור לאחור בלחיצה.
//
// ⚠️ המסך מציג את נפח השליחה בפועל — בלעדיו ההחלטה להעלות אחוז היא ניחוש.
// ─────────────────────────────────────────────────────────────────────────────

interface DayRow { day: string; total: number; resend: number }

const STEPS = [0, 10, 25, 50, 75, 100]

export default function OtpRolloutSettings() {
  const [percent, setPercent] = useState(0)
  const [saved, setSaved] = useState(0)
  const [days, setDays] = useState<DayRow[]>([])
  const [avgResend, setAvgResend] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/otp-rollout', { cache: 'no-store' })
      if (r.ok) {
        const d = await r.json()
        setPercent(d.percent ?? 0)
        setSaved(d.percent ?? 0)
        setDays(Array.isArray(d.days) ? d.days : [])
        setAvgResend(d.avgResend ?? 0)
      }
    } catch { /* נשאר בברירת המחדל */ }
    setLoading(false)
  }, [])
  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  const save = async () => {
    setSaving(true); setMsg('')
    try {
      const r = await fetch('/api/admin/otp-rollout', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percent }),
      })
      if (r.ok) {
        setSaved(percent)
        setMsg(percent === 0 ? 'כל קודי האימות חוזרים ל-Gmail' : `${percent}% מקודי האימות יוצאים דרך Resend`)
        setTimeout(() => setMsg(''), 4000)
      }
    } finally { setSaving(false) }
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
      <Loader2 size={15} className="animate-spin" /> טוען…
    </div>
  }

  const maxDay = Math.max(...days.map(d => d.total), 1)
  // ⚠️ 500/יום במשך שבועיים הוא הסף המקובל לחימום דומיין. מתחתיו —
  // מוצגת אזהרה, כי העלאת אחוז שם היא הימור ולא החלטה.
  const warmedUp = avgResend >= 300

  return (
    <div className="flex flex-col gap-5">
      {/* ── אזהרה ── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-2.5">
        <ShieldAlert size={16} className="shrink-0 text-amber-600 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <b>קוד אימות הוא המייל הקריטי ביותר במערכת.</b> בלעדיו לא ניתן להיכנס
          לפורטל, ואין מסלול חלופי. העלו את האחוז בהדרגה ובדקו מסירה בין שלב לשלב.
          חזרה ל-0% מחזירה הכל ל-Gmail מיידית.
        </div>
      </div>

      {/* ── מצב נוכחי ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-[11px] font-bold text-slate-400">דרך Resend</p>
          <p className="text-2xl font-extrabold text-indigo-700 tabular-nums">{saved}%</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-[11px] font-bold text-slate-400">דרך Gmail</p>
          <p className="text-2xl font-extrabold text-slate-700 tabular-nums">{100 - saved}%</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${warmedUp ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className={`text-[11px] font-bold ${warmedUp ? 'text-emerald-600' : 'text-amber-700'}`}>
            ממוצע יומי ב-Resend
          </p>
          <p className={`text-2xl font-extrabold tabular-nums ${warmedUp ? 'text-emerald-800' : 'text-amber-800'}`}>
            {avgResend.toLocaleString('he-IL')}
          </p>
          <p className={`text-[11px] ${warmedUp ? 'text-emerald-700' : 'text-amber-700'}`}>
            {warmedUp ? 'נפח מספיק' : 'מתחת ל-300 — מוקדם להעלות'}
          </p>
        </div>
      </div>

      {/* ── בחירת אחוז ── */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold text-slate-500">אחוז קודי האימות דרך Resend</p>
        <div className="flex flex-wrap items-center gap-2">
          {STEPS.map(s => (
            <button key={s} type="button" onClick={() => setPercent(s)}
              className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                percent === s
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
              }`}>
              {s}%
            </button>
          ))}
          <input type="number" min={0} max={100} value={percent}
            onChange={e => setPercent(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-xs text-center outline-none focus:border-indigo-400" />
        </div>
        {/* ⚠️ נאמר במפורש: אותו אדם תמיד באותו ערוץ. בלי זה נראה כאילו
            ההגרלה אקראית וכל שליחה עשויה ליפול אחרת. */}
        <p className="text-[11px] text-slate-400">
          החלוקה קבועה לפי כתובת המייל — אותו נמען מקבל תמיד את אותו ערוץ,
          כך שתקלה ניתנת לשחזור.
        </p>
      </div>

      {/* ── נפח 14 יום ── */}
      {days.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 mb-3 text-slate-500">
            <TrendingUp size={13} />
            <span className="text-[11px] font-bold">נפח שליחה · 14 ימים</span>
            <span className="mr-auto text-[10px] text-slate-400">כחול = Resend</span>
          </div>
          <div className="flex flex-col gap-1">
            {days.slice(0, 14).map(d => (
              <div key={d.day} className="grid grid-cols-[64px_1fr_auto] items-center gap-2">
                <span className="text-[10px] text-slate-400 ltr-num">{d.day.slice(5)}</span>
                <span className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <span className="absolute inset-y-0 right-0 rounded-full bg-slate-300"
                    style={{ width: `${(d.total / maxDay) * 100}%` }} />
                  <span className="absolute inset-y-0 right-0 rounded-full bg-indigo-500"
                    style={{ width: `${(d.resend / maxDay) * 100}%` }} />
                </span>
                <span className="text-[10px] tabular-nums text-slate-500">
                  <b className="text-indigo-700">{d.resend}</b> / {d.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={saving || percent === saved}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-900 disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          שמירה
        </button>
        {saved > 0 && percent !== 0 && (
          // ⚠️ כפתור חזרה מהירה — ברגע תקלה לא רוצים לחפש את המספר 0.
          <button type="button" onClick={() => { setPercent(0) }}
            className="rounded-xl border border-rose-200 px-3 py-2.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50">
            חזרה מלאה ל-Gmail
          </button>
        )}
        {msg && <span className="text-xs font-bold text-emerald-700">{msg}</span>}
      </div>
    </div>
  )
}
