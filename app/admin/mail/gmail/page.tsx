import { requireStaff } from '@/lib/apiAuth'
import NoPermission from '@/components/ui/NoPermission'
import GmailInbox from './GmailInbox'

export const dynamic = 'force-dynamic'

// תיבת הדואר של Gmail — נבנית על האינדקס.
// ⚠️ ההרשאה נבדקת בשרת: המסך נושא תוכן פניות של משפחות.
export default async function GmailMailPage() {
  if (!(await requireStaff())) {
    return <NoPermission detail="נדרשת הרשאת צוות לצפייה בתיבת הדואר." />
  }
  return <GmailInbox />
}
