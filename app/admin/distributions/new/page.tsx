import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { requirePermission } from '@/lib/apiAuth'
import NoPermission from '@/components/ui/NoPermission'
import DistributionForm from '../DistributionForm'

export default async function NewDistributionPage() {
  // ה-POST אוכף 'add'; הבדיקה כאן רק מונעת טופס שנפתח ונופל בשמירה.
  if (!(await requirePermission('distributions', 'add'))) {
    return <NoPermission detail="נדרשת הרשאת הוספה בחלוקות חגים." />
  }
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/distributions" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">חלוקת חגים חדשה</h1>
          <p className="text-xs text-slate-500 mt-0.5">שם החלוקה, השנה, והסכום לכל משפחה — לפיו יחושב הצפי התקציבי</p>
        </div>
      </div>
      <DistributionForm />
    </div>
  )
}
