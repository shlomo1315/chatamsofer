import { requireStaff } from '@/lib/apiAuth'
import NoPermission from '@/components/ui/NoPermission'
import GmailInbox from '@/app/admin/mail/gmail/GmailInbox'

// תיבת yerid@ בתוך היריד.
//
// 🔴 14.10: הלשונית הפנתה למסך הדואר הכללי (/admin/mail), שהתעלם
// מ-?department=yerid, נפתח על office@ ואפשר לעבור לכל תיבה במערכת.
// כאן התיבה נעולה ליריד: אין בורר תיבות, והשרת מחזיר רק את yerid.

export const dynamic = 'force-dynamic'

export default async function BookFairMailboxPage() {
  if (!(await requireStaff())) {
    return <NoPermission detail="נדרשת הרשאת צוות לצפייה בתיבת הדואר." />
  }
  return <GmailInbox lockDepartment="yerid" />
}
