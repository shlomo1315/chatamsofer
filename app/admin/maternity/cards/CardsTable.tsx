'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, CreditCard, Loader2, Search, RotateCcw } from 'lucide-react'
import type { MaternityAid, CardCenter, CardStatus } from '@/types'

const STATUS_META: Record<CardStatus, { label: string; cls: string }> = {
  pending:  { label: 'ממתין לאישור', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { label: 'אושר',          cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  loaded:   { label: 'נטען',           cls: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: 'נדחה',           cls: 'bg-red-100 text-red-800 border-red-200' },
}

type Ben = { full_name?: string; family_name?: string; spouse_name?: string; spouse_id_number?: string }
const motherName = (b?: Ben) => b ? ([b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || b.full_name || '—') : '—'
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—'

const FILTERS: { key: CardStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'pending', label: 'ממתין לאישור' },
  { key: 'approved', label: 'אושר' },
  { key: 'loaded', label: 'נטען' },
  { key: 'rejected', label: 'נדחה' },
]

export default function CardsTable({ aids }: { aids: MaternityAid[] }) {
  const router = useRouter()
  const [centers, setCenters] = useState<CardCenter[]>([])
  const [filter, setFilter] = useState<CardStatus | 'all'>('pending')
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [approveFor, setApproveFor] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const loadCenters = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/card-centers', { cache: 'no-store' })
      setCenters((await r.json()).centers ?? [])
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    loadCenters()
    const h = () => loadCenters()
    window.addEventListener('card-centers-refresh', h)
    return () => window.removeEventListener('card-centers-refresh', h)
  }, [loadCenters])

  const availableCenters = centers.filter(c => c.is_active && (c.available ?? 0) > 0)
  const noStock = availableCenters.length === 0

  const act = async (aidId: string, action: 'approve' | 'reject' | 'pending' | 'load', centerId?: string) => {
    setBusyId(aidId); setErr('')
    try {
      const r = await fetch('/api/admin/maternity/card-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aidId, action, centerId }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'שגיאה'); setBusyId(null); return }
      setApproveFor(null)
      window.dispatchEvent(new Event('card-centers-refresh'))
      router.refresh()
    } catch { setErr('שגיאת רשת') }
    setBusyId(null)
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: aids.length }
    for (const a of aids) { const s = a.card_status ?? 'pending'; c[s] = (c[s] ?? 0) + 1 }
    return c
  }, [aids])

  const filtered = aids.filter(a => {
    const s = a.card_status ?? 'pending'
    if (filter !== 'all' && s !== filter) return false
    if (!query.trim()) return true
    const b = a.beneficiary as Ben | undefined
    const hay = [motherName(b), b?.spouse_id_number, a.baby_name].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(query.trim().toLowerCase())
  })

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CreditCard size={18} className="text-emerald-600" />
          <h2 className="font-semibold text-slate-900">בקשות כרטיס מזון</h2>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש…"
            className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
        </div>
      </div>

      {/* filters */}
      <div className="flex gap-2 flex-wrap px-5 py-3 border-b border-slate-100">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${filter === f.key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'}`}>
            {f.label} <span className="opacity-70">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {noStock && (
        <div className="mx-5 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          ⚠️ אין מלאי כרטיסים פנוי באף מוקד — ניתן לאשר רק בית החלמה (בעזר יולדות). עדכן מלאי למעלה כדי לאשר כרטיסים.
        </div>
      )}
      {err && <p className="px-5 mt-3 text-sm text-red-600">{err}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {['שם היולדת', 'ת.ז. האישה', 'תינוק', 'תאריך לידה', 'מוקד', 'סטטוס כרטיס', 'פעולות'].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">אין בקשות בסינון זה</td></tr>
            ) : filtered.map(aid => {
              const b = aid.beneficiary as Ben | undefined
              const s = (aid.card_status ?? 'pending') as CardStatus
              const center = (aid as { card_center?: { name?: string } }).card_center
              const busy = busyId === aid.id
              return (
                <tr key={aid.id} className="hover:bg-emerald-50/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{motherName(b)}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-600"><span className="ltr-num">{b?.spouse_id_number ?? '—'}</span></td>
                  <td className="px-4 py-3 text-slate-700">{aid.baby_name ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-slate-600"><span className="ltr-num">{fmtDate(aid.birth_date)}</span></td>
                  <td className="px-4 py-3 text-slate-600">{center?.name ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3"><span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_META[s].cls}`}>{STATUS_META[s].label}</span></td>
                  <td className="px-4 py-3">
                    {busy ? (
                      <Loader2 size={15} className="animate-spin text-slate-400" />
                    ) : approveFor === aid.id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <select id={`c-${aid.id}`} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white" defaultValue="">
                          <option value="" disabled>בחר מוקד…</option>
                          {availableCenters.map(c => <option key={c.id} value={c.id}>{c.name} (פנוי {c.available})</option>)}
                        </select>
                        <button onClick={() => { const v = (document.getElementById(`c-${aid.id}`) as HTMLSelectElement)?.value; if (!v) { setErr('יש לבחור מוקד'); return } act(aid.id, 'approve', v) }}
                          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5">אשר</button>
                        <button onClick={() => setApproveFor(null)} className="text-xs text-slate-500 hover:text-slate-700">ביטול</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {s === 'pending' && (
                          <button onClick={() => { setErr(''); if (noStock) { setErr('אין מלאי כרטיסים פנוי'); return } setApproveFor(aid.id) }}
                            disabled={noStock}
                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-50 disabled:opacity-40 rounded-lg px-2.5 py-1.5"><Check size={13} /> אשר כרטיס</button>
                        )}
                        {s === 'approved' && (
                          <button onClick={() => act(aid.id, 'load')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-green-700 border border-green-200 hover:bg-green-50 rounded-lg px-2.5 py-1.5"><CreditCard size={13} /> סמן כנטען</button>
                        )}
                        {(s === 'approved' || s === 'loaded' || s === 'rejected') && (
                          <button onClick={() => act(aid.id, 'pending')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 border border-amber-200 hover:bg-amber-50 rounded-lg px-2.5 py-1.5"><RotateCcw size={13} /> החזר לממתין</button>
                        )}
                        {s !== 'rejected' && s !== 'loaded' && (
                          <button onClick={() => act(aid.id, 'reject')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-2.5 py-1.5"><X size={13} /> דחה</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
