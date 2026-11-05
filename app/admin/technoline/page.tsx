import { requireStaff } from '@/lib/apiAuth'
import NoPermission from '@/components/ui/NoPermission'
import TechnolineClient from './TechnolineClient'

// מרכזיה טלפונית (טכנוליין): מפת השיחה, נוסחים והקלטות, מספרים וחיבור. שלוש מערכות נפרדות.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'מרכזיה טלפונית' }

export default async function TechnolinePage() {
  if (!(await requireStaff(['admin']))) return <NoPermission detail="ניהול הטלפוניה פתוח למנהלי המערכת בלבד." />
  return <TechnolineClient />
}
