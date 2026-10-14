import { guardPage } from '@/lib/pageGuard'
import { getServiceClient } from '@/lib/apiAuth'
import { roleAllows } from '@/lib/permissions'
import { loadKvitelRequests, parseKvitelFilters } from '@/lib/kvitelQuery'
import PageHeader from '@/components/ui/PageHeader'
import type { UserPermissions } from '@/types'
import KvitelClient from './KvitelClient'

// מחלקת קוויטלאך — כל הבקשות מכל הערוצים, סינון, ייצוא ל-Word עם סימון "נשלח לציון" (ExportDialog).
// הליבה: lib/kvitel.ts · סינון: lib/kvitelQuery.ts · מיגרציה: 20261014_kvitel.sql
//
// ⚠️ לקוח השירות רק אחרי guardPage - הטבלאות פתוחות ל-service_role בלבד.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'קוויטלאך' }

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await guardPage('kvitel')
  const filters = parseKvitelFilters(await searchParams)
  const db = getServiceClient()
  const { rows, error } = db ? await loadKvitelRequests(db, filters) : { rows: [], error: 'השרת אינו מוגדר' }
  const canEdit = staff.role === 'admin' || roleAllows(staff.role, staff.permissions as UserPermissions, 'kvitel', 'edit')

  return (
    <div className="space-y-6">
      <PageHeader title="קוויטלאך" subtitle="שמות ובקשות לתפילה בציון — מכל הערוצים" />
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      <KvitelClient rows={rows} filters={filters} canEdit={canEdit} />
    </div>
  )
}
