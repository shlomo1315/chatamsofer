import { guardPage } from '@/lib/pageGuard'
import { getServiceClient } from '@/lib/apiAuth'
import { roleAllows } from '@/lib/permissions'
import { loadKvitelRequests, parseKvitelFilters } from '@/lib/kvitelQuery'
import PageHeader from '@/components/ui/PageHeader'
import type { UserPermissions } from '@/types'
import { getKvitelPullView } from '@/lib/kvitelNedarimPull'
import MailClient from '@/app/admin/mail/MailClient'
import KvitelClient from './KvitelClient'
import KvitelTabs from './KvitelTabs'
import KvitelNedarim from './KvitelNedarim'
import { parseKvitelTab, type KvitelTabKey } from './kvitelTabs'

// מחלקת קוויטלאך — לשוניות (שורה בראש המסך): בקשות · מייל (תיבת k@ בלבד) · נדרים.
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
  const needRows = tab === 'requests'
  const { rows: loaded, error } = db && needRows ? await loadKvitelRequests(db, { ...filters, status: 'all' }) : { rows: [], error: db ? '' : 'השרת אינו מוגדר' }
  // אין מצב "דורש בדיקה": בקשה שנקלטה נחשבת "לא נשלח" (ממתין). לתצוגה בלבד, השרת לא משתנה.
  const rows = loaded.map(r => (r.status === 'review' ? { ...r, status: 'pending' as const } : r))
  const canEdit = staff.role === 'admin' || roleAllows(staff.role, staff.permissions as UserPermissions, 'kvitel', 'edit')
  const nedarimView = db && canEdit && tab === 'nedarim' ? await getKvitelPullView(db).catch(() => null) : null

  return (
    <div className="space-y-6">
      {tab !== 'requests' && <PageHeader title={tab === 'mail' ? 'קוויטלאך · מייל' : 'קוויטלאך · נדרים'} subtitle="שמות ובקשות לתפילה בציון, מכל הערוצים" />}
      {tab !== 'requests' && <KvitelTabs active={tab} />}
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      {tab === 'requests' && <KvitelClient allRows={rows} filters={filters} canEdit={canEdit} tabs={<KvitelTabs active={tab} />} />}
      {tab === 'mail' && <MailClient lockDepartment="kvitel" />}
      {tab === 'nedarim' && (nedarimView
        ? <KvitelNedarim view={nedarimView} isAdmin={staff.role === 'admin'} />
        : <p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-ink-faint">אין הרשאה לעריכה או שאין נתוני נדרים.</p>)}
    </div>
  )
}
