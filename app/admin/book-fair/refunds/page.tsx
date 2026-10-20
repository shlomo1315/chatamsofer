import Link from 'next/link'
import { guardPage } from '@/lib/pageGuard'
import PageHeader from '@/components/ui/PageHeader'
import RefundsClient from './RefundsClient'
import CreditsClient from '../credits/CreditsClient'
import CreditTestSend from '../credits/CreditTestSend'
import ItemCreditsClient from '../item-credits/ItemCreditsClient'

// מסך הזיכויים המרוכז של היריד: לשונית אחת, ובתוכה תתי-לשוניות.
//
// 🔴 הזיכוי אינו אוטומטי — נדרים אינה מחזירה כסף דרך ה-API שלנו.
// "זיכויים פתוחים" הוא רשימת המשימות של מי שמבצע את ההחזר ידנית.
// הכתובות הישנות (/credits, /item-credits) מפנות לכאן.

export const dynamic = 'force-dynamic'

const SUB_TABS = [
  { key: 'open', label: 'זיכויים פתוחים' },
  { key: 'missing', label: 'זיכוי על ספרים חסרים' },
  { key: 'items', label: 'ספרים שזוכו' },
] as const

type TabKey = (typeof SUB_TABS)[number]['key']

const SUBTITLES: Record<TabKey, string> = {
  open: 'מי צריך לקבל כסף בחזרה — ומי כבר קיבל',
  missing: 'העלאת אקסל, שליחה ללקוחות ואיסוף פרטי חשבון',
  items: 'סימון ברמת ההזמנות בלבד, כדי לדעת כמה נמכר בפועל. הזיכוי הכספי נעשה בנפרד',
}

export default async function BookFairRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const staff = await guardPage('book_fair')
  const { tab } = await searchParams
  const active: TabKey = SUB_TABS.some(t => t.key === tab) ? (tab as TabKey) : 'open'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="זיכויים" subtitle={SUBTITLES[active]} />
      <div className="flex flex-wrap gap-2">
        {SUB_TABS.map(t => (
          <Link
            key={t.key}
            href={t.key === 'open' ? '/admin/book-fair/refunds' : `/admin/book-fair/refunds?tab=${t.key}`}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              t.key === active
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {active === 'open' && <RefundsClient />}
      {active === 'missing' && (
        <>
          <CreditTestSend />
          <CreditsClient isAdmin={staff.role === 'admin'} />
        </>
      )}
      {active === 'items' && <ItemCreditsClient />}
    </div>
  )
}
