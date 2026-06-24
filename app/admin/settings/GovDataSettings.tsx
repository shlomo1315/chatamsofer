'use client'
import { useEffect, useState } from 'react'
import { MapPin, Loader2, RefreshCw, Check, AlertTriangle } from 'lucide-react'

// תצוגת מצב + רענון יזום של מאגר הערים והרחובות ממשרד הפנים (data.gov.il).
export default function GovDataSettings() {
  const [count, setCount] = useState<number | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

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
          d.fetched != null ? `נמשכו כעת ${d.fetched?.toLocaleString('he-IL')} (מרשם ${d.registry ?? 0}, רשימת ישובים ${d.settlements ?? 0}, רחובות ${d.streets ?? 0}/${d.streetsMethod ?? '—'})` : '',
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

  const fullReset = async () => {
    if (!window.confirm('פעולה זו תמחק את כל הערים והרחובות המקומיים ותסנכרן הכל מחדש ישירות ממשרד הפנים. להמשיך?')) return
    setRefreshing(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/gov/reset', { method: 'POST' })
      const d = await r.json()
      if (!r.ok || d.ok === false) { setMsg({ type: 'err', text: d.error || 'האיפוס נכשל' }); return }
      setCount(d.cities ?? count)
      setLastSyncedAt(new Date().toISOString())
      setMsg({ type: 'ok', text: `אופס וסונכרן ממשרד הפנים: ${d.cities?.toLocaleString('he-IL')} ערים, ${d.streets?.toLocaleString('he-IL')} רחובות ב-${d.streetsCities?.toLocaleString('he-IL')} ערים` })
      fetch(`/api/gov/cities?_=${Date.now()}`).catch(() => {})
    } catch {
      setMsg({ type: 'err', text: 'שגיאת רשת — נסה שוב' })
    } finally {
      setRefreshing(false)
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
            <button
              onClick={fullReset}
              disabled={refreshing}
              className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              איפוס וסנכרון מלא
            </button>
            <p className="text-xs text-slate-400">"רענן" משלים ערים/רחובות. "איפוס וסנכרון מלא" מוחק הכל ובונה מחדש ישירות ממשרד הפנים (כדקה–שתיים).</p>
          </div>
        </div>
      )}
    </div>
  )
}
