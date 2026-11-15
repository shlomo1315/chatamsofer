import { guardAdminPage } from '@/lib/pageGuard'
import PageHeader from '@/components/ui/PageHeader'
import MatchmakerGrantsClient from './MatchmakerGrantsClient'

export const dynamic = 'force-dynamic'

export default async function MatchmakerGrantsPage() {
  await guardAdminPage()
  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader title="מלגות שדכנים" subtitle="בקשות מלגה על שידוכים: אישור, סכום, תשלום ובדיקת נכדי החתם סופר" />
      <MatchmakerGrantsClient />
    </div>
  )
}
