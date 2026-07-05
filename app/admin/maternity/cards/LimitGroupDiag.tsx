'use client'
import { useState } from 'react'
import { Search, Loader2, Layers } from 'lucide-react'

// אבחון קריאה-בלבד לזיהוי "קבוצת הגבלת החנויות" בנדרים (עזר יולדות אוכל מוכן) ומבנה הטעינות,
// כדי לחבר את טעינת ה-600 ₪ לקבוצה הנכונה. אינו מבצע שום פעולה חיה/כתיבה בנדרים.
// מוצג בתוך קטע "נדרים קארד" בדף ההגדרות.
export default function LimitGroupDiag() {
  const [zeout, setZeout] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState('')

  const run = async () => {
    setLoading(true); setErr(''); setResult(null)
    try {
      const q = zeout.trim() ? `?zeout=${encodeURIComponent(zeout.trim())}` : ''
      const res = await fetch(`/api/admin/nedarim/diag-groups${q}`, { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה')
      setResult(d)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const groups = (result?.limitedStores as { groups?: Record<string, unknown>[] } | undefined)?.groups ?? []

  return (
    <div className="mt-5 pt-5 border-t border-slate-100" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <Layers size={16} className="text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-700">אבחון קבוצת הגבלת חנויות</h3>
      </div>
      <p className="text-xs text-slate-400 mb-3">זיהוי המזהה המדויק של קבוצת ״עזר יולדות אוכל מוכן״ לשיוך טעינת ה-600 ₪ — קריאה בלבד (לא מבצע שום פעולה בנדרים)</p>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">ת״ז משפחה (לא חובה — לבדיקת מבנה הטעינות)</label>
          <input value={zeout} onChange={e => setZeout(e.target.value.replace(/\D/g, ''))}
            placeholder="ת״ז של משפחה עם טעינה מוגבלת קיימת" dir="ltr" inputMode="numeric"
            className="w-64 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-200" />
        </div>
        <button onClick={run} disabled={loading}
          className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} בדיקה
        </button>
      </div>

      {err && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      {groups.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">קבוצות הגבלת חנויות שנמצאו ({groups.length})</div>
          <div className="divide-y divide-slate-100">
            {groups.map((g, i) => (
              <pre key={i} className="px-3 py-2 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(g, null, 2)}</pre>
            ))}
          </div>
        </div>
      )}

      {result && (
        <details className="mt-3 rounded-lg border border-slate-200">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50">תשובה גולמית מלאה (JSON)</summary>
          <pre className="px-3 py-2 text-[11px] text-slate-600 overflow-x-auto whitespace-pre-wrap break-all max-h-96">{JSON.stringify(result, null, 2)}</pre>
        </details>
      )}
    </div>
  )
}
