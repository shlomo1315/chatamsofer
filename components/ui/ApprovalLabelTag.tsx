// ─────────────────────────────────────────────────────────────────────────────
// תג תווית סיבת אישור — רכיב אחד לכל מקום שהתווית מופיעה בו.
//
// התווית מסבירה למה אדם שאינו צאצא רשאי להגיש בקשות ("משפחת שטרן"). היא
// מוצגת ברשימות הבקשות ובכרטסות של כל המחלקות — הלוואות, יולדות, סיוע.
//
// ⚠️ רכיב משותף ולא העתקה: תג שנראה אחרת בכל מחלקה מאבד את תפקידו כסימן
// מזהה. המזכיר צריך לזהות אותו במבט, לא לקרוא אותו מחדש בכל מסך.
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ הטיפוס עבר ל-types/index.ts ומיוצא מכאן מחדש: הוא נדרש גם בשאילתות
// בצד השרת, וייבוא של רכיב React משם היה גורר את כל עץ ה-UI לקוד השרת.
export type { ApprovalLabel } from '@/types'
import type { ApprovalLabel } from '@/types'

// ⚠️ מפה מפורשת ולא מחרוזת מורכבת: Tailwind גוזר את המחלקות בזמן build
// מתוך הטקסט שבקוד, ו-`bg-${color}-50` פשוט לא היה קיים בפלט.
const TONE: Record<string, string> = {
  slate:   'border-slate-200 bg-slate-50 text-slate-700',
  indigo:  'border-indigo-200 bg-indigo-50 text-indigo-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber:   'border-amber-200 bg-amber-50 text-amber-700',
  rose:    'border-rose-200 bg-rose-50 text-rose-700',
  sky:     'border-sky-200 bg-sky-50 text-sky-700',
  violet:  'border-violet-200 bg-violet-50 text-violet-700',
}

export default function ApprovalLabelTag({ label, size = 'sm' }: {
  label?: ApprovalLabel | null
  size?: 'sm' | 'xs'
}) {
  if (!label?.name) return null
  const tone = TONE[label.color ?? 'slate'] ?? TONE.slate
  return (
    <span
      // ⚠️ הסיבה ב-title ולא בטקסט: היא ארוכה מכדי לשבת בשורת טבלה,
      // אבל מי שתוהה "למה הוא אושר" מקבל אותה בריחוף בלי לעזוב את המסך.
      title={label.notes ? `${label.name} — ${label.notes}` : label.name}
      className={`inline-flex shrink-0 items-center rounded-full border font-bold ${tone} ${
        size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      }`}>
      {label.name}
    </span>
  )
}
