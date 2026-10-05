import { guardPage } from '@/lib/pageGuard'
import PageHeader from '@/components/ui/PageHeader'
import StandClient from './StandClient'

// דוכן היריד — כל המכירות בדוכן, בזמן אמת, עם פילוח מזומן/אשראי ומוכרים.

export const dynamic = 'force-dynamic'

export default async function BookFairStandPage() {
  await guardPage('book_fair')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="דוכן היריד" subtitle="המכירות בדוכן — מתעדכן אוטומטית" />
      <StandClient />
    </div>
  )
}
