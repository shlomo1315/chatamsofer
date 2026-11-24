import { guardAdminPage } from '@/lib/pageGuard'
import DistributionsShareDashboard from './DistributionsShareDashboard'

export const metadata = { title: 'שיתוף חלוקות החגים' }

export default async function Page() {
  await guardAdminPage()
  return <DistributionsShareDashboard />
}
