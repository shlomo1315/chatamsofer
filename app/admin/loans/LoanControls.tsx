'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Check, X, ChevronDown, Loader2, Trash2, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { goToNextPending } from '@/lib/nextPending'
import type { Loan, LoanStatus } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

// סטטוס זכאות להלוואה: ממתין / זכאי (מאושר) / לא זכאי (לא מאושר)
const PILL: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending:   { label: 'ממתין לאישור', cls: 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200', icon: Clock },
  approved:  { label: 'מאושר',        cls: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200', icon: Check },
  active:    { label: 'מאושר',        cls: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200', icon: Check },
  completed: { label: 'מאושר',        cls: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200', icon: Check },
  rejected:  { label: 'לא מאושר',     cls: 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200', icon: X },
  defaulted: { label: 'לא מאושר',     cls: 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200', icon: X },
}

export function LoanStatusControl({ loan, advance, familyApproved }: { loan: Loan; advance?: boolean; familyApproved?: boolean }) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  // מודל אישור — קליטת הסכום שאושר בפועל לפני האישור
  const [approveOpen, setApproveOpen] = useState(false)
  const [approvedAmount, setApprovedAmount] = useState(String(Math.round(Number(loan.approved_amount ?? loan.amount) || 0)))

  const pill = PILL[loan.status] ?? PILL.pending
  const Icon = pill.icon

  const toggle = () => {
    if (open) { setOpen(false); return }
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setCoords({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    setOpen(true)
  }

  // חלק האישור/דחייה המשותף — מקבל אילו שדות לעדכן
  const applyStatus = async (next: LoanStatus, extra: Record<string, unknown> = {}) => {
    setSaving(true)
    try {
      const { error } = await supabase.from('loans').update({ status: next, ...extra }).eq('id', loan.id)
      if (error) throw error
      // באישור הבקשה — מייל "בקשתך אושרה" לנרשם + הפיכת המשפחה ל"מאושר" אוטומטית
      if (next === 'approved') {
        await fetch('/api/admin/request-approved', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'loan', id: loan.id }),
        }).catch(() => {})
      }
      setOpen(false)
      setApproveOpen(false)
      // טיפול בבקשה ממתינה מתוך כרטיס הבקשה → חלונית הצלחה ואז קפיצה לבקשה הממתינה הבאה
      if (advance && next !== 'pending') {
        setSaving(false)
        setShowSuccess(true)
        setTimeout(() => {
          goToNextPending(supabase, router, { table: 'loans', statusColumn: 'status', pendingValues: ['pending'], currentId: loan.id, detailBase: '/admin/loans', listPath: '/admin/loans' })
        }, 1500)
        return
      }
      router.refresh()
    } catch (err: unknown) {
      toast.error(`שגיאה בעדכון: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (next: LoanStatus) => {
    // חסימה: לא ניתן לאשר בקשה לפני שהמשפחה מאושרת
    if (next === 'approved' && familyApproved === false) {
      setOpen(false)
      toast.error('לא ניתן לאשר את הבקשה — יש לאשר תחילה את המשפחה (ראה/י את הפאנל הצהוב "המשפחה טרם אושרה").')
      return
    }
    // אישור — קודם מבקשים את הסכום שאושר בפועל
    if (next === 'approved') {
      setOpen(false)
      setApprovedAmount(String(Math.round(Number(loan.approved_amount ?? loan.amount) || 0)))
      setApproveOpen(true)
      return
    }
    await applyStatus(next)
  }

  const confirmApprove = async () => {
    const n = parseInt(approvedAmount.replace(/\D/g, '') || '0', 10)
    if (!n) { toast.error('יש להזין את הסכום שאושר'); return }
    await applyStatus('approved', { approved_amount: n })
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
      {approveOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-l from-green-500 to-emerald-500 px-6 py-4">
              <h2 className="text-white font-bold">אישור הלוואה</h2>
              <p className="text-emerald-100 text-xs mt-0.5">הזן את הסכום שאושר בפועל</p>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex items-center justify-between text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-slate-500">סכום מבוקש</span>
                <span className="font-semibold text-slate-700 ltr-num">₪{Math.round(Number(loan.amount) || 0).toLocaleString('he-IL')}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">סכום שאושר (₪)</label>
                <input
                  type="text" inputMode="numeric" autoFocus dir="ltr"
                  value={approvedAmount}
                  onChange={e => setApprovedAmount(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 text-left ltr-num focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-shadow"
                />
              </div>
              <div className="flex gap-3 mt-1">
                <button onClick={confirmApprove} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-green-500 to-emerald-500 text-white font-semibold py-2.5 text-sm shadow-md shadow-emerald-200 hover:opacity-90 transition-opacity disabled:opacity-50">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  אשר הלוואה
                </button>
                <button onClick={() => setApproveOpen(false)} disabled={saving}
                  className="px-5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50">
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showSuccess && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 px-8 py-7 flex flex-col items-center gap-3 max-w-xs text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 size={30} className="text-green-600" />
            </div>
            <p className="font-bold text-slate-900">הפעולה בוצעה בהצלחה</p>
            <p className="text-sm text-slate-500">מעבירים אותך לבקשה הבאה…</p>
          </div>
        </div>
      )}
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
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!(await confirm({ title: 'מחיקת הלוואה', message: 'למחוק את ההלוואה לצמיתות? פעולה זו אינה הפיכה.', confirmLabel: 'מחיקה', danger: true }))) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('loans').delete().eq('id', loanId)
      if (error) throw error
      toast.success('ההלוואה נמחקה')
      if (redirect) router.push('/admin/loans')
      router.refresh()
    } catch (err: unknown) {
      toast.error(`שגיאה במחיקה: ${err instanceof Error ? err.message : String(err)}`)
      setDeleting(false)
    }
  }

  return (
    <>
    <button onClick={handleDelete} disabled={deleting}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-white hover:bg-red-600 px-2.5 py-1.5 rounded-lg border border-red-200 hover:border-red-600 transition-colors disabled:opacity-50">
      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} מחיקה
    </button>
    {confirmDialog}
    </>
  )
}
