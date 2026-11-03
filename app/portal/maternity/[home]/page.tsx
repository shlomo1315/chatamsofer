import PortalApp from './PortalApp'
import MaintenanceNotice from '@/components/MaintenanceNotice'
import { maintenanceOn } from '@/lib/maintenance'

export const dynamic = 'force-dynamic'

export default async function RecoveryHomePortal({
  params,
}: {
  params: Promise<{ home: string }>
}) {
  if (maintenanceOn()) return <MaintenanceNotice />
  const { home: homeEncoded } = await params
  const homeName = decodeURIComponent(homeEncoded)
  return <PortalApp home={homeName} />
}
