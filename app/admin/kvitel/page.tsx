import Link from 'next/link'
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
import { KVITEL_TABS, parseKvitelTab, type KvitelTabKey } from './kvitelTabs'

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
      <nav aria-label="לשוניות קוויטלאך" className="flex flex-wrap gap-1 border-b border-line">
        {KVITEL_TABS.map(t => (
          <Link key={t.key} href={t.key === 'overview' ? '/admin/kvitel' : `/admin/kvitel?tab=${t.key}`} aria-current={tab === t.key ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t.key ? 'border-navy text-navy' : 'border-transparent text-ink-soft hover:text-navy'}`}>
            {t.label}
          </Link>
        ))}
      </nav>
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      {tab === 'overview' && (
        <section aria-label="סקירה" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'דורש בדיקה', n: counts.review, href: '/admin/kvitel?tab=requests&status=review', hot: counts.review > 0 },
              { label: 'ממתין לשליחה', n: counts.pending, href: '/admin/kvitel?tab=requests&status=pending', hot: false },
              { label: 'נשלח לציון', n: counts.done, href: '/admin/kvitel?tab=requests&status=done', hot: false },
              { label: 'מיילים שלא נקראו', n: unreadMail, href: '/admin/kvitel?tab=mail', hot: unreadMail > 0 },
            ].map(c => (
              <Link key={c.label} href={c.href} className={`rounded-xl border px-4 py-4 ${c.hot ? 'border-[#C0912F] bg-[#F3E9CF]' : 'border-line bg-white hover:bg-sand'}`}>
                <div className="text-[13px] text-ink-soft">{c.label}</div>
                <div className="text-3xl font-bold tabular-nums text-navy">{c.n}</div>
              </Link>
            ))}
          </div>
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
  )
}
