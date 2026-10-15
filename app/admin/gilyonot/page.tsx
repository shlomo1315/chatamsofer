import { guardPage } from '@/lib/pageGuard'
import { getServiceClient } from '@/lib/apiAuth'
import { roleAllows } from '@/lib/permissions'
import { currentParasha, GILYONOT_FROM_EMAIL, GILYONOT_FROM_NAME } from '@/lib/gilyonot'
import PageHeader from '@/components/ui/PageHeader'
import type { UserPermissions } from '@/types'
import { getPullView, type NedarimPullView } from '@/lib/gilyonotNedarimPull'
import GilyonotClient, { type IssueView, type SubscriberView } from './GilyonotClient'
import type { DistributorEventView, DistributorMessageView, DistributorView } from './Distributors'
import { DISTRIBUTOR_COLS, loadDistributorSettings } from '@/lib/gilyonotDistributorServer'

// מחלקת גיליונות החתם סופר — רשימת התפוצה, העלאת הגיליון השבועי, שליחה וארכיון.
// ליבה: lib/gilyonot.ts · שליחה: lib/gilyonotSender.ts · מיגרציה: 20261016_gilyonot.sql
//
// ⚠️ לקוח השירות רק אחרי guardPage - הטבלאות פתוחות ל-service_role בלבד.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'גיליונות החתם סופר' }

const PAGE = 1000

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await guardPage('gilyonot')
  const rawTab = (await searchParams).tab
  const tab = rawTab === 'issues' || rawTab === 'nedarim' || rawTab === 'distributors' ? rawTab : 'subscribers'
  const perms = staff.permissions as UserPermissions
  const can = (a: 'add' | 'edit' | 'delete') => staff.role === 'admin' || roleAllows(staff.role, perms, 'gilyonot', a)

  const db = getServiceClient()
  let error: string | null = db ? null : 'השרת אינו מוגדר'
  const subscribers: SubscriberView[] = []
  let issues: IssueView[] = []
  let nedarim: NedarimPullView | null = null
  let distributors: GilyonotDistributorsProps | null = null

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
    // הגדרות המשיכה מנדרים (בלי המפתח) — רק למי שרשאי לערוך
    if (can('edit')) nedarim = await getPullView(db)
    const byId = new Map((stats ?? []).map(s => [s.issue_id as string, s]))
    issues = (iss ?? []).map(i => {
      const s = byId.get(i.id)
      return {
        ...i,
        sent_count: s?.sent_count ?? 0, failed_count: s?.failed_count ?? 0, pending_count: s?.pending_count ?? 0,
        opened_count: s?.opened_count ?? 0, downloaded_count: s?.downloaded_count ?? 0,
      } as IssueView
    })

    // מפיצים: נטען רק בלשונית שלהם
    if (tab === 'distributors') distributors = await loadDistributors(db).catch(() => {
      error = 'טעינת המפיצים נכשלה. ייתכן שהמיגרציה 20261018_gilyonot_distributors.sql עוד לא הורצה.'
      return null
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="גיליונות החתם סופר" subtitle={`רשימת התפוצה והגיליון השבועי · נשלח מ-${GILYONOT_FROM_NAME} <${GILYONOT_FROM_EMAIL}>`} />
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      <GilyonotClient
        tab={tab} subscribers={subscribers} nedarim={nedarim} distributors={distributors} issues={issues} defaultParasha={currentParasha()}
        canAdd={can('add')} canEdit={can('edit')} canDelete={can('delete')}
      />
    </div>
  )
}

type GilyonotDistributorsProps = NonNullable<React.ComponentProps<typeof GilyonotClient>['distributors']>

async function loadDistributors(db: NonNullable<ReturnType<typeof getServiceClient>>): Promise<GilyonotDistributorsProps> {
  const rows: DistributorView[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.from('gilyonot_distributors').select(DISTRIBUTOR_COLS)
      .order('city').order('full_name').range(offset, offset + PAGE - 1)
    if (error) throw error
    rows.push(...((data ?? []) as unknown as DistributorView[]))
    if (!data || data.length < PAGE) break
  }
  const [{ data: ev }, { data: msgs }, settings] = await Promise.all([
    db.from('gilyonot_distributor_events').select('id, distributor_id, kind, channel, quantity, details, status, created_at')
      .eq('status', 'open').order('created_at', { ascending: false }).limit(500),
    db.from('gilyonot_distributor_messages').select('id, subject, city, recipients, sent_count, failed_count, skipped_count, created_at')
      .order('created_at', { ascending: false }).limit(30),
    loadDistributorSettings(db),
  ])
  const names = new Map(rows.map(r => [r.id, r.full_name]))
  const events = (ev ?? []).map(e => ({ ...e, distributor_name: names.get(e.distributor_id) ?? '—' })) as DistributorEventView[]
  return { rows, events, messages: (msgs ?? []) as DistributorMessageView[], settings }
}
