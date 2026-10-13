import { guardPage } from '@/lib/pageGuard'
import PageHeader from '@/components/ui/PageHeader'
import IssuesClient from './IssuesClient'

// תקלות משלוח ביריד — משלוח שלא הגיע, ספרים פגומים, ספר שגוי, חסר.
//
// ⚠️ הנתונים נטענים בלקוח: כוללים שמות וטלפונים של לקוחות.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'תקלות משלוח — יריד הספרים' }

export default async function BookFairIssuesPage({ searchParams }: {
  searchParams: Promise<{ order?: string; number?: string }>
}) {
  await guardPage('book_fair')
  const sp = await searchParams
  // ⚠️ ?order=&number= מגיעים מכרטיס ההזמנה: פותחים טופס עם ההזמנה ממולאת.
  const order = typeof sp.order === 'string' ? sp.order : ''
  const number = typeof sp.number === 'string' ? sp.number : ''
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="תקלות משלוח" subtitle="כל מה שהשתבש במשלוח ודורש טיפול — ומה כבר טופל" />
      <IssuesClient key={order} orderParam={order} numberParam={number} />
    </div>
  )
}
