'use client'
import { Save, Loader2, AlertCircle } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// סרגל שמירה שצף על המסך ברגע שיש שינוי שלא נשמר.
//
// 🔴 הבעיה שזה פותר: המנהל עורך נוסח, גולל למטה, ויוצא מהמסך — והשינוי
// אובד בלי שום סימן. הודעה שנראתה מעודכנת על המסך ממשיכה להישמע בטלפון
// בנוסח הישן.
//
// ⚠️ צף (fixed) ולא בתחתית הטופס: ההודעות ארוכות, ובטופס גלול הכפתור
// יורד מהמסך בדיוק כשמתחילים לערוך — כלומר נעלם מהעין ברגע שהוא הופך
// לרלוונטי.
//
// ⚠️ ההבהוב הוא pulse על הצל בלבד. אנימציה על הכפתור עצמו מזיזה אותו
// והופכת אותו לקשה ללחיצה — במיוחד בנייד.
// ─────────────────────────────────────────────────────────────────────────────

export default function StickySaveBar({
  dirty, saving, onSave, label = 'שמירת שינויים', hint,
}: {
  /** יש שינוי שלא נשמר. כשאין — הסרגל אינו מוצג כלל. */
  dirty: boolean
  saving?: boolean
  onSave: () => void
  label?: string
  /** הסבר קצר — למשל כמה שדות שונו. */
  hint?: string
}) {
  if (!dirty) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border-2 border-amber-300 bg-white px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] animate-[pulse_2s_ease-in-out_infinite]">
        <AlertCircle size={16} className="flex-shrink-0 text-amber-500" />
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold text-slate-800">יש שינויים שלא נשמרו</p>
          {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
        </div>
        <button type="button" onClick={onSave} disabled={saving}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-extrabold text-white hover:bg-amber-600 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {label}
        </button>
      </div>
    </div>
  )
}
