import { guardPage } from '@/lib/pageGuard'
import PageHeader from '@/components/ui/PageHeader'
import CreditsClient from './CreditsClient'

// זיכויים ללקוחות שלא קיבלו ספרים: העלאת אקסל, שליחה (שיחה / מייל) ומעקב.
export const dynamic = 'force-dynamic'

export default async function BookFairCreditsPage() {
  await guardPage('book_fair')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="זיכוי על ספרים חסרים" subtitle="העלאת אקסל, שליחה ללקוחות ואיסוף פרטי חשבון" />
      <CreditsClient />
    </div>
  )
}
