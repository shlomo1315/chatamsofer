import { guardPage } from '@/lib/pageGuard'
import PageHeader from '@/components/ui/PageHeader'
import ItemCreditsClient from './ItemCreditsClient'

// ספרים שזוכו בהזמנות (ברמת מערכת ההזמנות, בלי כסף ובלי מלאי): כדי לדעת כמה נמכר בפועל.
export const dynamic = 'force-dynamic'

export default async function BookFairItemCreditsPage() {
  await guardPage('book_fair')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="ספרים שזוכו בהזמנות" subtitle="סימון ברמת ההזמנות בלבד, כדי לדעת כמה נמכר בפועל. הזיכוי הכספי נעשה בנפרד" />
      <ItemCreditsClient />
    </div>
  )
}
