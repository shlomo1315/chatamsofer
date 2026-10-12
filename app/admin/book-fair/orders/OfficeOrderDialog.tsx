'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, Loader2, PackagePlus, CheckCircle2 } from 'lucide-react'

// הזמנת משרד — משלוח בלי תשלום (בקשת המשתמש 13.10).
//
// 🔴 לחבילות שכבר נארזו: פותח הזמנה בסטטוס "נארז" עם מספר רץ, כדי שתצא
// בתעודת המשלוח וברשימת הכתובות למשלוחן. לא נגבה כסף.

type City = { id: string; name: string; is_active: boolean }

const INPUT = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'

export default function OfficeOrderDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [cities, setCities] = useState<City[]>([])
  const [form, setForm] = useState({ name: '', phone: '', email: '', city_id: '', address: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ id: string; order_number: string }[]>([])

  useEffect(() => {
    let alive = true
    fetch('/api/admin/book-fair/cities')
      .then(r => r.json())
      .then(j => { if (alive) setCities(((j.cities ?? []) as City[]).filter(c => c.is_active)) })
      .catch(() => { if (alive) setError('טעינת הערים נכשלה') })
    return () => { alive = false }
  }, [])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/admin/book-fair/orders/office', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? 'יצירת ההזמנה נכשלה'); return }
      setCreated(c => [{ id: j.id, order_number: j.order_number }, ...c])
      // ⚠️ איפוס הטופס ולא סגירה: פותחים כמה חבילות ברצף. העיר נשמרת —
      // חבילות ארוזות ממוינות בדרך כלל לפי אזור.
      setForm(f => ({ name: '', phone: '', email: '', city_id: f.city_id, address: '', notes: '' }))
      router.refresh()
    } catch {
      setError('השליחה לשרת נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !busy && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <PackagePlus size={18} className="text-indigo-600" /> הזמנת משלוח בלי תשלום
          </h2>
          <button onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 overflow-y-auto p-5">
          <p className="text-xs text-slate-500">
            לחבילה שכבר ארוזה. ההזמנה נפתחת בסטטוס &quot;נארז&quot;, מקבלת מספר הזמנה, ומופיעה בתעודות וברשימת הכתובות למשלוחן. לא נגבה תשלום.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">שם המקבל *
              <input value={form.name} onChange={set('name')} className={INPUT} required />
            </label>
            <label className="flex flex-col gap-1 text-sm">טלפון *
              <input value={form.phone} onChange={set('phone')} className={INPUT} dir="ltr" inputMode="tel" required />
            </label>
            <label className="flex flex-col gap-1 text-sm">עיר *
              <select value={form.city_id} onChange={set('city_id')} className={INPUT} required>
                <option value="">בחרו עיר…</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">מייל
              <input value={form.email} onChange={set('email')} className={INPUT} dir="ltr" type="email" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">כתובת (רחוב, מספר, דירה) *
            <input value={form.address} onChange={set('address')} className={INPUT} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">תוכן החבילה / הערות
            <textarea value={form.notes} onChange={set('notes')} className={INPUT} rows={2} />
          </label>

          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <PackagePlus size={15} />} פתיחת הזמנה
          </button>

          {created.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {created.map(c => (
                <div key={c.id} className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> נפתחה הזמנה
                  <Link href={`/admin/book-fair/orders/${c.id}`} className="font-mono font-semibold underline">{c.order_number}</Link>
                </div>
              ))}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
