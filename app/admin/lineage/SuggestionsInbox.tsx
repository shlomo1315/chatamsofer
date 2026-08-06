'use client'
import { useState, useEffect, useCallback } from 'react'
import { Inbox, Loader2, Check, X, UserPlus, Pencil, GitBranch, MessageSquare, ChevronLeft } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// תיבת הצעות תיקון-ייחוס מצאצאים. מציגה באנר כשיש הצעות ממתינות, ובלחיצה
// פותחת רשימה עם אישור/דחייה לכל הצעה. אישור מחיל את השינוי בעץ (בשרת).
// ─────────────────────────────────────────────────────────────────────────────

interface Suggestion {
  id: string; kind: 'rename' | 'add_child' | 'reparent' | 'note'
  node_id: string | null; parent_id: string | null
  proposed_name: string | null; relation: 'son' | 'son_in_law' | null
  payload: { text?: string } | null; reviewer_name: string | null; created_at: string
}

const KIND_META = {
  rename: { icon: Pencil, label: 'תיקון שם', color: '#7C3AED' },
  add_child: { icon: UserPlus, label: 'הוספת דור', color: '#059669' },
  reparent: { icon: GitBranch, label: 'שינוי שיוך', color: '#D97706' },
  note: { icon: MessageSquare, label: 'הערה', color: '#0891B2' },
}

export default function SuggestionsInbox({ onApplied }: { onApplied: () => void }) {
  const toast = useToast()
  const [items, setItems] = useState<Suggestion[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lineage/suggestions', { cache: 'no-store' })
      const d = await res.json()
      if (res.ok) { setItems(d.suggestions ?? []); setNames(d.nameById ?? {}) }
    } catch { /* שקט — הבאנר פשוט לא יופיע */ }
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const decide = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id)
    try {
      const res = await fetch('/api/admin/lineage/suggestions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || 'שגיאה'); setBusy(null); return }
      setItems(prev => prev.filter(s => s.id !== id))
      toast.success(action === 'approve' ? 'ההצעה אושרה והוחלה בעץ' : 'ההצעה נדחתה')
      if (action === 'approve') onApplied()
    } catch { toast.error('שגיאת רשת') }
    setBusy(null)
  }

  if (!items.length && !loading) return null

  const describe = (s: Suggestion): string => {
    const node = s.node_id ? (names[s.node_id] ?? '—') : ''
    const parent = s.parent_id ? (names[s.parent_id] ?? '—') : ''
    if (s.kind === 'rename') return `«${node}» → «${s.proposed_name}»`
    if (s.kind === 'add_child') return `להוסיף «${s.proposed_name}» (${s.relation === 'son_in_law' ? 'חתן' : 'בן'}) תחת «${parent}»`
    if (s.kind === 'reparent') return `להעביר את «${node}» להיות תחת «${parent}»`
    return s.payload?.text ?? ''
  }

  return (
    <div className="mb-4" dir="rtl">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-right hover:bg-amber-100 transition-colors">
        <Inbox size={18} className="text-amber-600" />
        <span className="font-bold text-amber-900">{items.length} הצעות תיקון מצאצאים ממתינות לאישור</span>
        <ChevronLeft size={16} className={`text-amber-500 mr-auto transition-transform ${open ? '-rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
          {items.map(s => {
            const meta = KIND_META[s.kind]
            const Icon = meta.icon
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0" style={{ background: `${meta.color}18`, color: meta.color }}>
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${meta.color}18`, color: meta.color }}>{meta.label}</span>
                    {s.reviewer_name && <span className="text-xs text-slate-400">מאת {s.reviewer_name}</span>}
                  </div>
                  <p className="text-sm text-slate-800 mt-0.5 break-words">{describe(s)}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => decide(s.id, 'approve')} disabled={busy === s.id}
                    className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 rounded-lg px-2.5 py-1.5 transition-colors">
                    {busy === s.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} אשר
                  </button>
                  <button onClick={() => decide(s.id, 'reject')} disabled={busy === s.id}
                    className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg px-2.5 py-1.5 transition-colors">
                    <X size={13} /> דחה
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
