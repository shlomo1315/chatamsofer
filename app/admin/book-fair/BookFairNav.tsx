'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, ShoppingCart, BookOpen, Users, Settings2, ExternalLink, Mail, MessageSquare, Undo2, Store, Inbox, PackageX, HandCoins, Truck, CreditCard, Phone } from 'lucide-react'

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
  { href: '/admin/book-fair/stand',    label: 'דוכן היריד', icon: Store },
  { href: '/admin/book-fair/books',    label: 'קטלוג',   icon: BookOpen },
  { href: '/admin/book-fair/audience', label: 'תפוצה',   icon: Users },
  // ⚠️ מיילים ופניות היו קיימים אך לא הופיעו כאן — אי אפשר היה להגיע
  // אליהם בלי לדעת את הכתובת.
  { href: '/admin/book-fair/emails',   label: 'מיילים',  icon: Mail },
  { href: '/admin/book-fair/announcement-mail', label: 'הודעה למזמינים', icon: Mail },
  { href: '/admin/book-fair/voice-broadcast', label: 'הודעה קולית', icon: Phone },
  // 🔴 14.10: תיבת yerid@ בלבד. קודם הקישור הוביל ל-/admin/mail הכללי,
  // שנפתח על office@ ואפשר לעבור לכל תיבה במערכת.
  { href: '/admin/book-fair/mailbox',  label: 'תיבת מייל', icon: Inbox },
  { href: '/admin/book-fair/inquiries', label: 'פניות',  icon: MessageSquare },
  // ⚠️ כל הזיכויים במקום אחד, עם תתי-לשוניות (פתוחים / ספרים חסרים / ספרים שזוכו).
  { href: '/admin/book-fair/refunds',  label: 'זיכויים', icon: Undo2 },
  { href: '/admin/book-fair/shipping-issues', label: 'תקלות משלוח', icon: PackageX },
  // 14.10: דמי משלוח לפי עיר, לתשלום לשליחים.
  { href: '/admin/book-fair/shipping-cities', label: 'משלוחים לפי עיר', icon: Truck },
  // 🔴 14.10: התחשבנות עם מחברים/מו"לים — כמה נגבה, 5%, מה שולם.
  { href: '/admin/book-fair/settlement', label: 'התחשבנות', icon: HandCoins },
  // 18.10: חיובי האשראי באקסל של נדרים מול ההזמנות.
  { href: '/admin/book-fair/card-reconciliation', label: 'סנכרון אשראי', icon: CreditCard },
  // 15.10: כמה כל מחבר/מכון/מו"ל אמור לקבל לפי מחיר לעותק.
  { href: '/admin/book-fair/author-payouts', label: 'סכומים למחברים', icon: HandCoins },
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
