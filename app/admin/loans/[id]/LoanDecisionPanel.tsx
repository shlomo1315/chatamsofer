'use client'
import { useState } from 'react'
import { CheckCircle2, XCircle, Pencil } from 'lucide-react'
import { LoanStatusControl } from '../LoanControls'
import type { Loan } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// אזור ההחלטה בכרטסת ההלוואה.
//
// 🔴 בקשה שכבר הוכרעה מציגה את ההחלטה, לא את כפתורי ההכרעה.
//
// ⚠️ קודם הוצג כאן תמיד "החלטה על הבקשה · אישור או דחייה — סיבת הדחייה
// תישמר ותוצג בבקשה הבאה". הניסוח הזה הוא הוראה לפעולה שכבר בוצעה:
// המזכיר שפתח בקשה מאושרת ראה את אותו מסך בדיוק כמו בבקשה חדשה, ולא
// ידע מהסתכלות אם היא כבר טופלה — ומתי, ועל סמך מה.
//
// ⚠️ שינוי ההחלטה נשאר אפשרי אך דורש לחיצה מפורשת: הכרעה היא פעולה
// שנשלח בעקבותיה מייל למבקש, ושינוי בהיסח הדעת גרוע משינוי שלא נעשה.
// ─────────────────────────────────────────────────────────────────────────────

const DECIDED: Record<string, { label: string; done: string }> = {
  approved:  { label: 'אושרה',  done: 'הלוואה זו אושרה' },
  active:    { label: 'אושרה',  done: 'הלוואה זו אושרה' },
  completed: { label: 'אושרה',  done: 'הלוואה זו אושרה' },
  rejected:  { label: 'נדחתה',  done: 'הלוואה זו נדחתה' },
  defaulted: { label: 'נדחתה',  done: 'הלוואה זו נדחתה' },
}

const fmtDate = (d?: string | null) => {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return '' }
}

export default function LoanDecisionPanel({
  loan, familyApproved,
}: { loan: Loan; familyApproved?: boolean }) {
  const [editing, setEditing] = useState(false)

  const decided = DECIDED[loan.status]
  const isRejected = loan.status === 'rejected' || loan.status === 'defaulted'

  // בקשה שטרם הוכרעה, או שהמזכיר בחר לשנות — כפתורי ההכרעה כרגיל.
  if (!decided || editing) {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-slate-800">
            {editing ? 'שינוי ההחלטה' : 'החלטה על הבקשה'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {editing
              ? 'ההחלטה החדשה תחליף את הקודמת, ותישלח הודעה למבקש'
              : 'אישור או דחייה — סיבת הדחייה תישמר ותוצג בבקשה הבאה'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <button type="button" onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              ביטול
            </button>
          )}
          {/* ⚠️ advance רק בהכרעה ראשונה: קפיצה ל"בקשה הבאה" בזמן *שינוי*
              החלטה מוציאה את המזכיר מהבקשה שהוא בכוונה חזר אליה. */}
          <LoanStatusControl loan={loan} advance={!editing} familyApproved={familyApproved} variant="buttons" />
        </div>
      </div>
    )
  }

  const when = fmtDate(isRejected ? loan.rejected_at : loan.approved_at)

  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        {isRejected
          ? <XCircle size={22} className="text-rose-600 shrink-0 mt-0.5" />
          : <CheckCircle2 size={22} className="text-emerald-600 shrink-0 mt-0.5" />}
        <div className="min-w-0">
          <p className={`text-sm font-bold ${isRejected ? 'text-rose-800' : 'text-emerald-800'}`}>
            {decided.done}
            {when && <span className="font-semibold"> בתאריך <span className="ltr-num">{when}</span></span>}
          </p>
          {/* ⚠️ הסיבה מוצגת כאן ולא רק נשמרת: היא ההסבר היחיד שיעמוד
              לרשות מי שיפתח את הבקשה בעוד חודשיים. */}
          {isRejected && loan.rejection_reason && (
            <p className="text-xs text-rose-700 mt-1 leading-relaxed">
              סיבת הדחייה: {loan.rejection_reason}
            </p>
          )}
          {!when && (
            <p className="text-[11px] text-slate-400 mt-1">
              מועד ההחלטה אינו מתועד — הבקשה הוכרעה לפני שהתיעוד נוסף.
            </p>
          )}
        </div>
      </div>

      <button type="button" onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shrink-0">
        <Pencil size={14} /> שינוי ההחלטה
      </button>
    </div>
  )
}
