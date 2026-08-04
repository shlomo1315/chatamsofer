'use client'
import { useEffect, useState } from 'react'
import { Gift, Loader2, Check, Eye, EyeOff, Plug, Trash2, AlertTriangle } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// הרשאת נדרים של חלוקות החגים — נפרדת מזו של היולדות.
//
// ⚠️ למה נפרדת: החגים והיולדות הם שני תקציבים ושתי קבוצות הגבלת חנויות בנדרים,
// ולעיתים שני מוסדות. הרשאה אחת לשניהם הייתה מקשרת טעינת חג לתקציב היולדות.
//
// ⚠️ כל עוד לא הוגדרה כאן הרשאה — החגים משתמשים בהרשאה הראשית, וזה מוצג במפורש
// ולא מוסתר. מסך שמראה "לא מוגדר" בעוד הפעולות רצות בפועל במוסד אחר הוא הדרך
// הבטוחה לטעות תקציבית.
// ─────────────────────────────────────────────────────────────────────────────
export default function NedarimHolidaySettings() {
  const [mosadId, setMosadId] = useState('')
  const [apiPassword, setApiPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [separate, setSeparate] = useState(false)
  const [inherited, setInherited] = useState('')
  const [limitedId, setLimitedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savingLimit, setSavingLimit] = useState(false)
  const [savedLimit, setSavedLimit] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    fetch('/api/admin/nedarim/holiday-settings')
      .then(r => r.json())
      .then(d => {
        setSeparate(!!d.separate)
        setMosadId(d.mosadId ?? '')
        setInherited(d.inheritedMosadId ?? '')
        setLimitedId(d.limitedId ?? '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/nedarim/holiday-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    return { res, d: await res.json().catch(() => ({})) }
  }

  const save = async () => {
    setError(''); setSaved(false)
    if (!mosadId.trim() || !apiPassword.trim()) { setError('יש להזין קוד מוסד וקוד API'); return }
    setSaving(true)
    try {
      const { res, d } = await post({ mosadId: mosadId.trim(), apiPassword: apiPassword.trim() })
      if (!res.ok) { setError(d.error || 'שגיאה בשמירה'); return }
      setSeparate(true); setInherited(''); setApiPassword('')
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch { setError('שגיאת רשת') }
    finally { setSaving(false) }
  }

  const clear = async () => {
    setError('')
    setSaving(true)
    try {
      const { res, d } = await post({ clear: true })
      if (!res.ok) { setError(d.error || 'שגיאה'); return }
      setMosadId(''); setApiPassword(''); setTestResult(null)
      setLoading(true); load()
    } catch { setError('שגיאת רשת') }
    finally { setSaving(false) }
  }

  const saveLimit = async () => {
    setError(''); setSavedLimit(false); setSavingLimit(true)
    try {
      const { res, d } = await post({ limitedId: limitedId.trim() })
      if (!res.ok) { setError(d.error || 'שגיאה בשמירה'); return }
      setSavedLimit(true); setTimeout(() => setSavedLimit(false), 2500)
    } catch { setError('שגיאת רשת') }
    finally { setSavingLimit(false) }
  }

  const test = async () => {
    setError(''); setTestResult(null); setTesting(true)
    try {
      const { res, d } = await post({ test: true })
      if (!res.ok) { setTestResult({ ok: false, text: d.error || 'החיבור נכשל' }); return }
      setTestResult({
        ok: true,
        text: `החיבור תקין · מוסד ${d.mosadId} · ${d.groupCount} קבוצות הגבלת חנויות`,
      })
    } catch { setTestResult({ ok: false, text: 'שגיאת רשת' }) }
    finally { setTesting(false) }
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center">
          <Gift size={16} className="text-teal-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-700">נדרים קארד — חלוקות חגים</h2>
          <p className="text-xs text-slate-400">הרשאה נפרדת לשיוך וטעינת כרטיסי החגים</p>
        </div>
        {separate
          ? <span className="ml-auto text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2.5 py-0.5 font-medium">הרשאה נפרדת ✓</span>
          : <span className="ml-auto text-xs bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2.5 py-0.5 font-medium">משתמש בהרשאה הראשית</span>}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-3"><Loader2 size={14} className="animate-spin" /> טוען…</div>
      ) : (
        <div className="flex flex-col gap-3" dir="rtl">
          {!separate && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
              <AlertTriangle size={13} className="inline -mt-0.5 ml-1" />
              כרגע פעולות החגים רצות ב<strong>הרשאה הראשית</strong>
              {inherited && <> (מוסד <span className="ltr-num font-bold">{inherited}</span>)</>} —
              כלומר באותו מוסד ותקציב של היולדות. להפרדה תקציבית יש להזין כאן קוד מוסד וקוד API של החגים.
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">קוד מוסד לחגים</label>
            <input value={mosadId} onChange={e => setMosadId(e.target.value.replace(/\D/g, ''))} dir="ltr" inputMode="numeric"
              placeholder="0000000" maxLength={9}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-left tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">
              קוד API לחגים {separate && <span className="text-slate-400">(שמור — הזינו רק כדי להחליף)</span>}
            </label>
            <div className="relative">
              <input value={apiPassword} onChange={e => setApiPassword(e.target.value)} dir="ltr"
                type={showPw ? 'text' : 'password'} placeholder={separate ? '••••••••' : ''}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pl-9 text-sm text-left focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute top-1/2 -translate-y-1/2 left-2 text-slate-400 hover:text-slate-600">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} שמירת ההרשאה
            </button>
            <button type="button" onClick={test} disabled={testing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {testing ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />} בדיקת חיבור
            </button>
            {separate && (
              <button type="button" onClick={clear} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                <Trash2 size={13} /> חזרה להרשאה הראשית
              </button>
            )}
            {saved && <span className="text-xs font-bold text-green-600">✓ נשמר</span>}
          </div>

          {testResult && (
            <p className={`rounded-xl border px-3.5 py-2.5 text-[12.5px] font-medium ${
              testResult.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
              {testResult.ok ? '✓ ' : '✕ '}{testResult.text}
            </p>
          )}

          {/* ── קבוצת הגבלת חנויות ── */}
          {/* ⚠️ ריק = בלי הגבלה, כלומר הכרטיס יעבוד בכל חנות. זה מצב תקין לחגים
              (בניגוד ליולדות שמוגבלות לאוכל מוכן), ולכן אינו נחסם — רק מוסבר. */}
          <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <label className="text-xs font-medium text-slate-600">קבוצת הגבלת חנויות לחגים (LimitedId)</label>
            <div className="mt-1.5 flex items-center gap-2">
              <input value={limitedId} onChange={e => setLimitedId(e.target.value.replace(/\D/g, ''))} dir="ltr" inputMode="numeric"
                placeholder="ריק = בלי הגבלה" maxLength={10}
                className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm text-left tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <button type="button" onClick={saveLimit} disabled={savingLimit}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {savingLimit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} שמירה
              </button>
              {savedLimit && <span className="text-xs font-bold text-green-600">✓ נשמר</span>}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              המזהה המדויק מופיע בבדיקת החיבור למעלה. השארה ריקה = הכרטיס יעבוד בכל חנות,
              וזה מצב תקין לחגים בניגוד לכרטיסי היולדות המוגבלים לאוכל מוכן.
            </p>
          </div>

          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
