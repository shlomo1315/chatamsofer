import { guardPage } from '@/lib/pageGuard'
import { getServiceClient } from '@/lib/apiAuth'
import { roleAllows } from '@/lib/permissions'
import { currentParasha, GILYONOT_FROM_EMAIL, GILYONOT_FROM_NAME } from '@/lib/gilyonot'
import PageHeader from '@/components/ui/PageHeader'
import type { UserPermissions } from '@/types'
import GilyonotClient, { type IssueView, type SubscriberView } from './GilyonotClient'

// מחלקת גיליונות החתם סופר — רשימת התפוצה, העלאת הגיליון השבועי, שליחה וארכיון.
// ליבה: lib/gilyonot.ts · שליחה: lib/gilyonotSender.ts · מיגרציה: 20261016_gilyonot.sql
//
// ⚠️ לקוח השירות רק אחרי guardPage - הטבלאות פתוחות ל-service_role בלבד.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'גיליונות החתם סופר' }

const PAGE = 1000

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await guardPage('gilyonot')
  const tab = (await searchParams).tab === 'issues' ? 'issues' : 'subscribers'
  const perms = staff.permissions as UserPermissions
  const can = (a: 'add' | 'edit' | 'delete') => staff.role === 'admin' || roleAllows(staff.role, perms, 'gilyonot', a)

  const db = getServiceClient()
  let error: string | null = db ? null : 'השרת אינו מוגדר'
  const subscribers: SubscriberView[] = []
  let issues: IssueView[] = []

  if (db) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error: e } = await db.from('gilyonot_subscribers')
        .select('id, email, full_name, source, status, created_at, unsubscribed_at')
        .order('created_at', { ascending: false }).range(offset, offset + PAGE - 1)
      if (e) { error = 'טעינת רשימת התפוצה נכשלה. ייתכן שהמיגרציה 20261016_gilyonot.sql עוד לא הורצה.'; break }
      subscribers.push(...((data ?? []) as SubscriberView[]))
      if (!data || data.length < PAGE) break
    }
    const [{ data: iss }, { data: stats }] = await Promise.all([
      db.from('gilyonot_issues').select('id, title, parasha, subject, intro, file_name, file_size, status, total_count, created_at, started_at, completed_at')
        .order('created_at', { ascending: false }).limit(500),
      db.from('gilyonot_issue_stats').select('*'),
    ])
    const byId = new Map((stats ?? []).map(s => [s.issue_id as string, s]))
    issues = (iss ?? []).map(i => {
      const s = byId.get(i.id)
      return {
        ...i,
        sent_count: s?.sent_count ?? 0, failed_count: s?.failed_count ?? 0, pending_count: s?.pending_count ?? 0,
        opened_count: s?.opened_count ?? 0, downloaded_count: s?.downloaded_count ?? 0,
      } as IssueView
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="גיליונות החתם סופר" subtitle={`רשימת התפוצה והגיליון השבועי · נשלח מ-${GILYONOT_FROM_NAME} <${GILYONOT_FROM_EMAIL}>`} />
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      <GilyonotClient
        tab={tab} subscribers={subscribers} issues={issues} defaultParasha={currentParasha()}
        canAdd={can('add')} canEdit={can('edit')} canDelete={can('delete')}
      />
    </div>
  )
}
