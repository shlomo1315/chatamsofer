'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Check, Clock } from 'lucide-react'

// הגדרות תזכורת שיוך/איסוף כרטיס מזון: מתי לשלוח (ימים אחרי הלידה) + הפעלה,
// ותזכורת שנייה אופציונלית. נשלחת רק ללידה מאושרת שהכרטיס שלה עדיין לא שויך.
export default function CardReminderSettings() {
  const [enabled, setEnabled] = useState(true)
  const [firstDays, setFirstDays] = useState(14)
  const [hasSecond, setHasSecond] = useState(true)
  const [secondDays, setSecondDays] = useState(21)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/maternity/card-reminder-settings', { cache: 'no-store' })
      const d = await r.json()
      setEnabled(d.enabled !== false)
      setFirstDays(Number.isFinite(d.firstDays) ? d.firstDays : 14)
      if (d.secondDays == null) { setHasSecond(false) } else { setHasSecond(true); setSecondDays(d.secondDays) }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])
  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  const save = async () => {
    setErr(''); setMsg('')
    if (hasSecond && secondDays <= firstDays) { setErr('התזכורת השנייה חייבת להיות מאוחרת מהראשונה'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/admin/maternity/card-reminder-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, firstDays, secondDays: hasSecond ? secondDays : null }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'שגיאה בשמירה') } else { setMsg('ההגדרות נשמרו'); setTimeout(() => setMsg(''), 3000) }
    } catch { setErr('שגיאת רשת') }
    setSaving(false)
  }

  if (loading) return <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 size={15} className="animate-spin" /> טוען…</div>

  const numInput = (val: number, set: (n: number) => void) => (
    <input value={val} onChange={e => set(Math.max(0, Math.trunc(Number(e.target.value.replace(/[^\d]/g, '')) || 0)))}
      inputMode="numeric" dir="ltr"
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-center w-20 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500 leading-relaxed">
        תזכורת נשלחת ליולדת שלידתה <strong>אושרה</strong> אך <strong>עדיין לא שייכה את כרטיס המזון</strong> (שיוך טלפוני בנדרים).
        התזכורת כוללת את רשימת המוקדים. המועד נמדד ממועד הלידה.
      </p>

      {/* הפעלה */}
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}
          className="w-5 h-5 accent-emerald-600" />
        <span className="text-sm font-medium text-slate-700">שליחת תזכורות איסוף כרטיס פעילה</span>
      </label>

      <div className={`flex flex-col gap-4 ${enabled ? '' : 'opacity-50 pointer-events-none'}`}>
        {/* תזכורת ראשונה */}
        <div className="flex items-center gap-2 flex-wrap">
          <Clock size={15} className="text-emerald-500" />
          <span className="text-sm text-slate-700">תזכורת ראשונה —</span>
          {numInput(firstDays, setFirstDays)}
          <span className="text-sm text-slate-700">ימים אחרי הלידה</span>
          <span className="text-xs text-slate-400">(ברירת מחדל: 14 = שבועיים)</span>
        </div>

        {/* תזכורת שנייה */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={hasSecond} onChange={e => setHasSecond(e.target.checked)}
              className="w-4 h-4 accent-emerald-600" />
            <span className="text-sm font-medium text-slate-700">שליחת תזכורת שנייה</span>
          </label>
          {hasSecond && (
            <div className="flex items-center gap-2 flex-wrap pr-6">
              <Clock size={15} className="text-emerald-500" />
              <span className="text-sm text-slate-700">תזכורת שנייה —</span>
              {numInput(secondDays, setSecondDays)}
              <span className="text-sm text-slate-700">ימים אחרי הלידה</span>
            </div>
          )}
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {msg && <p className="text-sm text-emerald-600 inline-flex items-center gap-1"><Check size={14} /> {msg}</p>}

      <div>
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-5 py-2.5">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} שמירת הגדרות
        </button>
      </div>
    </div>
  )
}
