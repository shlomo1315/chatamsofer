import { Phone } from 'lucide-react'
import { requireStaff } from '@/lib/apiAuth'
import NoPermission from '@/components/ui/NoPermission'
import PhoneSystemClient from './PhoneSystemClient'

// ─────────────────────────────────────────────────────────────────────────────
// מרכז המערכת הטלפונית.
//
// 🔴 עד כה המידע היה מפוזר על פני שבעה מסכים בתוך "הגדרות" — מקום שנכנסים
// אליו פעם בחודש, בזמן שזהו ערוץ שדרכו נרשמות אלפי משפחות. כדי לשנות
// הודעה אחת היה צריך לדעת מראש באיזה מסך היא יושבת.
//
// 🔴 מוגבל למנהלים: שינוי הודעה כאן משפיע על כל מי שמחייג, מיד. הגבלה
// דרך SectionKey הייתה דורשת מיגרציית הרשאות לכל המשתמשים — סיכון גדול
// יותר מהתועלת, ובפועל זו ממילא עבודת מנהל.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export default async function PhoneSystemPage() {
  if (!(await requireStaff(['admin']))) {
    return <NoPermission detail="המערכת הטלפונית פתוחה למנהלי המערכת בלבד." />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-teal-50">
          <Phone size={20} className="text-teal-600" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">מערכת טלפונית</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">
            השלוחות, ההודעות וההקלטות — הכל במקום אחד
          </p>
        </div>
      </div>

      <PhoneSystemClient />
    </div>
  )
}
