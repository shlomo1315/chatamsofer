import { guardPage } from '@/lib/pageGuard'
import { getServiceClient } from '@/lib/apiAuth'
import { roleAllows } from '@/lib/permissions'
import { currentParasha, GILYONOT_FROM_EMAIL, GILYONOT_FROM_NAME } from '@/lib/gilyonot'
import PageHeader from '@/components/ui/PageHeader'
import type { UserPermissions } from '@/types'
import { getPullView, type NedarimPullView } from '@/lib/gilyonotNedarimPull'
import GilyonotClient, { type IssueView, type SubscriberView } from './GilyonotClient'
import type { DistributorApplicationView, DistributorEventView, DistributorMessageView, DistributorView, HilulaRequestView } from './Distributors'
import { DISTRIBUTOR_COLS, loadDistributorSettings } from '@/lib/gilyonotDistributorServer'
import { getDistNedarimView, REASON_LABELS, type ApplicationReason } from '@/lib/gilyonotDistributorNedarim'

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
      db.from('gilyonot_issues').select('id, title, parasha, subject, intro, body_html, design, file_name, file_size, file_path, status, delivery_mode, total_count, created_at, started_at, completed_at')
        .order('created_at', { ascending: false }).limit(500),
      db.from('gilyonot_issue_stats').select('*'),
    ])
    // הגדרות המשיכה מנדרים (בלי המפתח) — רק למי שרשאי לערוך
    if (can('edit')) nedarim = await getPullView(db)
    const byId = new Map((stats ?? []).map(s => [s.issue_id as string, s]))
    issues = (iss ?? []).map(i => {
      const s = byId.get(i.id)
      const { file_path, ...rest } = i
      return {
        ...rest,
        compressed: String(file_path).includes('/compressed.'),
        sent_count: s?.sent_count ?? 0, failed_count: s?.failed_count ?? 0, pending_count: s?.pending_count ?? 0,
        opened_count: s?.opened_count ?? 0, downloaded_count: s?.downloaded_count ?? 0,
        delivered_count: s?.delivered_count ?? 0, bounced_count: s?.bounced_count ?? 0, complained_count: s?.complained_count ?? 0,
        clicked_count: s?.clicked_count ?? 0, unsubscribed_count: s?.unsubscribed_count ?? 0,
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
      .order('city').order('route', { nullsFirst: false }).order('full_name').range(offset, offset + PAGE - 1)
    if (error) throw error
    rows.push(...((data ?? []) as unknown as DistributorView[]))
    if (!data || data.length < PAGE) break
  }
  const [{ data: ev }, { data: msgs }, settings, { data: hil }, { data: apps }, nedarim] = await Promise.all([
    db.from('gilyonot_distributor_events').select('id, distributor_id, kind, channel, quantity, details, status, created_at')
      .eq('status', 'open').order('created_at', { ascending: false }).limit(500),
    db.from('gilyonot_distributor_messages').select('id, subject, city, recipients, sent_count, failed_count, skipped_count, created_at')
      .order('created_at', { ascending: false }).limit(30),
    loadDistributorSettings(db),
    db.from('gilyonot_hilula_requests').select('id, distributor_id, full_name, phone, city, synagogue, guests, channel, priority, details, status, created_at')
      .order('priority', { ascending: false }).order('created_at').limit(2000),
    db.from('gilyonot_distributor_applications').select('id, full_name, phone, email, city, synagogue, address, quantity, notes, reason, conflict_id, created_at')
      .eq('status', 'pending').order('created_at', { ascending: false }).limit(500),
    getDistNedarimView(db),
  ])
  const names = new Map(rows.map(r => [r.id, r.full_name]))
  const events = (ev ?? []).map(e => ({ ...e, distributor_name: names.get(e.distributor_id) ?? '—' })) as DistributorEventView[]
  const hilula = ((hil ?? []) as unknown as HilulaRequestView[]).map(h => ({ ...h, full_name: h.full_name ?? (h.distributor_id ? names.get(h.distributor_id) ?? null : null) }))
  const applications = ((apps ?? []) as unknown as (Omit<DistributorApplicationView, 'reason_label' | 'conflict_name'> & { reason: ApplicationReason; conflict_id: string | null })[])
    .map(({ conflict_id, ...a }) => ({ ...a, reason_label: REASON_LABELS[a.reason] ?? a.reason, conflict_name: conflict_id ? names.get(conflict_id) ?? null : null }))
  return { rows, events, messages: (msgs ?? []) as DistributorMessageView[], settings, hilula, applications, nedarim }
}
