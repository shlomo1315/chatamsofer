'use client'
import { useState } from 'react'
import { GitBranch } from 'lucide-react'
import LineageBranchView from '@/app/admin/beneficiaries/[id]/LineageBranchView'

// עוטף את עץ השושלת בכרטסת היולדת כך שהוא נטען *רק בלחיצה* — עץ הדורות המלא כבד
// (שליפת כל הצמתים + פריסה + מאות אלמנטים), ולכן דחיית הרינדור עד לבקשה מפורשת
// מזרזת משמעותית את טעינת הכרטסת ואת המעבר בין הטאבים. שרשרת הדורות (breadcrumb) מוצגת ממילא.
export default function LineageTreeToggle({ nodeId }: { nodeId: string }) {
  const [open, setOpen] = useState(false)
  if (open) return <LineageBranchView nodeId={nodeId} />
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 border border-violet-200 hover:bg-violet-50 rounded-lg px-3 py-1.5 transition-colors"
    >
      <GitBranch size={13} /> הצג עץ שושלת מלא
    </button>
  )
}
