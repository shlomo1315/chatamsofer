import { guardAdminPage } from '@/lib/pageGuard'
import { getServiceClient } from '@/lib/apiAuth'
import RequestsClient, { type RequestView } from './RequestsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'בקשות תיקון מהארכיון' }

export default async function Page() {
  await guardAdminPage()
  const db = getServiceClient()
  const { data } = db
    ? await db.from('archive_requests')
        .select('id, created_at, body, area, sender_name, sender_contact, summary, status')
        .order('created_at', { ascending: false }).limit(200)
    : { data: [] }
  return <RequestsClient rows={(data ?? []) as RequestView[]} />
}
