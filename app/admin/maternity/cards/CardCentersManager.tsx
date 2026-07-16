'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Loader2, Warehouse, X, MapPin } from 'lucide-react'
import type { CardCenter } from '@/types'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import CityStreetPicker from '@/components/ui/CityStreetPicker'
import { useCan } from '@/components/StaffPermissions'

// ניהול מוקדי כרטיסי המזון — פרטי המוקדים בלבד (שם, כתובת, ימי/שעות איסוף).
// אין יותר ניהול מלאי: היולדת מקבלת כרטיס תמיד, ורשימת כל המוקדים מוצגת בשובר.
type Draft = { id?: string; name: string; city: string; address: string; pickup_days: string; pickup_hours: string }
const emptyDraft: Draft = { name: '', city: '', address: '', pickup_days: '', pickup_hours: '' }

export default function CardCentersManager() {
  const canAdd = useCan('maternity_cards', 'add')
  const canEdit = useCan('maternity_cards', 'edit')
  const canDelete = useCan('maternity_cards', 'delete')
  const { confirm, confirmDialog } = useConfirm()
  const [centers, setCenters] = useState<CardCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState<Draft | null>(null) // null=closed; id present=edit, else add

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/card-centers', { cache: 'no-store' })
      const d = await r.json()
      setCenters(d.centers ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])
  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  const save = async () => {
    if (!modal || !modal.name.trim()) { setErr('שם המוקד חובה'); return }
    setBusy(true); setErr('')
    const method = modal.id ? 'PATCH' : 'POST'
    const body = { id: modal.id, name: modal.name, city: modal.city, address: modal.address, pickup_days: modal.pickup_days, pickup_hours: modal.pickup_hours }
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

  const fullAddress = (c: CardCenter) => [c.address, c.city].filter(Boolean).join(', ')
  const schedule = (c: CardCenter) => [c.pickup_days, c.pickup_hours].filter(Boolean).join(' · ')

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Warehouse size={18} className="text-emerald-600" />
          <div>
            <h2 className="font-semibold text-slate-900">מוקדי כרטיסים</h2>
            <p className="text-xs text-slate-400">כל המוקדים הפעילים מוצגים ליולדת בשובר — היא בוחרת לאיזה לגשת</p>
          </div>
        </div>
        {canAdd && (
          <button onClick={() => { setErr(''); setModal({ ...emptyDraft }) }}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg px-4 py-2">
            <Plus size={15} /> הוסף מוקד
          </button>
        )}
      </div>

      {err && !modal && <p className="text-sm text-red-600 mb-3">{err}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 size={15} className="animate-spin" /> טוען מוקדים…</div>
      ) : centers.length === 0 ? (
        <p className="text-sm text-slate-400 py-3 text-center">אין מוקדים עדיין — לחצו על הוסף מוקד כדי להתחיל.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-[16px] text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-200 text-[15px] font-bold text-slate-600">
                <th className="px-5 py-4 font-bold border-l border-slate-200">שם המוקד</th>
                <th className="px-5 py-4 font-bold border-l border-slate-200">כתובת</th>
                <th className="px-5 py-4 font-bold border-l border-slate-200">ימי ושעות איסוף</th>
                <th className="px-5 py-4 font-bold">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {centers.map(c => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-emerald-50/30">
                  <td className="px-5 py-4 font-semibold text-slate-800 border-l border-slate-100">{c.name}</td>
                  <td className="px-5 py-4 text-slate-600 border-l border-slate-100">
                    {fullAddress(c) ? (
                      <span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-slate-400" />{fullAddress(c)}</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-4 text-slate-600 border-l border-slate-100">
                    {schedule(c) || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <button onClick={() => { setErr(''); setModal({ id: c.id, name: c.name, city: c.city ?? '', address: c.address ?? '', pickup_days: c.pickup_days ?? '', pickup_hours: c.pickup_hours ?? '' }) }}
                          className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg p-1.5"><Pencil size={16} /></button>
                      )}
                      {canDelete && (
                        <button onClick={() => remove(c)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg p-1.5"><Trash2 size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
      {confirmDialog}
    </div>
  )
}
