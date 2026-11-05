import { redirect } from 'next/navigation'

// הנתיב נשמר כדי שקישורים ישנים לא יישברו. השלוחה של היריד מנוהלת בהגדרות.
export default function BookFairPhonePage() {
  redirect('/admin/book-fair/settings')
}
