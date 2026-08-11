import Link from 'next/link'
import { ShieldOff, ArrowRight } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// מסך "אין הרשאה" — לדפי ניהול שנחסמים ברמת ההרשאה הפרטנית.
//
// ⚠️ הודעה גלויה ולא הפניה שקטה: איש צוות שנחסם צריך לדעת *שהוא* נחסם ומה
// חסר לו, אחרת הוא מדווח על "המסך לא נטען" ומחפש תקלה שאינה קיימת.
//
// ⚠️ המסך הזה אינו האכיפה. האכיפה היא ה-return בשרת שמונע את *שליפת* הנתונים
// מלכתחילה — כאן רק מוצג מה שקרה.
// ─────────────────────────────────────────────────────────────────────────────

export default function NoPermission({
  title = 'אין לך הרשאה לצפות במסך הזה',
  detail,
}: {
  title?: string
  /** מה חסר, בשפה של מסך ההרשאות — כדי שהבקשה למנהל תהיה מדויקת. */
  detail?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
        <ShieldOff size={26} className="text-slate-400" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-slate-800">{title}</h1>
        {detail && <p className="mt-1.5 text-sm text-slate-500">{detail}</p>}
        <p className="mt-1.5 text-xs text-slate-400">
          אם אתה זקוק לגישה, בקש ממנהל המערכת להעניק לך את ההרשאה במסך ההגדרות.
        </p>
      </div>
      <Link href="/admin/dashboard"
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700">
        <ArrowRight size={15} /> חזרה ללוח הבקרה
      </Link>
    </div>
  )
}
