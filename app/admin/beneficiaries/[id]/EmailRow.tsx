'use client'
import { useState } from 'react'
import { Mail, BadgeCheck, AlertCircle } from 'lucide-react'
import QuickEmailModal from '@/components/QuickEmailModal'

// שורת פרטי "אימייל" בכרטיס הצאצא — לחיצה פותחת חלונית שליחת מייל מתוך המערכת.
//
// ⚠️ חיווי האימות אינו קישוט: מרגע שאימות המייל ניתן לכיבוי בהגדרות, יש
// במערכת כתובות שמעולם לא אומתו. מזכיר שרואה "לא מאומת" יודע שתלונת
// "לא קיבלתי מייל" עשויה לנבוע מכתובת שגויה, ולא מתקלת מסירה.
export default function EmailRow({
  email, name, verifiedAt,
}: {
  email?: string | null
  name: string
  // null/undefined = טרם אומת. ראו beneficiaries.email_verified_at.
  verifiedAt?: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-slate-500 flex-shrink-0">אימייל</span>
      {email ? (
        <span className="inline-flex items-center gap-1.5 flex-wrap justify-end">
          {verifiedAt ? (
            <span title={`אומת בתאריך ${new Date(verifiedAt).toLocaleDateString('he-IL')}`}
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5">
              <BadgeCheck size={11} /> מאומת
            </span>
          ) : (
            <span title="הכתובת לא אומתה בקוד — ייתכן שאינה תקינה"
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
              <AlertCircle size={11} /> לא מאומת
            </span>
          )}
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
        </span>
      ) : (
        <span className="text-sm text-slate-800 ltr-num text-left">—</span>
      )}

      {open && email && (
        <QuickEmailModal to={email} toName={name} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
