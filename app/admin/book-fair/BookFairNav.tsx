'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, ShoppingCart, BookOpen, Users, Settings2, ExternalLink } from 'lucide-react'

// סרגל ניווט פנימי של מחלקת היריד.
//
// 🔴 למה הוא נחוץ: הסרגל הראשי מסמן "יריד ספרים" כפריט אחד, ולכן מי
// שנכנס להזמנות או לקטלוג נשאר בלי שום דרך חזרה — הוא רואה טבלה ואינו
// יודע שיש עוד מסכים במחלקה. הסרגל הזה נוכח בכל מסכי היריד ומחזיר
// תחושת מקום.
//
// ⚠️ ההדגשה נקבעת לפי הנתיב הארוך ביותר שתואם, ולא לפי startsWith
// פשוט: /admin/book-fair הוא תחילית של *כל* המסכים, והיה נשאר מודגש
// תמיד.

const TABS = [
  { href: '/admin/book-fair',          label: 'סקירה',   icon: LayoutGrid },
  { href: '/admin/book-fair/orders',   label: 'הזמנות',  icon: ShoppingCart },
  { href: '/admin/book-fair/books',    label: 'קטלוג',   icon: BookOpen },
  { href: '/admin/book-fair/audience', label: 'תפוצה',   icon: Users },
  { href: '/admin/book-fair/settings', label: 'הגדרות',  icon: Settings2 },
]

export default function BookFairNav() {
  const pathname = usePathname()

  const activeHref = TABS
    .filter(t => pathname === t.href || pathname.startsWith(t.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-0">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref
        return (
          <Link
            key={href}
            href={href}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              active
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
            }`}
          >
            <Icon size={15} />
            {label}
          </Link>
        )
      })}

      {/* ⚠️ קישור לחנות החיה — הצוות צריך לראות מה הלקוח רואה,
          במיוחד אחרי שינוי מחירים או פתיחת היריד. */}
      <a
        href="/yerid"
        target="_blank"
        rel="noopener noreferrer"
        className="mr-auto flex items-center gap-1.5 px-3 py-2 text-xs text-slate-400 transition hover:text-indigo-600"
      >
        <ExternalLink size={13} />
        לחנות
      </a>
    </nav>
  )
}
