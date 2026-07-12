import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import UnsubscribesTable from './UnsubscribesTable'

export const dynamic = 'force-dynamic'

export default function UnsubscribesPage() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link
        href="/admin/newsletter"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500
                   transition hover:text-indigo-600"
      >
        <ArrowRight size={16} />
        חזרה לקמפיינים
      </Link>

      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-bold text-slate-800">הסרות מרשימת התפוצה</h1>
        <p className="text-sm text-slate-500">מי ביקש לא לקבל עוד דיוור. אפשר להחזיר לרשימה.</p>
      </div>

      <UnsubscribesTable />

      <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
        מיילים תפעוליים (אישורי בקשות, שוברים) ממשיכים להישלח גם למי שהוסר —
        ההסרה חלה על דיוור בלבד.
      </p>
    </div>
  )
}
