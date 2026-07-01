'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Loader2, Warehouse, X, MapPin } from 'lucide-react'
import type { CardCenter } from '@/types'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import CityStreetPicker from '@/components/ui/CityStreetPicker'

type Draft = { id?: string; name: string; stock: string; city: string; address: string; pickup_days: string; pickup_hours: string }
const emptyDraft: Draft = { name: '', stock: '', city: '', address: '', pickup_days: '', pickup_hours: '' }

export default function CardCentersManager() {
  const { confirm, confirmDialog } = useConfirm()
  const [centers, setCenters] = useState<CardCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState<Draft | null>(null) // null=closed; id present=edit, else add
  const [filter, setFilter] = useState<'' | 'stock' | 'approved' | 'loaded' | 'remaining'>('')
  const [addStock, setAddStock] = useState<{ id: string; name: string; current: number; waiting: number } | null>(null)
  const [addAmount, setAddAmount] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/card-centers', { cache: 'no-store' })
      const d = await r.json()
      setCenters(d.centers ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!modal || !modal.name.trim()) { setErr('שם המוקד חובה'); return }
    setBusy(true); setErr('')
    const method = modal.id ? 'PATCH' : 'POST'
    const body = { id: modal.id, name: modal.name, stock: modal.stock, city: modal.city, address: modal.address, pickup_days: modal.pickup_days, pickup_hours: modal.pickup_hours }
    const r = await fetch('/api/admin/card-centers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json()
    if (d.error) { setErr(d.error) } else { setCenters(d.centers ?? []); setModal(null) }
    setBusy(false)
  }

  const remove = async (c: CardCenter) => {
    if (!(await confirm({ title: 'מחיקת מוקד', message: `למחוק את המוקד "${c.name}"?`, confirmLabel: 'מחיקה', danger: true }))) return
    setBusy(true); setErr('')
    const r = await fetch(`/api/admin/card-centers?id=${c.id}`, { method: 'DELETE' })
    const d = await r.json()
    if (d.error) setErr(d.error); else setCenters(d.centers ?? [])
    setBusy(false)
  }

  const totStock = centers.reduce((s, c) => s + c.stock, 0)
  const totLoaded = centers.reduce((s, c) => s + (c.loaded ?? 0), 0)
  const totRemaining = totStock - totLoaded

  const fullAddress = (c: CardCenter) => [c.address, c.city].filter(Boolean).join(', ')

  // סינון חי לפי הקובייה שנלחצה (לחיצה נוספת מבטלת)
  const shown = centers.filter(c => {
    if (filter === 'stock') return c.stock > 0
    if (filter === 'approved') return (c.approved ?? 0) > 0
    if (filter === 'loaded') return (c.loaded ?? 0) > 0
    if (filter === 'remaining') return (c.remaining ?? 0) > 0
    return true
  })

  // הוספת מלאי מיידית למוקד (stock = נוכחי + תוספת) — מפעיל שליחת שובר לממתינים
  const saveAddStock = async () => {
    if (!addStock) return
    const add = parseInt(addAmount, 10)
    if (!add || add <= 0) { setErr('הזן כמות חיובית'); return }
    setBusy(true); setErr('')
    const r = await fetch('/api/admin/card-centers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: addStock.id, stock: addStock.current + add }) })
    const d = await r.json()
    if (d.error) setErr(d.error); else { setCenters(d.centers ?? []); setAddStock(null) }
    setBusy(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Warehouse size={18} className="text-emerald-600" />
          <h2 className="font-semibold text-slate-900">מוקדי כרטיסים ומלאי</h2>
        </div>
        <button onClick={() => { setErr(''); setModal({ ...emptyDraft }) }}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg px-4 py-2">
          <Plus size={15} /> הוסף מוקד
        </button>
      </div>

      {/* סיכום מלאי — לחיצה מסננת את הטבלה בלייב (לחיצה נוספת מבטלת) */}
      <div className="grid grid-cols-3 gap-3 mb-2">
        {([
          { key: 'stock', label: 'סה״כ מלאי', value: totStock, cls: 'text-slate-800', bg: 'bg-slate-50 border-slate-200', ring: 'ring-slate-400' },
          { key: 'loaded', label: 'מומשו', value: totLoaded, cls: 'text-green-700', bg: 'bg-green-50 border-green-200', ring: 'ring-green-400' },
          { key: 'remaining', label: 'נשאר', value: totRemaining, cls: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', ring: 'ring-emerald-400' },
        ] as const).map(s => (
          <button key={s.key} type="button"
            onClick={() => setFilter(f => f === s.key ? '' : s.key)}
            className={`rounded-2xl border px-4 py-3.5 text-center transition-all ${s.bg} ${filter === s.key ? `ring-2 ${s.ring} shadow-sm` : 'hover:shadow-sm hover:brightness-95'}`}>
            <p className="text-xs text-slate-500 mb-0.5">{s.label}</p>
            <p className={`text-3xl font-extrabold ${s.cls}`}>{s.value}</p>
          </button>
        ))}
      </div>
      <div className="h-5 mb-3">
        {filter && <button onClick={() => setFilter('')} className="text-xs text-slate-500 hover:text-slate-800 underline">בטל סינון · הצג את כל המוקדים</button>}
      </div>

      {err && !modal && <p className="text-sm text-red-600 mb-3">{err}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 size={15} className="animate-spin" /> טוען מוקדים…</div>
      ) : centers.length === 0 ? (
        <p className="text-sm text-slate-400 py-3 text-center">אין מוקדים עדיין. לחץ "הוסף מוקד" כדי להתחיל.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-[16px] text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-200 text-[15px] font-bold text-slate-600">
                <th className="px-5 py-4 font-bold border-l border-slate-200">שם המוקד</th>
                <th className="px-5 py-4 font-bold border-l border-slate-200">כתובת</th>
                <th className="px-5 py-4 font-bold border-l border-slate-200">מלאי</th>
                <th className="px-5 py-4 font-bold border-l border-slate-200">מומשו</th>
                <th className="px-5 py-4 font-bold border-l border-slate-200">נשאר</th>
                <th className="px-5 py-4 font-bold">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(c => {
                const remaining = c.remaining ?? 0
                return (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-emerald-50/30">
                    <td className="px-5 py-4 font-semibold text-slate-800 border-l border-slate-100">{c.name}</td>
                    <td className="px-5 py-4 text-slate-600 border-l border-slate-100">
                      {fullAddress(c) ? (
                        <span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-slate-400" />{fullAddress(c)}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-slate-700 border-l border-slate-100">{c.stock}</td>
                    <td className="px-5 py-4 text-green-700 border-l border-slate-100">{c.loaded ?? 0}</td>
                    <td className={`px-5 py-4 font-bold border-l border-slate-100 ${remaining > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{remaining}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setErr(''); setAddAmount(''); setAddStock({ id: c.id, name: c.name, current: c.stock, waiting: c.waiting ?? 0 }) }}
                          title="הוסף מלאי מיידי"
                          className="text-emerald-600 hover:text-white hover:bg-emerald-600 border border-emerald-200 rounded-lg p-1.5"><Plus size={16} /></button>
                        <button onClick={() => { setErr(''); setModal({ id: c.id, name: c.name, stock: String(c.stock), city: c.city ?? '', address: c.address ?? '', pickup_days: c.pickup_days ?? '', pickup_hours: c.pickup_hours ?? '' }) }}
                          className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg p-1.5"><Pencil size={16} /></button>
                        <button onClick={() => remove(c)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg p-1.5"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* מודאל הוספה/עריכה */}
      {modal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">{modal.id ? 'עריכת מוקד' : 'הוספת מוקד'}</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">שם המוקד <span className="text-red-500">*</span></label>
                <input value={modal.name} onChange={e => setModal(m => m && { ...m, name: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="שם המוקד…" autoFocus />
              </div>

              <CityStreetPicker
                city={modal.city}
                address={modal.address}
                onCityChange={city => setModal(m => m && { ...m, city })}
                onAddressChange={address => setModal(m => m && { ...m, address })}
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700">ימי איסוף</label>
                  <input value={modal.pickup_days} onChange={e => setModal(m => m && { ...m, pickup_days: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="לדוגמה: ימי שני ושלישי" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700">שעות איסוף</label>
                  <input value={modal.pickup_hours} onChange={e => setModal(m => m && { ...m, pickup_hours: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="לדוגמה: 19:30 - 21:00" dir="ltr" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">מלאי כרטיסים</label>
                <input type="number" min="0" value={modal.stock} onChange={e => setModal(m => m && { ...m, stock: e.target.value })}
                  className="w-32 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="0" />
              </div>

              {err && <p className="text-sm text-red-600">{err}</p>}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">ביטול</button>
                <button onClick={save} disabled={busy || !modal.name.trim()}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-5 py-2">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} {modal.id ? 'שמירה' : 'הוסף'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* מודאל הוספת מלאי מיידית */}
      {addStock && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl" onClick={() => setAddStock(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">הוספת מלאי — {addStock.name}</h3>
              <button onClick={() => setAddStock(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <p className="text-sm text-slate-600">מלאי נוכחי: <strong>{addStock.current}</strong>. כמה כרטיסים להוסיף?</p>
              {addStock.waiting > 0 && (
                <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-amber-800">
                  <span>⚠️</span>
                  <span>שים לב: יש <strong>{addStock.waiting}</strong> {addStock.waiting === 1 ? 'משפחה שממתינה' : 'משפחות שממתינות'} לקבל כרטיס במוקד זה — הן יקבלו כרטיס אוטומטית מהמלאי החדש.</span>
                </div>
              )}
              <input type="number" min="1" value={addAmount} autoFocus
                onChange={e => setAddAmount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveAddStock() }}
                className="w-32 rounded-lg border border-slate-300 px-3 py-2.5 text-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="0" />
              {addAmount && parseInt(addAmount, 10) > 0 && (() => {
                const add = parseInt(addAmount, 10)
                const served = Math.min(addStock.waiting, add)
                const newStock = Math.max(0, addStock.current + add - addStock.waiting)
                const stillWaiting = Math.max(0, addStock.waiting - (addStock.current + add))
                return (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {addStock.waiting > 0
                      ? <>שים לב יש <strong>{addStock.waiting}</strong> {addStock.waiting === 1 ? 'משפחה שממתינה' : 'משפחות שממתינות'} לקבל כרטיס במוקד זה — {served} {served === 1 ? 'תקבל' : 'יקבלו'} כרטיס מיד, <strong>המלאי החדש יהיה {newStock}</strong>.{stillWaiting > 0 ? ` (עדיין ימתינו ${stillWaiting}.)` : ''}</>
                      : <>מלאי חדש יהיה: <strong>{addStock.current + add}</strong>.</>}
                  </p>
                )
              })()}
              {err && <p className="text-sm text-red-600">{err}</p>}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={() => setAddStock(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">ביטול</button>
                <button onClick={saveAddStock} disabled={busy || !addAmount || parseInt(addAmount, 10) <= 0}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-5 py-2">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} הוסף מלאי
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  )
}
