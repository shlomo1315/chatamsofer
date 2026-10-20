import { redirect } from 'next/navigation'

// הועבר ללשונית "זיכויים" המרוכזת. הכתובת נשארת כדי שקישורים ישנים ימשיכו לעבוד.
export default function BookFairCreditsPage() {
  redirect('/admin/book-fair/refunds?tab=missing')
}
