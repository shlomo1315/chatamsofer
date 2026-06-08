'use client'
import { useState } from 'react'
import { Mail, ChevronDown } from 'lucide-react'
import BeneficiaryMailThread from '@/app/admin/beneficiaries/[id]/BeneficiaryMailThread'

// תכתובות המייל מוצגות כלשונית מתקפלת — נטענות רק בלחיצה לפתיחה,
// כדי שלא יופיעו ברצף עם שאר פרטי הכרטסת.
export default function CollapsibleMailThread({
  email,
  name,
  beneficiaryId,
}: {
  email: string
  name: string
  beneficiaryId: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-indigo-600">
          <Mail size={16} />
          <span className="text-xs font-semibold text-slate-500 uppercase">תכתובות מייל</span>
          <span className="text-xs text-slate-400 ltr-num" dir="ltr">{email}</span>
        </span>
        <ChevronDown size={18} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-100">
          <BeneficiaryMailThread email={email} name={name} beneficiaryId={beneficiaryId} />
        </div>
      )}
    </div>
  )
}
