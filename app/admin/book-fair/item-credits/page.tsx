import { redirect } from 'next/navigation'

// הועבר ללשונית "זיכויים" המרוכזת. הכתובת נשארת כדי שקישורים ישנים ימשיכו לעבוד.
export default function BookFairItemCreditsPage() {
  redirect('/admin/book-fair/refunds?tab=items')
}
