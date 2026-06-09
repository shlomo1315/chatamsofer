'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Clock, ChevronDown, Loader2, FileText, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EligibilityStatus, ELIGIBILITY_LABELS } from '@/types'
import { approvalEmail, docsPendingEmail } from '@/lib/emailTemplates'
import { useDocTypes } from '@/lib/useDocTypes'

const PENDING_SET: EligibilityStatus[] = ['pending']

const STYLES: Record<string, string> = {
  pending:      'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200',
  approved:     'bg-green-100 text-green-800 hover:bg-green-200 border-green-200',
  rejected:     'bg-red-100 text-red-800 hover:bg-red-200 border-red-200',
  docs_pending: 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200',
  review:       'bg-violet-100 text-violet-800 hover:bg-violet-200 border-violet-200',
}

export default function StatusControl({ id, status }: { id: string; status: EligibilityStatus }) {
  const router  = useRouter()
  const supabase = createClient()

  const { docTypes } = useDocTypes()
  const [open, setOpen]       = useState(false)
  const [saving, setSaving]   = useState(false)

  // Rejection modal
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  // docs_pending modal
  const [showDocsModal, setShowDocsModal] = useState(false)
  const [docsNotes, setDocsNotes]         = useState('')
  const [docsChecklist, setDocsChecklist] = useState<string[]>([])
  const toggleDoc = (key: string) =>
    setDocsChecklist(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const isPending = PENDING_SET.includes(status)
  const styleKey  = isPending ? 'pending' : (STYLES[status] ? status : 'pending')
  const label     = ELIGIBILITY_LABELS[status] || status
  const Icon      = isPending ? Clock : status === 'approved' ? Check : status === 'rejected' ? X : FileText

  const applyStatus = async (next: EligibilityStatus, extra?: { rejection_reason?: string; docs_notes?: string; required_docs?: string }) => {
    setSaving(true)
    try {
      // כשעוברים לסטטוס שאינו "השלמת מסמכים" — מנקים את רשימת המסמכים הנדרשים
      const update: Record<string, unknown> = {
        eligibility_status: next,
        updated_at: new Date().toISOString(),
        ...(next === 'docs_pending' ? {} : { required_docs: '' }),
        ...extra,
      }
      const { error } = await supabase.from('beneficiaries').update(update).eq('id', id)
      if (error) throw error

      // Send email notification
      await fetch('/api/admin/send-status-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: next, reason: extra?.rejection_reason, docsNotes: extra?.docs_notes }),
      })

      setOpen(false)
      router.refresh()
    } catch (err: unknown) {
      alert(`שגיאה בעדכון הסטטוס: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleOptionClick = (next: EligibilityStatus) => {
    setOpen(false)
    if (next === 'rejected') { setShowRejectModal(true); return }
    if (next === 'docs_pending') { setShowDocsModal(true); return }
    applyStatus(next)
  }

  const options: { value: EligibilityStatus; label: string; cls: string; icon: typeof Check }[] = [
    { value: 'approved',     label: 'אשר זכאות',       cls: 'text-green-700 hover:bg-green-50',  icon: Check    },
    { value: 'rejected',     label: 'דחה',              cls: 'text-red-600 hover:bg-red-50',      icon: X        },
    { value: 'docs_pending', label: 'השלמת מסמכים',    cls: 'text-blue-600 hover:bg-blue-50',    icon: FileText },
    { value: 'pending',      label: 'החזר לממתין',      cls: 'text-amber-700 hover:bg-amber-50',  icon: Clock    },
  ]

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={saving}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-60 ${STYLES[styleKey]}`}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
          {label}
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute z-20 mt-1 left-0 w-48 bg-white rounded-xl border border-slate-200 shadow-lg py-1">
            {options
              .filter((o) => o.value !== status && !(o.value === 'pending' && isPending))
              .map((o) => {
                const OIcon = o.icon
                return (
                  <button
                    key={o.value}
                    onClick={() => handleOptionClick(o.value)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right transition-colors ${o.cls}`}
                  >
                    <OIcon size={15} />
                    {o.label}
                  </button>
                )
              })}
          </div>
        )}
      </div>

      {/* Rejection modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <h2 className="text-base font-bold text-slate-900">אשר דחייה</h2>
            </div>
            <p className="text-sm text-slate-500 mb-3">סיבת הדחייה תופיע במייל שישלח לצאצא.</p>
            <textarea
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              placeholder="הזן סיבת דחייה (אופציונלי)..."
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => { setShowRejectModal(false); setRejectionReason('') }}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                ביטול
              </button>
              <button
                disabled={saving}
                onClick={() => {
                  setShowRejectModal(false)
                  applyStatus('rejected', { rejection_reason: rejectionReason })
                }}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
                {saving && <Loader2 size={13} className="animate-spin" />}
                אשר דחייה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Docs pending modal */}
      {showDocsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                <FileText size={18} className="text-blue-600" />
              </div>
              <h2 className="text-base font-bold text-slate-900">השלמת מסמכים</h2>
            </div>
            <p className="text-sm text-slate-500 mb-3">סמן אילו מסמכים חסרים. הצאצא יקבל מייל עם קישור להעלאתם.</p>
            <div className="flex flex-col gap-1.5 mb-3">
              {docTypes.map(opt => {
                const checked = docsChecklist.includes(opt.value)
                return (
                  <label key={opt.value}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm
                      ${checked ? 'border-blue-300 bg-blue-50 text-blue-800 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleDoc(opt.value)}
                      className="w-4 h-4 accent-blue-600" />
                    {opt.label}
                  </label>
                )
              })}
            </div>
            <textarea
              value={docsNotes}
              onChange={e => setDocsNotes(e.target.value)}
              placeholder="הערה נוספת לצאצא (לא חובה)..."
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => { setShowDocsModal(false); setDocsNotes(''); setDocsChecklist([]) }}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                ביטול
              </button>
              <button
                disabled={saving || docsChecklist.length === 0}
                onClick={() => {
                  setShowDocsModal(false)
                  applyStatus('docs_pending', { docs_notes: docsNotes, required_docs: docsChecklist.join(',') })
                  setDocsChecklist([]); setDocsNotes('')
                }}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                {saving && <Loader2 size={13} className="animate-spin" />}
                שלח ועדכן סטטוס
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
