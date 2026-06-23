'use client'
import { useEffect, useState } from 'react'
import { MapPin, Loader2, RefreshCw, Check, AlertTriangle, Plus } from 'lucide-react'

// תצוגת מצב + רענון יזום של מאגר הערים והרחובות ממשרד הפנים (data.gov.il).
export default function GovDataSettings() {
  const [count, setCount] = useState<number | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [newCity, setNewCity] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    fetch('/api/admin/gov/refresh', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d?.ok !== false) { setCount(d.count ?? 0); setLastSyncedAt(d.lastSyncedAt ?? null) } })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const refresh = async () => {
    setRefreshing(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/gov/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const d = await r.json()
      if (!r.ok || d.ok === false) {
        setMsg({ type: 'err', text: d.error || 'הרענון נכשל' })
      } else {
        setCount(d.cities ?? count)
        setLastSyncedAt(d.lastSyncedAt ?? new Date().toISOString())
        // פירוט מקורות לאבחון: כמה ממרשם היישובים, כמה ממאגר הרחובות, ושגיאות אם היו
        const parts = [
          `סה״כ ${d.cities?.toLocaleString('he-IL') ?? ''} ערים במאגר`,
          d.fetched != null ? `נמשכו כעת ${d.fetched?.toLocaleString('he-IL')} (מרשם ${d.registry ?? 0}, רחובות ${d.streets ?? 0}/${d.streetsMethod ?? '—'})` : '',
        ].filter(Boolean)
        const hasErr = Array.isArray(d.errors) && d.errors.length > 0
        setMsg({ type: hasErr ? 'err' : 'ok', text: parts.join(' · ') + (hasErr ? ` · שגיאות: ${d.errors.join(' | ')}` : '') })
        // חימום מטמון רשימת הערים כך שהטפסים יציגו מיד את הרשימה המעודכנת
        fetch('/api/gov/cities?fresh=1').catch(() => {})
      }
    } catch {
      setMsg({ type: 'err', text: 'שגיאת רשת — נסה שוב' })
    } finally {
      setRefreshing(false)
    }
  }

  const addCity = async () => {
    const name = newCity.trim()
    if (!name || adding) return
    setAdding(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/gov/cities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      })
      const d = await r.json()
      if (!r.ok || d.ok === false) { setMsg({ type: 'err', text: d.error || 'ההוספה נכשלה' }); return }
      setCount(d.count ?? count)
      setNewCity('')
      setMsg({
        type: 'ok',
        text: `העיר "${name}" נוספה${d.streets ? ` (${d.streets} רחובות מהמאגר)` : ' — אין רחובות ב-data.gov.il, ניתן להזין רחוב ידנית בטופס'}`,
      })
      fetch('/api/gov/cities?fresh=1').catch(() => {})
    } catch {
      setMsg({ type: 'err', text: 'שגיאת רשת — נסה שוב' })
    } finally {
      setAdding(false)
    }
  }

  const fmtWhen = (iso: string | null) => {
    if (!iso) return 'מעולם לא'
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 bg-sky-50 rounded-lg flex items-center justify-center">
          <MapPin size={16} className="text-sky-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-700">ערים ורחובות (משרד הפנים)</h2>
          <p className="text-xs text-slate-400">מאגר הכתובות לטפסים — נטען מ-data.gov.il ומתרענן אוטומטית מדי לילה</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-3"><Loader2 size={14} className="animate-spin" /> טוען…</div>
      ) : (
        <div className="flex flex-col gap-4" dir="rtl">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500 mb-0.5">ערים במאגר</p>
              <p className="text-2xl font-extrabold text-slate-800 ltr-num">{count?.toLocaleString('he-IL') ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500 mb-0.5">עודכן לאחרונה</p>
              <p className="text-sm font-semibold text-slate-700 mt-1.5 ltr-num">{fmtWhen(lastSyncedAt)}</p>
            </div>
          </div>

          {msg && (
            <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2.5 ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {msg.type === 'ok' ? <Check size={15} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />}
              <span>{msg.text}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              רענן עכשיו ממשרד הפנים
            </button>
            <p className="text-xs text-slate-400">מושך את רשימת היישובים המלאה והעדכנית. אם חסרות ערים — לחיצה כאן תשלים אותן.</p>
          </div>

          {/* הוספת עיר ידנית — לכיסוי יישובים שאינם ב-data.gov.il (למשל יו"ש) */}
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-600 mb-1.5">הוספת עיר ידנית</p>
            <div className="flex items-center gap-2">
              <input
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addCity() }}
                placeholder="לדוגמה: עמנואל"
                dir="rtl"
                className="flex-1 text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
              <button
                onClick={addCity}
                disabled={adding || !newCity.trim()}
                className="inline-flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors whitespace-nowrap"
              >
                {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                הוסף
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">עיר שתתווסף ידנית נשמרת ולא תימחק ברענון האוטומטי.</p>
          </div>
        </div>
      )}
    </div>
  )
}
