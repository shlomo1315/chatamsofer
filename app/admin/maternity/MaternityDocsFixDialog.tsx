'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Mail, AlertTriangle, Check } from 'lucide-react'
import { useDocTypes } from '@/lib/useDocTypes'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// "השלמת מסמכים" מתוך כרטסת הלידה.
//
// עד כה, כשהתגלתה תקלה במסמכים של תיק לידה (ת"ז מטושטשת, ספח חסר, אישור לידה
// שלא נקלט) — היו רק שתי אפשרויות: לאשר או לדחות. דחייה סוגרת את הבקשה ומייצרת
// ליולדת חוויה של סירוב, במקום פשוט לבקש ממנה לצרף שוב.
//
// החלונית מפעילה את *אותו* מעגל התיקונים של כרטסת הצאצא: המשפחה עוברת ל"השלמת
// מסמכים", נשלח מייל עם קישור לפורטל, וכשהיולדת מעלה את כל הנדרש היא חוזרת
// אוטומטית ל"הוחזר תיקון — לבדיקה". בקשת הלידה עצמה נשארת ממתינה.
// ─────────────────────────────────────────────────────────────────────────────

// אישור לידה אינו בתפריט סוגי המסמכים (הוא נוצר מזרימת הבקשה ולא מהעלאה ידנית),
// אבל הוא התקלה השכיחה ביותר בתיק לידה — ולכן מוצע כאן במפורש.
const BIRTH_CERT = { value: 'birth_cert', label: 'אישור לידה' }

export default function MaternityDocsFixDialog({
  aidId,
  familyApproved,
  onClose,
}: {
  aidId: string
  /** המשפחה מאושרת כרגע — בקשת השלמה תחזיר אותה למעגל התיקונים */
  familyApproved?: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const { docTypes } = useDocTypes()
  const [checked, setChecked] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const options = [BIRTH_CERT, ...docTypes]
  const toggle = (v: string) => setChecked(p => p.includes(v) ? p.filter(k => k !== v) : [...p, v])

  const send = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/maternity/docs-fix', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aidId, docs: checked, notes: notes.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'שליחת הבקשה נכשלה')
      // ⚠️ כשל בשליחת המייל אינו מבטל את הפעולה (הסטטוס והתיעוד נשמרו), אבל
      // חייב להיאמר: אחרת המזכירות ממתינה למסמכים שהיולדת מעולם לא התבקשה להם.
      if (d.mailed) toast.success('הבקשה נשלחה ליולדת במייל')
      else toast.error(`הסטטוס עודכן, אך המייל לא נשלח: ${d.mailError || 'שגיאה לא ידועה'}`)
      onClose()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4" dir="rtl"
      onClick={() => { if (!saving) onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
            <FileText size={20} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">השלמת מסמכים</h3>
            <p className="text-xs text-slate-500">היולדת תקבל מייל עם קישור להעלאת המסמכים</p>
          </div>
        </div>

        <p className="mb-1 text-sm text-slate-600">סמנו אילו מסמכים יש להשלים או לתקן:</p>
        <p className="mb-3 text-xs font-bold text-red-600">⚠️ ת&quot;ז והספח הם שני מסמכים נפרדים — יש לסמן את שניהם.</p>

        <div className="mb-3 flex flex-col gap-1.5">
          {options.map(opt => {
            const on = checked.includes(opt.value)
            return (
              <label key={opt.value}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors
                  ${on ? 'border-blue-300 bg-blue-50 font-medium text-blue-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(opt.value)} className="h-4 w-4 accent-blue-600" />
                {opt.label}
              </label>
            )
          })}
        </div>

        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
          הערה ליולדת <span className="font-normal text-slate-400">· תופיע במייל (אופציונלי)</span>
        </label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          placeholder="למשל: צילום תעודת הזהות אינו קריא, נא לצלם שוב באור טוב"
          className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm
                     focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />

        {/* ⚠️ המשפחה חוזרת למעגל התיקונים — משמעותי מספיק כדי להיאמר מראש,
            כי בסטטוס זה היא אינה יכולה להגיש בקשות חדשות עד שתשלים. */}
        {familyApproved && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>המשפחה מאושרת כעת. שליחת הבקשה תחזיר אותה לסטטוס <strong>&quot;השלמת מסמכים&quot;</strong> עד שתעלה את הקבצים.</span>
          </div>
        )}

        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
          <Mail size={13} className="mt-px flex-shrink-0" />
          <span>בקשת הלידה נשארת <strong>ממתינה</strong>. הבקשה נרשמת בתיעוד המשפחה עם שמך ותאריך, וכשהיולדת תעלה את כל הנדרש התיק יסומן אוטומטית &quot;הוחזר תיקון — לבדיקה&quot;.</span>
        </p>

        <div className="mt-4 flex justify-start gap-2">
          <button type="button" onClick={send} disabled={saving || checked.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm
                       font-bold text-white transition hover:bg-blue-700 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            שלח ליולדת לתיקון
          </button>
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold
                       text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
