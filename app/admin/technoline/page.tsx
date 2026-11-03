import { PhoneCall } from 'lucide-react'
import { requireStaff } from '@/lib/apiAuth'
import NoPermission from '@/components/ui/NoPermission'
import TechnolineClient from './TechnolineClient'

// ניהול הטלפוניה בטכנוליין: שלוש מערכות נפרדות (ראשית, יריד ספרים, מפיצים) ולשונית חשבון.
export const dynamic = 'force-dynamic'

export default async function TechnolinePage() {
  if (!(await requireStaff(['admin']))) return <NoPermission detail="ניהול הטלפוניה פתוח למנהלי המערכת בלבד." />
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-teal-50">
          <PhoneCall size={20} className="text-teal-600" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">טכנוליין</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">מצב המערכות, בניית שלוחות, הקלטות ומספרים</p>
        </div>
      </div>
      <TechnolineClient />
    </div>
  )
}
