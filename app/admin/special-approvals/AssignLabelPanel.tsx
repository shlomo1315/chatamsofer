'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Tag, Loader2, Check, Search, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import ApprovalLabelTag, { type ApprovalLabel } from '@/components/ui/ApprovalLabelTag'

// ─────────────────────────────────────────────────────────────────────────────
// שיוך תווית סיבת אישור לאנשים — סימון מרובה והחלה בבת אחת.
//
// ⚠️ מרובה ולא אחד-אחד: התוויות מתארות *קבוצות* ("משפחת שטרן"), וכל חברי
// הקבוצה מקבלים את אותה תווית. שיוך פרטני היה הופך פעולה אחת ל-20.
// ─────────────────────────────────────────────────────────────────────────────

interface Person {
  id: string
  name: string
  id_number?: string | null
  city?: string | null
  phone?: string | null
  approval_label?: ApprovalLabel | null
}

export default function AssignLabelPanel({ people }: { people: Person[] }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [labels, setLabels] = useState<ApprovalLabel[]>([])
  const [labelId, setLabelId] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/approval-labels', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (r.ok) setLabels(d.labels ?? [])
    } catch { /* נשאר ריק */ }
  }, [])

  useEffect(() => { if (open && !labels.length) void load() }, [open, labels.length, load])

  const filtered = people.filter(p => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return [p.name, p.id_number, p.city, p.phone].filter(Boolean).join(' ').toLowerCase().includes(needle)
  })

  const toggle = (id: string) => setPicked(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  // 🔴 בקשה אחת לכל האצווה. קודם נשלחה בקשה נפרדת לכל אדם, ו-50 סימונים
  // הפכו לעשרות שניות של המתנה בלי שום חיווי.
  const apply = async (clear = false) => {
    if (!picked.size || (!clear && !labelId)) return
    setBusy(true)
    try {
      const r = await fetch('/api/admin/approval-labels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiary_ids: [...picked], label_id: clear ? null : labelId }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error || 'העדכון נכשל'); return }
      const n = Number(d.updated ?? picked.size)
      toast.success(clear ? `התווית הוסרה מ-${n} רשומות` : `${n} שויכו לתווית`)
      setPicked(new Set())
      router.refresh()
    } catch { toast.error('העדכון נכשל') }
    finally { setBusy(false) }
  }

  const label = labels.find(l => l.id === labelId)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-right transition hover:bg-slate-50">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <Tag size={17} />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">שיוך תווית לאנשים</p>
            <p className="text-xs text-slate-500 mt-0.5">
              סימון מרובה והחלת תווית — התג יופיע בכל בקשת הטבה שלהם
            </p>
          </div>
        </div>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-500">איזו תווית</span>
            <select value={labelId} onChange={e => setLabelId(e.target.value)}
              disabled={!labels.length}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400">
              <option value="">
                {labels.length ? '— בחרו תווית —' : 'אין תוויות — צרו אחת בפאנל שמעל'}
              </option>
              {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {label?.notes && <span className="text-[11px] text-slate-500">{label.notes}</span>}
          </label>

          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="חיפוש בשם, ת״ז, עיר או טלפון…"
              className="w-full rounded-xl border border-slate-200 py-2 pr-9 pl-3 text-sm outline-none focus:border-indigo-400" />
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <button type="button" onClick={() => setPicked(new Set(filtered.map(p => p.id)))}
              className="rounded-lg border border-slate-200 px-2.5 py-1 font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition">
              סימון כל המוצגים ({filtered.length})
            </button>
            {picked.size > 0 && (
              <button type="button" onClick={() => setPicked(new Set())}
                className="rounded-lg border border-slate-200 px-2.5 py-1 font-bold text-slate-500 hover:border-rose-300 hover:text-rose-600 transition">
                ניקוי הסימון
              </button>
            )}
            <span className="mr-auto font-bold text-slate-500">סומנו {picked.size}</span>
          </div>

          <div className="max-h-72 overflow-y-auto flex flex-col gap-1.5 rounded-xl border border-slate-100 p-2">
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">לא נמצאו רשומות</p>
            )}
            {filtered.map(p => {
              const on = picked.has(p.id)
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-right transition ${
                    on ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:bg-slate-50'
                  }`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {on && <Check size={11} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-800">{p.name}</span>
                      {/* התווית הנוכחית — כדי לראות מי כבר משויך ולמה */}
                      <ApprovalLabelTag label={p.approval_label} size="xs" />
                    </span>
                    <span className="block truncate text-[11px] text-slate-500 ltr-num">
                      {[p.id_number, p.city, p.phone].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void apply(false)} disabled={busy || !picked.size || !labelId}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Tag size={13} />}
              שיוך {picked.size > 0 ? `${picked.size} נבחרים` : ''}
            </button>
            {picked.size > 0 && (
              <button type="button" onClick={() => void apply(true)} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500 hover:border-rose-300 hover:text-rose-600 transition">
                <X size={13} /> הסרת התווית
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
