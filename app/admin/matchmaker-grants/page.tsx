import { guardPage } from '@/lib/pageGuard'
import { roleAllows } from '@/lib/permissions'
import PageHeader from '@/components/ui/PageHeader'
import MatchmakerGrantsClient from './MatchmakerGrantsClient'

export const dynamic = 'force-dynamic'

export default async function MatchmakerGrantsPage() {
  const staff = await guardPage('matchmaker_grants')
  const isAdmin = staff.role === 'admin'
  const canEdit = isAdmin || roleAllows(staff.role, staff.permissions, 'matchmaker_grants', 'edit')
  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader title="מלגות שדכנים" subtitle="בקשות מלגה על שידוכים: אישור, סכום, תשלום ובדיקת נכדי החתם סופר" />
      <MatchmakerGrantsClient canEdit={canEdit} isAdmin={isAdmin} />
    </div>
  )
}
