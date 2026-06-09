'use client'
import { useState } from 'react'
import { Mail } from 'lucide-react'
import QuickEmailModal from '@/components/QuickEmailModal'

// שורת פרטי "אימייל" בכרטיס הצאצא — לחיצה פותחת חלונית שליחת מייל מתוך המערכת.
export default function EmailRow({ email, name }: { email?: string | null; name: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-slate-500 flex-shrink-0">אימייל</span>
      {email ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="שליחת מייל מתוך המערכת"
          dir="ltr"
          className="text-sm text-indigo-600 hover:underline ltr-num text-left inline-flex items-center gap-1.5"
        >
          <Mail size={13} className="flex-shrink-0" />
          {email}
        </button>
      ) : (
        <span className="text-sm text-slate-800 ltr-num text-left">—</span>
      )}

      {open && email && (
        <QuickEmailModal to={email} toName={name} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
