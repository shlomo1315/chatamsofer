'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Tag, Plus, Trash2, Loader2, X, Check } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import ApprovalLabelTag, { type ApprovalLabel } from '@/components/ui/ApprovalLabelTag'

// ─────────────────────────────────────────────────────────────────────────────
// ניהול תוויות סיבת אישור — יצירה, עריכה ומחיקה.
//
// ⚠️ כאן ולא בהגדרות: התווית נוצרת בדיוק ברגע שמשייכים אותה לאדם, ומסך
// נפרד היה מכריח לצאת מהדף באמצע העבודה ולחזור.
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = ['slate', 'indigo', 'emerald', 'amber', 'rose', 'sky', 'violet'] as const

const SWATCH: Record<string, string> = {
  slate: 'bg-slate-400', indigo: 'bg-indigo-500', emerald: 'bg-emerald-500',
  amber: 'bg-amber-500', rose: 'bg-rose-500', sky: 'bg-sky-500', violet: 'bg-violet-500',
}

interface LabelRow extends ApprovalLabel { count?: number }

export default function ApprovalLabelsPanel() {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [labels, setLabels] = useState<LabelRow[]>([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [color, setColor] = useState<string>('indigo')
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/approval-labels', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (r.ok) setLabels(d.labels ?? [])
    } catch { /* נשאר ריק */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (open && !labels.length) void load() }, [open, labels.length, load])

  const create = async () => {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      const r = await fetch('/api/admin/approval-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, color, notes: notes.trim() || null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error || 'יצירת התווית נכשלה'); return }
      toast.success(`התווית "${n}" נוצרה`)
      setName(''); setNotes('')
      await load()
      router.refresh()
    } catch { toast.error('יצירת התווית נכשלה') }
    finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/admin/approval-labels?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error || 'המחיקה נכשלה'); return }
      // ⚠️ נאמר כמה נותקו: המנהל מחק תווית, לא אנשים — והם עדיין שם.
      toast.success(Number(d.unlinked) > 0
        ? `התווית נמחקה · ${d.unlinked} רשומות נותקו ממנה`
        : 'התווית נמחקה')
      setConfirmId(null)
      await load()
      router.refresh()
    } catch { toast.error('המחיקה נכשלה') }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-right transition hover:bg-slate-50">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Tag size={17} />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">תוויות סיבת אישור</p>
            <p className="text-xs text-slate-500 mt-0.5">
              למה האדם אושר — מוצג בכל בקשת הטבה שלו
            </p>
          </div>
        </div>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-5 flex flex-col gap-4">
          {/* יצירה */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
              <span className="text-xs font-bold text-slate-500">שם התווית</span>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="למשל: משפחת שטרן"
                onKeyDown={e => { if (e.key === 'Enter') void create() }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            </label>
            <label className="flex flex-col gap-1.5 flex-[2] min-w-[200px]">
              <span className="text-xs font-bold text-slate-500">הסבר (לא חובה)</span>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="קרובי משפחה שאושרו בהחלטת ההנהלה"
                onKeyDown={e => { if (e.key === 'Enter') void create() }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            </label>
            <div className="flex items-center gap-1.5 pb-2">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  aria-label={`צבע ${c}`}
                  className={`h-6 w-6 rounded-full ${SWATCH[c]} transition ${
                    color === c ? 'ring-2 ring-offset-2 ring-slate-400' : 'opacity-60 hover:opacity-100'
                  }`}>
                  {color === c && <Check size={12} className="mx-auto text-white" />}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void create()} disabled={busy || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              הוספה
            </button>
          </div>

          {/* הרשימה */}
          <div className="flex flex-col gap-1.5">
            {loading && <p className="py-4 text-center text-sm text-slate-400">טוען תוויות…</p>}
            {!loading && !labels.length && (
              <p className="py-6 text-center text-sm text-slate-400">
                אין עדיין תוויות — הוסיפו את הראשונה למעלה
              </p>
            )}
            {labels.map(l => (
              <div key={l.id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
                <ApprovalLabelTag label={l} />
                {l.notes && <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">{l.notes}</span>}
                <span className="mr-auto text-[11px] font-bold text-slate-400">
                  {l.count ?? 0} רשומות
                </span>
                {confirmId === l.id ? (
                  <span className="flex items-center gap-1.5">
                    <button type="button" onClick={() => void remove(l.id)} disabled={busy}
                      className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                      מחיקה
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-500">
                      <X size={11} />
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmId(l.id)}
                    className="text-slate-300 transition hover:text-rose-600" aria-label="מחיקת התווית">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* ⚠️ נאמר במפורש: מחיקת תווית אינה מוחקת אנשים. בלי המשפט הזה
              המנהל מהסס למחוק תווית שגויה מחשש שימחק איתה 20 רשומות. */}
          {labels.length > 0 && (
            <p className="text-[11px] text-slate-400">
              מחיקת תווית אינה מוחקת רשומות — הן נשארות כאישור חריג בלי תווית.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
