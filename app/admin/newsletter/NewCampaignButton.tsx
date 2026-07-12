'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { DEPARTMENTS } from '@/lib/departments'

export default function NewCampaignButton() {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [dept, setDept] = useState('main')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), subject: name.trim(), from_department: dept }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'יצירה נכשלה')
      router.push(`/admin/newsletter/${d.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold
                   text-white transition hover:bg-indigo-700"
      >
        <Plus size={16} /> קמפיין חדש
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
             onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
               onClick={e => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold text-slate-800">קמפיין חדש</h2>

            <label className="mb-1.5 block text-sm font-semibold text-slate-700">שם הקמפיין</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && create()}
              placeholder="למשל: עדכון לקראת החגים"
              className="mb-4 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm
                         focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />

            <label className="mb-1.5 block text-sm font-semibold text-slate-700">נשלח מטעם</label>
            <select
              value={dept}
              onChange={e => setDept(e.target.value)}
              className="mb-5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm
                         focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {Object.values(DEPARTMENTS).map(d => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                onClick={create}
                disabled={busy || !name.trim()}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white
                           transition hover:bg-indigo-700 disabled:opacity-40"
              >
                {busy ? <Loader2 size={16} className="mx-auto animate-spin" /> : 'יצירה'}
              </button>
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold
                           text-slate-600 transition hover:bg-slate-50"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
