import { requirePermission } from '@/lib/apiAuth'
import { redirect } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import PhoneMessages from './PhoneMessages'

// נוסחי השלוחה הטלפונית של היריד — טקסט, קול והקלטות.
//
// 🔴 כאן ולא ב-/admin/phone: יריד הספרים הוא מחלקה עצמאית, וכל
// הניהול שלו יושב תחת /admin/book-fair. מסך מערכת הטלפון מרכז את
// השלוחות של שאר המחלקות בלבד.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'השלוחה הטלפונית — יריד הספרים' }

export default async function BookFairPhonePage() {
  const staff = await requirePermission('book_fair', 'view')
  if (!staff) redirect('/admin')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="השלוחה הטלפונית"
        subtitle="כל מה שנשמע בטלפון — טקסט, קול טבעי והקלטות"
      />
      <PhoneMessages />
    </div>
  )
}
