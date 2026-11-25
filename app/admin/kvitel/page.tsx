import { guardPage } from '@/lib/pageGuard'
import { getServiceClient } from '@/lib/apiAuth'
import { roleAllows } from '@/lib/permissions'
import { parseKvitelFilters } from '@/lib/kvitelQuery'
import PageHeader from '@/components/ui/PageHeader'
import type { UserPermissions } from '@/types'
import { getKvitelPullView } from '@/lib/kvitelNedarimPull'
import MailClient from '@/app/admin/mail/MailClient'
import KvitelRequests from './KvitelRequests'
import KvitelTabs from './KvitelTabs'
import KvitelNedarim from './KvitelNedarim'
import KvitelMailSync from './KvitelMailSync'
import { parseKvitelTab, type KvitelTabKey } from './kvitelTabs'

// מחלקת קוויטלאך — לשוניות (שורה בראש המסך): בקשות · מייל (תיבת k@ בלבד) · נדרים.
// הליבה: lib/kvitel.ts · סינון: lib/kvitelQuery.ts · מיגרציה: 20261014_kvitel.sql
//
// ⚠️ רשימת הבקשות לא נטענת בשרת: הטקסט החופשי שלהן, גלוי ב-HTML, גרם לנטפרי לחסום את הדף. היא מגיעה מעורבלת מ-/api/admin/kvitel/requests (lib/kvitelPayload).
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
  const canEdit = staff.role === 'admin' || roleAllows(staff.role, staff.permissions as UserPermissions, 'kvitel', 'edit')
  const nedarimView = db && canEdit && tab === 'nedarim' ? await getKvitelPullView(db).catch(() => null) : null

  return (
    <div className="space-y-6">
      {tab !== 'requests' && <PageHeader title={tab === 'mail' ? 'קוויטלאך · מייל' : 'קוויטלאך · נדרים'} subtitle="שמות ובקשות לתפילה בציון, מכל הערוצים" />}
      {tab !== 'requests' && <KvitelTabs active={tab} />}
      {!db && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">השרת אינו מוגדר</p>}

      {tab === 'requests' && <KvitelRequests filters={filters} canEdit={canEdit} tabs={<KvitelTabs active={tab} />} />}
      {tab === 'mail' && canEdit && <KvitelMailSync />}
      {tab === 'mail' && <MailClient lockDepartment="kvitel" />}
      {tab === 'nedarim' && (nedarimView
        ? <KvitelNedarim view={nedarimView} isAdmin={staff.role === 'admin'} />
        : <p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-ink-faint">אין הרשאה לעריכה או שאין נתוני נדרים.</p>)}
    </div>
  )
}
