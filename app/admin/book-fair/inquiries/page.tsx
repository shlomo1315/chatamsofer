import { requirePermission } from '@/lib/apiAuth'
import { redirect } from 'next/navigation'
import InquiriesClient from './InquiriesClient'

// פניות מאזינים מהשלוחה הטלפונית.
//
// ⚠️ הנתונים נטענים בלקוח ולא ב-SSR: הם כוללים טלפונים והקלטות, ואין
// סיבה שיישבו ב-HTML של הדף למי שאינו מורשה.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'פניות מאזינים — יריד הספרים' }

export default async function InquiriesPage() {
  const staff = await requirePermission('book_fair', 'view')
  if (!staff) redirect('/admin')
  return <InquiriesClient />
}
