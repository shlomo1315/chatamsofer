import { requireStaff } from '@/lib/apiAuth'
import NoPermission from '@/components/ui/NoPermission'
import MailClient from '@/app/admin/mail/MailClient'

// תיבת yerid@ בתוך היריד, נעולה ליריד: בלי בורר תיבות.
//
// 🔴 18.10: המסך הקודם (GmailInbox) קרא את אינדקס Gmail, ואין בו מיילים של
// yerid@ כי הם מגיעים דרך Resend ונשמרים ב-inbound_emails / sent_emails.
// לכן התיבה הייתה ריקה. MailClient קורא את הטבלאות האלה: נכנס ויוצא.

export const dynamic = 'force-dynamic'

export default async function BookFairMailboxPage() {
  if (!(await requireStaff())) {
    return <NoPermission detail="נדרשת הרשאת צוות לצפייה בתיבת הדואר." />
  }
  return <MailClient lockDepartment="yerid" />
}
