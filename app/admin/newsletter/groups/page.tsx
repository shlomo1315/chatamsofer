import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import GroupsClient from './GroupsClient'

export const dynamic = 'force-dynamic'

// מסך ניהול קבוצות התפוצה (contact_lists): יצירה, שינוי שם, מחיקה,
// וכניסה לקבוצה לניהול החברים והיסטוריית השליחות.
export default function GroupsPage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link
        href="/admin/newsletter"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-700"
      >
        <ArrowRight size={16} /> חזרה לניוזלטר
      </Link>

      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-bold text-slate-800">קבוצות תפוצה</h1>
        <p className="text-sm text-slate-500">
          ניהול מלא של הקבוצות — הוספה ועריכה של חברים, ומעקב אחר כל מה שנשלח לכל קבוצה
        </p>
      </div>

      <GroupsClient />
    </div>
  )
}
