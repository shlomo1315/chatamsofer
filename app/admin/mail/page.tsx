import { requireStaff } from '@/lib/apiAuth'
import NoPermission from '@/components/ui/NoPermission'
import GmailInbox from './gmail/GmailInbox'

export const dynamic = 'force-dynamic'

export default async function MailPage() {
  if (!(await requireStaff())) {
    return <NoPermission detail="נדרשת הרשאת צוות לצפייה בתיבת הדואר." />
  }

  return <GmailInbox />
}
