import { guardPage } from '@/lib/pageGuard'
import PageHeader from '@/components/ui/PageHeader'
import RefundsClient from './RefundsClient'

// רשימת הזיכויים של היריד.
//
// 🔴 הזיכוי אינו אוטומטי — נדרים אינה מחזירה כסף דרך ה-API שלנו.
// המסך הזה הוא רשימת המשימות של מי שמבצע את ההחזר ידנית, וההבחנה
// בין "נרשם" ל"בוצע" היא כל מה שהוא קיים בשבילה.

export const dynamic = 'force-dynamic'

export default async function BookFairRefundsPage() {
  await guardPage('book_fair')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="זיכויים" subtitle="מי צריך לקבל כסף בחזרה — ומי כבר קיבל" />
      <RefundsClient />
    </div>
  )
}
