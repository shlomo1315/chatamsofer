'use client'
import { useState, useRef } from 'react'
import { Loader2, Check, StickyNote } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useCan } from '@/components/StaffPermissions'

// ─────────────────────────────────────────────────────────────────────────────
// הערות המשרד — שדה טקסט חופשי בכרטסת ההלוואה, מעל כפתורי ההכרעה.
//
// ⚠️ פנימי בלבד: אינו נשלח למבקש ואינו מופיע באף מייל.
// ⚠️ נפרד מהערות המבקש (loan.notes) — ראו ההערה במיגרציה.
//
// ⚠️ שמירה אוטומטית ביציאה מהשדה ולא כפתור: המזכיר כותב הערה ומיד לוחץ
// "אשר" — כפתור שמירה נפרד היה נשכח, וההערה הייתה נעלמת עם המעבר לבקשה
// הבאה. השמירה מתבצעת רק כשהטקסט באמת השתנה.
// ─────────────────────────────────────────────────────────────────────────────

export default function OfficeNotes({ loanId, initial }: { loanId: string; initial?: string | null }) {
  const toast = useToast()
  const canEdit = useCan('loans', 'edit')
  const [value, setValue] = useState(initial ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(false)
  // הערך האחרון שנשמר — לזיהוי שינוי אמיתי, כדי לא לשלוח בקשה על כל מיקוד.
  //
  // ⚠️ אין כאן useEffect שמסנכרן את initial: המעבר לבקשה אחרת מטופל
  // ב-key שבצד הקורא (LoanDecisionPanel), שמאתחל את הקומפוננטה מחדש.
  // סנכרון ב-effect היה דורס טקסט שהמזכיר הקליד ברגע שהדף מתרענן.
  const lastSaved = useRef(initial ?? '')

  const save = async () => {
    if (!canEdit) return
    const next = value.trim()
    if (next === lastSaved.current.trim()) return

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/loans/${loanId}/office-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: next }),
      })
      if (!res.ok) { toast.error('שמירת ההערות נכשלה'); return }
      lastSaved.current = next
      setSavedAt(true)
      setTimeout(() => setSavedAt(false), 2000)
    } catch {
      toast.error('שגיאת תקשורת — ההערות לא נשמרו')
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit && !value.trim()) return null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor="office-notes" className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <StickyNote size={14} className="text-amber-500" />
          הערות המשרד
        </label>
        {saving && <span className="flex items-center gap-1 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" /> שומר…</span>}
        {savedAt && !saving && <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><Check size={13} /> נשמר</span>}
      </div>

      {canEdit ? (
        <>
          <textarea
            id="office-notes"
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={save}
            rows={3}
            placeholder="הערות פנימיות על הבקשה — לשימוש הצוות בלבד"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 leading-relaxed
                       placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400
                       transition-shadow resize-y"
          />
          <p className="text-[11px] text-slate-400">
            נשמר אוטומטית. אינו נשלח למבקש ואינו מופיע במיילים.
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
          {value}
        </p>
      )}
    </div>
  )
}
