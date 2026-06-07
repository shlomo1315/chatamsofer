'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Clock, ChevronDown, Loader2, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EligibilityStatus, ELIGIBILITY_LABELS } from '@/types'

// Statuses that mean "waiting for a decision"
const PENDING_SET: EligibilityStatus[] = ['pending', 'review']

const STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200',
  approved: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200',
  rejected: 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200',
  docs_pending: 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200',
}

export default function StatusControl({ id, status }: { id: string; status: EligibilityStatus }) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const isPending = PENDING_SET.includes(status)
  const styleKey = isPending ? 'pending' : status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : status === 'docs_pending' ? 'docs_pending' : 'pending'
  const label = ELIGIBILITY_LABELS[status] || status
  const Icon = isPending ? Clock : status === 'approved' ? Check : status === 'docs_pending' ? FileText : X

  const setStatus = async (next: EligibilityStatus) => {
    setSaving(true)
    try {
      const { data: ben, error } = await supabase
        .from('beneficiaries')
        .update({ eligibility_status: next, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('full_name, family_name, email')
        .single()
      if (error) throw error

      // Send automatic email if beneficiary has an email address
      if (ben?.email) {
        const name = [ben.family_name, ben.full_name].filter(Boolean).join(' ')
        let subject = '', html = ''
        if (next === 'approved') {
          subject = 'בקשתך אושרה — היכל החתם סופר'
          html = `<p>שלום ${name}, בקשתך <strong>אושרה</strong>. לפרטים צור קשר עם המשרד.</p>`
        } else if (next === 'rejected') {
          subject = 'עדכון בקשה — היכל החתם סופר'
          html = `<p>שלום ${name}, לצערנו בקשתך לא אושרה בשלב זה. לפרטים צור קשר עם המשרד.</p>`
        } else if (next === 'docs_pending') {
          subject = 'נדרשים מסמכים נוספים — היכל החתם סופר'
          html = `<p>שלום ${name}, נדרשים מסמכים נוספים להמשך הטיפול בבקשתך. אנא פנה למשרד.</p>`
        }
        if (subject) {
          await fetch('/api/admin/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: ben.email, subject, html }),
          })
        }
      }

      setOpen(false)
      router.refresh()
    } catch (err: unknown) {
      alert(`שגיאה בעדכון הסטטוס: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const options: { value: EligibilityStatus; label: string; cls: string; icon: typeof Check }[] = [
    { value: 'approved', label: 'אשר זכאות', cls: 'text-green-700 hover:bg-green-50', icon: Check },
    { value: 'docs_pending', label: 'השלמת מסמכים', cls: 'text-blue-700 hover:bg-blue-50', icon: FileText },
    { value: 'rejected', label: 'דחה', cls: 'text-red-600 hover:bg-red-50', icon: X },
    { value: 'pending', label: 'החזר לממתין', cls: 'text-amber-700 hover:bg-amber-50', icon: Clock },
  ]

  return (
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
        <div className="absolute z-20 mt-1 left-0 w-44 bg-white rounded-xl border border-slate-200 shadow-lg py-1">
          {options
            .filter((o) => o.value !== status && !(o.value === 'pending' && isPending))
            .map((o) => {
              const OIcon = o.icon
              return (
                <button
                  key={o.value}
                  onClick={() => setStatus(o.value)}
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
  )
}
