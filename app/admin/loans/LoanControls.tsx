'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Check, X, ChevronDown, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { goToNextPending } from '@/lib/nextPending'
import type { Loan, LoanStatus } from '@/types'

// סטטוס זכאות להלוואה: ממתין / זכאי (מאושר) / לא זכאי (לא מאושר)
const PILL: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending:   { label: 'ממתין לאישור', cls: 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200', icon: Clock },
  approved:  { label: 'מאושר',        cls: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200', icon: Check },
  active:    { label: 'מאושר',        cls: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200', icon: Check },
  completed: { label: 'מאושר',        cls: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200', icon: Check },
  rejected:  { label: 'לא מאושר',     cls: 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200', icon: X },
  defaulted: { label: 'לא מאושר',     cls: 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200', icon: X },
}

export function LoanStatusControl({ loan, advance }: { loan: Loan; advance?: boolean }) {
  const router = useRouter()
  const supabase = createClient()
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const pill = PILL[loan.status] ?? PILL.pending
  const Icon = pill.icon

  const toggle = () => {
    if (open) { setOpen(false); return }
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setCoords({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    setOpen(true)
  }

  const setStatus = async (next: LoanStatus) => {
    setSaving(true)
    try {
      const { error } = await supabase.from('loans').update({ status: next }).eq('id', loan.id)
      if (error) throw error
      // באישור הבקשה — מייל "בקשתך אושרה" לנרשם + הפיכת המשפחה ל"מאושר" אוטומטית
      if (next === 'approved') {
        await fetch('/api/admin/request-approved', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'loan', id: loan.id }),
        }).catch(() => {})
      }
      setOpen(false)
      // טיפול בבקשה ממתינה מתוך כרטיס הבקשה → קפיצה לבקשה הממתינה הבאה
      if (advance && next !== 'pending') {
        await goToNextPending(supabase, router, { table: 'loans', statusColumn: 'status', pendingValues: ['pending'], currentId: loan.id, detailBase: '/admin/loans', listPath: '/admin/loans' })
      } else {
        router.refresh()
      }
    } catch (err: unknown) {
      alert(`שגיאה בעדכון: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const options: { value: LoanStatus; label: string; cls: string; icon: typeof Check }[] = [
    { value: 'approved',  label: 'אשר (זכאי)',      cls: 'text-green-700 hover:bg-green-50', icon: Check },
    { value: 'rejected',  label: 'דחה (לא זכאי)',   cls: 'text-red-600 hover:bg-red-50', icon: X },
    { value: 'pending',   label: 'החזר לממתין',     cls: 'text-amber-700 hover:bg-amber-50', icon: Clock },
  ]
  const isApprovedLike = loan.status === 'approved' || loan.status === 'active' || loan.status === 'completed'
  const isRejectedLike = loan.status === 'rejected' || loan.status === 'defaulted'

  return (
    <div className="inline-block">
      <button ref={btnRef} onClick={toggle} disabled={saving}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-60 ${pill.cls}`}>
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
        {pill.label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && coords && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed z-50 w-44 bg-white rounded-xl border border-slate-200 shadow-xl py-1"
            style={{ top: coords.top, right: coords.right }}>
            {options
              .filter(o => !(o.value === loan.status || (o.value === 'approved' && isApprovedLike) || (o.value === 'rejected' && isRejectedLike)))
              .map(o => {
                const OIcon = o.icon
                return (
                  <button key={o.value} onClick={() => setStatus(o.value)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right transition-colors ${o.cls}`}>
                    <OIcon size={15} /> {o.label}
                  </button>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}

export function DeleteLoanButton({ loanId, redirect }: { loanId: string; redirect?: boolean }) {
  const router = useRouter()
  const supabase = createClient()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('למחוק את ההלוואה לצמיתות? פעולה זו אינה הפיכה.')) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('loans').delete().eq('id', loanId)
      if (error) throw error
      if (redirect) router.push('/admin/loans')
      router.refresh()
    } catch (err: unknown) {
      alert(`שגיאה במחיקה: ${err instanceof Error ? err.message : String(err)}`)
      setDeleting(false)
    }
  }

  return (
    <button onClick={handleDelete} disabled={deleting}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-white hover:bg-red-600 px-2.5 py-1.5 rounded-lg border border-red-200 hover:border-red-600 transition-colors disabled:opacity-50">
      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} מחיקה
    </button>
  )
}
