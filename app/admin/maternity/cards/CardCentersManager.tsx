'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Check, X, Loader2, Warehouse } from 'lucide-react'
import type { CardCenter } from '@/types'

export default function CardCentersManager() {
  const [centers, setCenters] = useState<CardCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [newName, setNewName] = useState('')
  const [newStock, setNewStock] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editStock, setEditStock] = useState('')
  const [editName, setEditName] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/card-centers', { cache: 'no-store' })
      const d = await r.json()
      setCenters(d.centers ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const apply = (d: { centers?: CardCenter[]; error?: string }) => {
    if (d.error) { setErr(d.error); return false }
    setCenters(d.centers ?? []); setErr(''); return true
  }

  const add = async () => {
    if (!newName.trim()) return
    setBusy(true); setErr('')
    const r = await fetch('/api/admin/card-centers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, stock: newStock }) })
    if (apply(await r.json())) { setNewName(''); setNewStock('') }
    setBusy(false)
  }
  const saveEdit = async (id: string) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/admin/card-centers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: editName, stock: editStock }) })
    if (apply(await r.json())) setEditId(null)
    setBusy(false)
  }
  const remove = async (c: CardCenter) => {
    if (!confirm(`למחוק את המוקד "${c.name}"?`)) return
    setBusy(true); setErr('')
    const r = await fetch(`/api/admin/card-centers?id=${c.id}`, { method: 'DELETE' })
    apply(await r.json())
    setBusy(false)
  }

  const totStock = centers.reduce((s, c) => s + c.stock, 0)
  const totLoaded = centers.reduce((s, c) => s + (c.loaded ?? 0), 0)
  const totApproved = centers.reduce((s, c) => s + (c.approved ?? 0), 0)
  const totRemaining = totStock - totLoaded

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Warehouse size={18} className="text-emerald-600" />
        <h2 className="font-semibold text-slate-900">מוקדי כרטיסים ומלאי</h2>
      </div>

      {/* סיכום מלאי */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'סה״כ מלאי', value: totStock, cls: 'text-slate-800', bg: 'bg-slate-50 border-slate-200' },
          { label: 'אושרו', value: totApproved, cls: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
          { label: 'נטענו', value: totLoaded, cls: 'text-green-700', bg: 'bg-green-50 border-green-200' },
          { label: 'נשאר', value: totRemaining, cls: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border px-4 py-3.5 text-center ${s.bg}`}>
            <p className="text-xs text-slate-500 mb-0.5">{s.label}</p>
            <p className={`text-3xl font-extrabold ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 size={15} className="animate-spin" /> טוען מוקדים…</div>
      ) : (
        <div className="flex flex-col gap-2">
          {centers.map(c => {
            const remaining = c.remaining ?? 0
            const available = c.available ?? 0
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-2.5">
                {editId === c.id ? (
                  <>
                    <input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">מלאי</span>
                      <input type="number" min="0" value={editStock} onChange={e => setEditStock(e.target.value)} className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-center" />
                    </div>
                    <button onClick={() => saveEdit(c.id)} disabled={busy} className="text-green-600 hover:bg-green-50 rounded-lg p-1.5"><Check size={16} /></button>
                    <button onClick={() => setEditId(null)} className="text-slate-400 hover:bg-slate-100 rounded-lg p-1.5"><X size={16} /></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 min-w-0 font-medium text-slate-800 truncate">{c.name}</span>
                    <div className="flex items-center gap-2 text-xs flex-shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">מלאי {c.stock}</span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">אושרו {c.approved ?? 0}</span>
                      <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700">נטענו {c.loaded ?? 0}</span>
                      <span className={`px-2 py-0.5 rounded-full font-bold ${remaining > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>נשאר {remaining}</span>
                      <span className={`px-2 py-0.5 rounded-full ${available > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>פנוי לאישור {available}</span>
                    </div>
                    <button onClick={() => { setEditId(c.id); setEditName(c.name); setEditStock(String(c.stock)) }} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg p-1.5 flex-shrink-0"><Pencil size={15} /></button>
                    <button onClick={() => remove(c)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg p-1.5 flex-shrink-0"><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            )
          })}
          {centers.length === 0 && <p className="text-sm text-slate-400 py-2">אין מוקדים עדיין. הוסף מוקד ראשון למטה.</p>}

          {/* הוספת מוקד */}
          <div className="flex items-center gap-2 mt-2 pt-3 border-t border-slate-100">
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="שם מוקד חדש…" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="number" min="0" value={newStock} onChange={e => setNewStock(e.target.value)} placeholder="מלאי" className="w-24 rounded-lg border border-slate-300 px-2 py-2 text-sm text-center" />
            <button onClick={add} disabled={busy || !newName.trim()} className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />} הוסף
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
