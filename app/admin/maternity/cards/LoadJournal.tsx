'use client'
import { useState, useEffect, useMemo } from 'react'
import { History, Loader2, Search, X } from 'lucide-react'
import type { JournalRow, LoadJournal as Journal } from '@/lib/cardLoadJournal'

// ─────────────────────────────────────────────────────────────────────────────
// יומן טעינות — כל טעינת כרטיס מתחילת ההיסטוריה, בלי טסטים.
// הנתונים מ-/api/admin/card-stock/loads (activity_log בלבד, בלי פנייה לנדרים).
// טבלה קצרה עם השמות, וכל הפרטים בכרטסת קופצת בלחיצה על שורה.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE = 50
type Filter = 'all' | 'loaded' | 'failed'

const STATUS_LABEL: Record<string, string> = {
  loaded: 'טעון', unloaded: 'נפרק', failed: 'נכשל', idle: 'לא נטען',
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })
}
function dayTime(iso: string) {
  return `${day(iso)} · ${new Date(iso).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })}`
}
function ils(n: number | null) {
  return n == null ? '—' : `₪${n.toLocaleString('he-IL')}`
}

function ResultBadge({ r }: { r: JournalRow }) {
  return r.result === 'loaded'
    ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">נטען</span>
    : <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
        נכשל{r.attempts > 1 && ` · ${r.attempts} ניסיונות`}
      </span>
}

export default function LoadJournal() {
  const [data, setData] = useState<Journal | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<JournalRow | null>(null)

  useEffect(() => {
    fetch('/api/admin/card-stock/loads', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => (Array.isArray(d.rows) ? setData(d as Journal) : setError(d.error || 'טעינת היומן נכשלה')))
      .catch(() => setError('טעינת היומן נכשלה'))
  }, [])

  const rows = useMemo(() => {
    const term = q.trim()
    return (data?.rows ?? []).filter(r =>
      (filter === 'all' || r.result === filter) && (!term || r.name.includes(term)))
  }, [data, filter, q])

  const total = useMemo(
    () => (data?.rows ?? []).reduce((s, r) => s + (r.result === 'loaded' ? r.amount ?? 0 : 0), 0),
    [data],
  )

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <History size={15} className="text-slate-500" /> יומן טעינות
        </p>
        {data && (
          <p className="text-[11px] text-slate-500">
            בלי טסטים: סוננו{' '}<span className="ltr-num">{data.excludedTests}</span>{' '}טעינות של תיקים שנמחקו או ששמם &quot;בדיקה&quot;
          </p>
        )}
      </div>

      {error && <p className="px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}
      {!data && !error && (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> טוען את היומן…
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3 px-4 py-3">
            <div><span className="block text-[11px] text-slate-500">טעינות</span>
              <strong className="ltr-num block text-xl text-slate-900">{data.loaded.toLocaleString('he-IL')}</strong></div>
            <div><span className="block text-[11px] text-slate-500">יולדות שונות</span>
              <strong className="ltr-num block text-xl text-slate-900">{data.loadedAids.toLocaleString('he-IL')}</strong></div>
            <div><span className="block text-[11px] text-slate-500">סך הכול נטען</span>
              <strong className="ltr-num block text-xl text-emerald-700">{ils(total)}</strong></div>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            {([['all', 'הכול'], ['loaded', 'נטענו'], ['failed', `נכשלו (${data.failed})`]] as [Filter, string][]).map(([k, label]) => (
              <button key={k} type="button" onClick={() => { setFilter(k); setShown(PAGE) }}
                className={`rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${filter === k ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {label}
              </button>
            ))}
            <label className="relative ms-auto">
              <Search size={13} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => { setQ(e.target.value); setShown(PAGE) }} placeholder="חיפוש לפי שם"
                className="w-44 rounded-lg border border-slate-200 py-1.5 ps-7 pe-2 text-[12px] focus:border-slate-400 focus:outline-none" />
            </label>
          </div>

          <div>
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start font-bold">תאריך</th>
                  <th className="px-2 py-2 text-start font-bold">שם</th>
                  <th className="px-2 py-2 text-start font-bold">סכום</th>
                  <th className="px-2 py-2 text-start font-bold">תוצאה</th>
                  <th className="hidden px-4 py-2 text-start font-bold sm:table-cell">מי הטעין</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map(r => (
                  <tr key={r.key} onClick={() => setOpen(r)}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                    <td className="ltr-num whitespace-nowrap ps-4 pe-2 py-2 text-slate-600">{day(r.at)}</td>
                    <td className="px-2 py-2 font-bold text-slate-900">{r.name}</td>
                    <td className="ltr-num whitespace-nowrap px-2 py-2 text-slate-700">{ils(r.amount)}</td>
                    <td className="whitespace-nowrap px-2 py-2"><ResultBadge r={r} /></td>
                    <td className="hidden whitespace-nowrap px-4 py-2 text-slate-600 sm:table-cell">{r.by}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">אין טעינות להצגה.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length > shown && (
            <div className="border-t border-slate-100 px-4 py-2.5 text-center">
              <button type="button" onClick={() => setShown(s => s + PAGE)}
                className="text-[12px] font-bold text-slate-600 hover:text-slate-900">
                הצג עוד ({(rows.length - shown).toLocaleString('he-IL')} נוספות)
              </button>
            </div>
          )}
        </>
      )}

      {open && <JournalCard r={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function JournalCard({ r, onClose }: { r: JournalRow; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const items: [string, React.ReactNode][] = [
    ['תוצאה', <ResultBadge key="r" r={r} />],
    [r.attempts > 1 ? 'ניסיון אחרון' : 'מועד', <span key="t" className="ltr-num">{dayTime(r.at)}</span>],
    ['סכום', <span key="a" className="ltr-num">{ils(r.amount)}</span>],
    ['מי הטעין', r.by],
    ['מצב הכרטיס עכשיו', r.currentStatus ? STATUS_LABEL[r.currentStatus] ?? r.currentStatus : '—'],
  ]
  if (r.attempts > 1) items.push(['ניסיונות רצופים', <span key="n" className="ltr-num">{r.attempts}</span>])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={onClose} dir="rtl">
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        className="w-full rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900">{r.name}</h3>
          <button aria-label="סגירה" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>
        <dl className="mt-3 divide-y divide-slate-100 text-[13px]">
          {items.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2">
              <dt className="text-slate-500">{k}</dt><dd className="font-bold text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
        {r.error && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[12px] leading-relaxed text-rose-800">{r.error}</p>
        )}
        <a href={`/admin/maternity/${r.aidId}`} className="mt-4 block rounded-xl bg-slate-800 py-2.5 text-center text-[13px] font-bold text-white hover:bg-slate-900">
          פתיחת התיק
        </a>
      </div>
    </div>
  )
}
