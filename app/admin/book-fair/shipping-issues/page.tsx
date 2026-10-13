import { guardPage } from '@/lib/pageGuard'
import { parseFilters } from '@/lib/bookFairShippingIssues'
import ShippingIssuesClient from './ShippingIssuesClient'

// תקלות משלוח ביריד — משלוח שלא הגיע, ספרים פגומים, ספר לא נכון, חסר.
// אפיון: docs/book-fair-shipping-issues.md · מוקאפ שאושר 13.10.
//
// ⚠️ הנתונים נטענים בלקוח: כוללים שמות וטלפונים של לקוחות.
// ⚠️ המסננים נשמרים ב-URL — קישור שנשלח לחבר צוות פותח את אותה תצוגה.
// ?new=<order id> (מכרטיס ההזמנה) פותח "תקלה חדשה" עם ההזמנה ממולאת.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'תקלות משלוח — יריד הספרים' }

export default async function BookFairShippingIssuesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await guardPage('book_fair')
  const sp = await searchParams
  const get = (k: string) => (typeof sp[k] === 'string' ? sp[k] as string : null)
  return (
    <ShippingIssuesClient
      initialFilters={parseFilters(get)}
      newForOrder={get('new') ?? ''}
      openIssue={get('issue') ?? ''}
    />
  )
}
