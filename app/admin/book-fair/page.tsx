import Link from 'next/link'
import { BookOpen, ShoppingCart, Boxes, Settings2 } from 'lucide-react'
import { guardPage } from '@/lib/pageGuard'
import PageHeader from '@/components/ui/PageHeader'

// מסך הכניסה של מחלקת יריד הספרים.
//
// ⚠️ נבנה ראשון ובכוונה ריק מנתונים: הוא הוכחת המסלול המלא של ההרשאה —
// SectionKey → ALL_SECTIONS → Sidebar → guardPage. בלעדיו אי אפשר לסמן
// 'יריד ספרים' לאף משתמש, ולא לוודא שמי שלא סומן אכן נחסם.
//
// הכרטיסים מצביעים למסכים שטרם קיימים; הם ייפתחו בשלבים הבאים.

const CARDS: { href: string; label: string; desc: string; icon: React.ElementType }[] = [
  { href: '/admin/book-fair/orders',   label: 'הזמנות',  desc: 'הזמנות מהאתר ומהטלפון',        icon: ShoppingCart },
  { href: '/admin/book-fair/books',    label: 'קטלוג',   desc: 'ספרים, מחירים ותמונות',        icon: BookOpen },
  { href: '/admin/book-fair/books',    label: 'מלאי',    desc: 'מכסות לאתר ולטלפון',           icon: Boxes },
  { href: '/admin/book-fair/settings', label: 'הגדרות',  desc: 'ערים, מדרגות משלוח ופתיחה',    icon: Settings2 },
]

export default async function BookFairPage() {
  await guardPage('book_fair')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="יריד ספרים" subtitle="קטלוג, מלאי והזמנות — מהאתר ומהמערכת הטלפונית" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {CARDS.map(({ href, label, desc, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-100">
              <Icon size={20} />
            </span>
            <span className="flex flex-col gap-1">
              <span className="font-semibold text-slate-900">{label}</span>
              <span className="text-sm text-slate-500">{desc}</span>
            </span>
          </Link>
        ))}
      </div>

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        המחלקה בהקמה. המסכים ייפתחו בהדרגה — קטלוג ומלאי תחילה, ואחריהם ההזמנות.
      </p>
    </div>
  )
}
