import { requirePermission } from '@/lib/apiAuth'
import { redirect } from 'next/navigation'
import EmailsClient from './EmailsClient'

// מיילים של היריד — מה נשלח, ושליחה חדשה.
//
// ⚠️ הנתונים נטענים בלקוח: הם כוללים כתובות מייל של לקוחות ואין
// סיבה שיישבו ב-HTML של הדף.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'מיילים — יריד הספרים' }

export default async function BookFairEmailsPage() {
  const staff = await requirePermission('book_fair', 'view')
  if (!staff) redirect('/admin')
  return <EmailsClient />
}
