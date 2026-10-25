'use client'
import { useState, useEffect } from 'react'
import { Truck, Loader2, Check, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { MAX_RATE_VOLUMES } from '@/lib/bookFairShipping'

// תעריף המשלוח המוסכם: סכום לכל כרך. נשמר בלחיצה אחת ופועל מיד
// בבקרת ההזמנות ובדף "משלוחים לפי עיר".

const toShekels = (agorot: number) => String(agorot / 100)

export default function AgreedRates({ canEdit, onSaved }: { canEdit: boolean; onSaved?: (rates: number[]) => void }) {
  const [prices, setPrices] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/api/admin/book-fair/shipping-rates', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (alive) { setPrices((d.rates ?? []).map(toShekels)); onSaved?.(d.rates ?? []); setLoaded(true) } })
      .catch(() => { if (alive) { setError('הטעינה נכשלה'); setLoaded(true) } })
    return () => { alive = false }
  }, [])

  const setAt = (i: number, v: string) => setPrices(p => p.map((x, j) => (j === i ? v : x)))
  const add = () => setPrices(p => [...p, p[p.length - 1] ?? '0'])
  const removeLast = () => setPrices(p => (p.length > 1 ? p.slice(0, -1) : p))

  async function save() {
    setError(''); setDone(false); setBusy(true)
    try {
      const res = await fetch('/api/admin/book-fair/shipping-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'השמירה נכשלה'); return }
      setPrices((d.rates as number[]).map(toShekels))
      onSaved?.(d.rates)
      setDone(true); setTimeout(() => setDone(false), 3000)
    } catch {
      setError('השמירה נכשלה — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
        <Truck size={17} /> תעריף משלוח לפי כרכים
      </h2>
      <p className="mb-3 text-sm text-slate-500">
        כמה עולה משלוח להזמנה של 1 כרך, 2 כרכים וכן הלאה. שינוי כאן נכנס לתוקף מיד בבקרת ההזמנות ובדף &quot;משלוחים לפי עיר&quot;.
      </p>
      {!loaded ? (
        <Loader2 size={18} className="animate-spin text-slate-400" />
      ) : (
        <div className="flex flex-col gap-3 sm:max-w-sm">
          <ul className="grid grid-cols-2 gap-2">
            {prices.map((p, i) => (
              <li key={i}>
                <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus-within:border-indigo-400">
                  <span>{i + 1} {i === 0 ? 'כרך' : 'כרכים'}</span>
                  <span className="flex items-center gap-1">
                    <input value={p} onChange={e => setAt(i, e.target.value)} disabled={!canEdit}
                      dir="ltr" inputMode="decimal" aria-label={`סכום ל-${i + 1} כרכים בשקלים`}
                      className="w-14 bg-transparent text-end text-base outline-none disabled:text-slate-500" />
                    <span className="text-slate-400">₪</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {prices.length > 0 && (
            <p className="flex items-start gap-1.5 text-sm text-amber-800">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              הזמנה של יותר מ-{prices.length} כרכים תחושב לפי הסכום של כרך {prices.length}.
            </p>
          )}
          {canEdit && (
            <div className="flex gap-2">
              <button onClick={add} disabled={prices.length >= MAX_RATE_VOLUMES}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-40">
                <Plus size={15} /> הוספת כרך
              </button>
              <button onClick={removeLast} disabled={prices.length <= 1}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-40">
                <Trash2 size={15} /> הסרת הכרך האחרון
              </button>
            </div>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {canEdit && (
            <button onClick={save} disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : done ? <Check size={15} /> : null}
              {done ? 'נשמר' : 'שמירה'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
