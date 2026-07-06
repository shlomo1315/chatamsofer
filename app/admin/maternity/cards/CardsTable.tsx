'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, CreditCard, Loader2, Search, RotateCcw } from 'lucide-react'
import type { MaternityAid, CardCenter, CardStatus } from '@/types'
import ExtendEligibility from '../ExtendEligibility'
import { useCan } from '@/components/StaffPermissions'

const STATUS_META: Record<CardStatus, { label: string; cls: string }> = {
  pending:        { label: 'ממתין לאישור',     cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved:       { label: 'אושר',              cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  awaiting_stock: { label: 'אושר — ממתין למלאי', cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  loaded:         { label: 'נטען',              cls: 'bg-green-100 text-green-800 border-green-200' },
  rejected:       { label: 'נדחה',              cls: 'bg-red-100 text-red-800 border-red-200' },
}

type Ben = { full_name?: string; family_name?: string; spouse_name?: string; spouse_id_number?: string }
const motherName = (b?: Ben) => b ? ([b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || b.full_name || '—') : '—'
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—'
const ils = (n?: number | null) => (n == null ? '—' : `₪${Number(n).toLocaleString('he-IL')}`)

// ספירה לאחור לפריקה אוטומטית (רצה בחצות שעון ישראל). כשהפריקה היום/באיחור — מציג שעות ודקות עד החצות הקרובה.
function unloadCountdown(sixWeeksEnd?: string): { text: string; cls: string } | null {
  if (!sixWeeksEnd) return null
  const now = new Date()
  const end = new Date(sixWeeksEnd); end.setHours(0, 0, 0, 0)
  const ms = end.getTime() - now.getTime()
  if (ms <= 0) {
    // יום הסיום הגיע/עבר → הפריקה תתבצע בחצות הקרובה. מציג שעות ודקות עד אז.
    const nextMidnight = new Date(now); nextMidnight.setHours(24, 0, 0, 0)
    const rem = nextMidnight.getTime() - now.getTime()
    const h = Math.floor(rem / 3600000)
    const m = Math.floor((rem % 3600000) / 60000)
    return { text: h > 0 ? `פריקה בעוד ${h} שע׳ ${m} דק׳` : `פריקה בעוד ${m} דק׳`, cls: 'bg-red-100 text-red-700' }
  }
  const days = Math.ceil(ms / 86400000)
  if (days <= 1) {
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    return { text: h > 0 ? `עוד ${h} שע׳ ${m} דק׳` : `עוד ${m} דק׳`, cls: 'bg-amber-100 text-amber-700' }
  }
  return { text: `${days} ימים`, cls: days <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600' }
}

const FILTERS: { key: CardStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'pending', label: 'ממתין לאישור' },
  { key: 'approved', label: 'אושר' },
  { key: 'awaiting_stock', label: 'ממתין למלאי' },
  { key: 'loaded', label: 'נטען' },
  { key: 'rejected', label: 'נדחה' },
]

export default function CardsTable({ aids }: { aids: MaternityAid[] }) {
  const router = useRouter()
  const canEdit = useCan('maternity_cards', 'edit')
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
          ⚠️ אין מלאי כרטיסים פנוי כעת. ניתן לאשר את היולדת ל<strong>רשימת המתנה</strong> — ברגע שיתחדש המלאי היא תשויך אוטומטית ותקבל שובר במייל, ללא צורך בפעולה נוספת.
        </div>
      )}
      {err && <p className="px-5 mt-3 text-sm text-red-600">{err}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-[16px] text-right border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-[15px] font-bold text-slate-600">
              {['שם היולדת', 'ת.ז. האישה', 'תינוק', 'תאריך לידה', 'מוקד', 'סטטוס כרטיס', 'סכום שהוטען', 'יתרה בכרטיס', 'ימים לפריקה', 'פעולות'].map((h, i, arr) => (
                <th key={h} className={`px-5 py-4 font-bold whitespace-nowrap ${i < arr.length - 1 ? 'border-l border-slate-200' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-5 py-12 text-center text-slate-400">אין בקשות בסינון זה</td></tr>
            ) : filtered.map(aid => {
              const b = aid.beneficiary as Ben | undefined
              const s = (aid.card_status ?? 'pending') as CardStatus
              const center = (aid as { card_center?: { name?: string } }).card_center
              const busy = busyId === aid.id
              const countdown = (s === 'loaded') ? unloadCountdown(aid.six_weeks_end) : null
              return (
                <tr key={aid.id} onClick={() => router.push(`/admin/maternity/${aid.id}`)}
                  className="border-b border-slate-100 hover:bg-emerald-50/40 transition-colors cursor-pointer">
                  <td className="px-5 py-4 font-semibold text-slate-800 whitespace-nowrap border-l border-slate-100">{motherName(b)}</td>
                  <td className="px-5 py-4 font-mono text-slate-600 border-l border-slate-100"><span className="ltr-num">{b?.spouse_id_number ?? '—'}</span></td>
                  <td className="px-5 py-4 text-slate-700 border-l border-slate-100">{aid.baby_name ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-5 py-4 text-slate-600 border-l border-slate-100"><span className="ltr-num">{fmtDate(aid.birth_date)}</span></td>
                  <td className="px-5 py-4 text-slate-600 border-l border-slate-100">{center?.name ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-5 py-4 border-l border-slate-100"><span className={`inline-block text-[13px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_META[s].cls}`}>{STATUS_META[s].label}</span></td>
                  <td className="px-5 py-4 text-slate-700 border-l border-slate-100">{aid.card_load_amount != null ? ils(aid.card_load_amount) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-5 py-4 font-bold text-emerald-700 border-l border-slate-100">{aid.card_status === 'loaded' && aid.card_balance != null ? ils(aid.card_balance) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-5 py-4 border-l border-slate-100">
                    <div className="flex flex-col items-start gap-1">
                      {countdown ? <span className={`inline-block text-[13px] font-semibold px-2.5 py-1 rounded-full ${countdown.cls}`}>{countdown.text}</span> : <span className="text-slate-300">—</span>}
                      {aid.eligibility_extended && <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">הוארך ידנית</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                    {busy ? (
                      <Loader2 size={15} className="animate-spin text-slate-400" />
                    ) : !canEdit ? (
                      <span className="text-slate-300">—</span>
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
                        {s === 'pending' && !noStock && (
                          <button onClick={() => { setErr(''); setApproveFor(aid.id) }}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5 shadow-sm"><Check size={14} /> אשר כרטיס</button>
                        )}
                        {s === 'pending' && noStock && (
                          <button onClick={() => act(aid.id, 'approve')}
                            title="אין מלאי כעת — היולדת תיכנס לרשימת המתנה ותקבל שובר אוטומטית כשיתחדש המלאי"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg px-3 py-1.5 shadow-sm"><Check size={14} /> אשר (ממתין למלאי)</button>
                        )}
                        {s === 'awaiting_stock' && !noStock && (
                          <button onClick={() => { setErr(''); setApproveFor(aid.id) }}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5 shadow-sm"><Check size={14} /> שייך מוקד ואשר</button>
                        )}
                        {s === 'approved' && (
                          <button onClick={() => act(aid.id, 'load')}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5 shadow-sm"><CreditCard size={14} /> סמן כנטען</button>
                        )}
                        {(s === 'approved' || s === 'loaded' || s === 'rejected' || s === 'awaiting_stock') && (
                          <button onClick={() => act(aid.id, 'pending')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 border border-amber-200 hover:bg-amber-50 rounded-lg px-2.5 py-1.5"><RotateCcw size={13} /> החזר לממתין</button>
                        )}
                        {s !== 'rejected' && s !== 'loaded' && (
                          <button onClick={() => act(aid.id, 'reject')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-2.5 py-1.5"><X size={13} /> דחה</button>
                        )}
                        <ExtendEligibility aid={aid} variant="icon" onDone={() => router.refresh()} />
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
