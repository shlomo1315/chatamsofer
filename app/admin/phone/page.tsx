import { redirect } from 'next/navigation'

// הנתיב נשמר כדי שקישורים ישנים לא יישברו. המרכזיה מנוהלת במסך טכנוליין.
export default function PhoneSystemPage() {
  redirect('/admin/technoline')
}
