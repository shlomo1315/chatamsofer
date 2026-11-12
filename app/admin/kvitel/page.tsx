import { guardPage } from '@/lib/pageGuard'
import { getServiceClient } from '@/lib/apiAuth'
import { roleAllows } from '@/lib/permissions'
import { loadKvitelRequests, parseKvitelFilters } from '@/lib/kvitelQuery'
import { countByStatus } from '@/lib/kvitelView'
import PageHeader from '@/components/ui/PageHeader'
import type { UserPermissions } from '@/types'
import { getKvitelPullView } from '@/lib/kvitelNedarimPull'
import MailClient from '@/app/admin/mail/MailClient'
import KvitelClient from './KvitelClient'
import KvitelNedarim from './KvitelNedarim'
import KvitelStats from './KvitelStats'
import KvitelNav from './KvitelNav'
import { parseKvitelTab, type KvitelTabKey } from './kvitelTabs'

// מחלקת קוויטלאך — לשוניות: סקירה · בקשות · מייל (תיבת k@ בלבד) · נדרים.
// הליבה: lib/kvitel.ts · סינון: lib/kvitelQuery.ts · מיגרציה: 20261014_kvitel.sql
//
// ⚠️ לקוח השירות רק אחרי guardPage - הטבלאות פתוחות ל-service_role בלבד.
// ⚠️ לשונית המייל נעולה למחלקת kvitel: השרת מסנן לפי התיבה, לא הדפדפן.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'קוויטלאך' }

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await guardPage('kvitel')
  const sp = await searchParams
  const tab: KvitelTabKey = parseKvitelTab(sp.tab)
  const filters = parseKvitelFilters(sp)
  const db = getServiceClient()
  const needRows = tab === 'overview' || tab === 'requests'
  const { rows, error } = db && needRows ? await loadKvitelRequests(db, { ...filters, status: 'all' }) : { rows: [], error: db ? '' : 'השרת אינו מוגדר' }
  const canEdit = staff.role === 'admin' || roleAllows(staff.role, staff.permissions as UserPermissions, 'kvitel', 'edit')
  const nedarimView = db && canEdit && tab === 'nedarim' ? await getKvitelPullView(db).catch(() => null) : null

  let unreadMail = 0
  if (db && tab === 'overview') {
    const { count } = await db.from('inbound_emails').select('id', { count: 'exact', head: true }).eq('department', 'kvitel').eq('is_read', false)
    unreadMail = count ?? 0
  }
  const counts = countByStatus(rows)

  return (
    <div className="space-y-6">
      <PageHeader title="קוויטלאך" subtitle="שמות ובקשות לתפילה בציון — מכל הערוצים" />
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
      <KvitelNav tab={tab} />
      <div className="min-w-0 flex-1 space-y-5">
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      {tab === 'overview' && (
        <section aria-label="סקירה" className="space-y-4">
          <KvitelStats review={counts.review} pending={counts.pending} done={counts.done} unreadMail={unreadMail} />
          <p className="text-sm text-ink-soft">
            {counts.review + counts.pending > 0
              ? `יש ${counts.review} בקשות לבדיקה ו-${counts.pending} ממתינות לשליחה. ייצוא והדפסה בלשונית "בקשות".`
              : 'אין כרגע בקשות שדורשות טיפול.'}
          </p>
        </section>
      )}

      {tab === 'requests' && <KvitelClient allRows={rows} filters={filters} canEdit={canEdit} isAdmin={staff.role === 'admin'} />}
      {tab === 'mail' && <MailClient lockDepartment="kvitel" />}
      {tab === 'nedarim' && (nedarimView
        ? <KvitelNedarim view={nedarimView} isAdmin={staff.role === 'admin'} />
        : <p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-ink-faint">אין הרשאה לעריכה או שאין נתוני נדרים.</p>)}
      </div>
      </div>
    </div>
  )
}
