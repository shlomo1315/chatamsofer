import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { getLegacyRefreshToken } from '@/lib/gmail'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

// דיווח מפולח על סנכרון תיבות המייל:
// לכל תיבה — לאיזו מחלקה היא משויכת, מתי סונכרנה לאחרונה, וכמה מיילים נקלטו.
export const dynamic = 'force-dynamic'

export interface MailboxStatus {
  id: string | null
  email: string | null
  label: string
  department: string
  departmentLabel: string
  connected: boolean
  lastSyncAt: string | null
  totalSynced: number
  lastSyncCount: number
  unmatched: number
  lastError: string | null
  isLegacyToken?: boolean
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function deptLabel(key: string): string {
  return DEPARTMENTS[key as DepartmentKey]?.label ?? key
}

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = admin()
  const mailboxes: MailboxStatus[] = []

  // ספירת המיילים בפועל, מפולחת לפי מחלקה — מקור האמת (לא מונה שעלול להתיישן)
  const { data: counts } = await db
    .from('inbound_emails')
    .select('department, beneficiary_id')
    .eq('source', 'legacy')

  const byDept: Record<string, { total: number; unmatched: number }> = {}
  for (const row of (counts ?? []) as { department?: string | null; beneficiary_id?: string | null }[]) {
    const d = row.department ?? 'main'
    byDept[d] ??= { total: 0, unmatched: 0 }
    byDept[d].total += 1
    if (!row.beneficiary_id) byDept[d].unmatched += 1
  }

  // ── תיבות מטבלת gmail_accounts (ריבוי תיבות) ──
  const { data: accounts, error: accErr } = await db
    .from('gmail_accounts')
    .select('id, email, label, department, is_active, last_sync_at, total_synced, last_sync_count, last_error')
    .order('created_at')

  if (!accErr) {
    for (const a of (accounts ?? []) as Record<string, unknown>[]) {
      const dept = String(a.department ?? 'main')
      const stats = byDept[dept] ?? { total: 0, unmatched: 0 }
      mailboxes.push({
        id: String(a.id),
        email: String(a.email ?? ''),
        label: String(a.label ?? a.email ?? ''),
        department: dept,
        departmentLabel: deptLabel(dept),
        connected: Boolean(a.is_active),
        lastSyncAt: (a.last_sync_at as string) ?? null,
        totalSynced: stats.total,
        lastSyncCount: Number(a.last_sync_count ?? 0),
        unmatched: stats.unmatched,
        lastError: (a.last_error as string) ?? null,
      })
    }
  }

  // ── התיבה הישנה (טוקן ב-app_settings) — תאימות לאחור ──
  const legacyToken = await getLegacyRefreshToken()
  if (legacyToken) {
    const { data: sync } = await db
      .from('app_settings')
      .select('value, updated_at')
      .eq('key', 'legacy_mail_last_sync')
      .maybeSingle()

    // מיילים שאין להם תיבה רשומה בטבלה — שויכו לפי כתובת ה-To
    const listed = new Set(mailboxes.map(m => m.department))
    const orphans = Object.keys(byDept).filter(d => !listed.has(d))
    const orphanTotal = orphans.reduce((s, d) => s + byDept[d].total, 0)
    const orphanUnmatched = orphans.reduce((s, d) => s + byDept[d].unmatched, 0)

    mailboxes.push({
      id: null,
      email: null,
      label: 'תיבת ארכיון (חיבור קיים)',
      department: orphans.length === 1 ? orphans[0] : 'main',
      departmentLabel: orphans.length === 1 ? deptLabel(orphans[0]) : (orphans.length ? 'מעורב' : 'משרד ראשי'),
      connected: true,
      lastSyncAt: sync?.updated_at ?? null,
      totalSynced: orphanTotal,
      lastSyncCount: 0,
      unmatched: orphanUnmatched,
      lastError: null,
      isLegacyToken: true,
    })
  }

  // ── היסטוריית סנכרונים ──
  const { data: runs } = await db
    .from('gmail_sync_runs')
    .select('id, account_id, started_at, finished_at, scanned, imported, matched, failed, error')
    .order('started_at', { ascending: false })
    .limit(10)

  const totalSynced = Object.values(byDept).reduce((s, v) => s + v.total, 0)
  const totalUnmatched = Object.values(byDept).reduce((s, v) => s + v.unmatched, 0)

  return NextResponse.json({
    mailboxes,
    runs: runs ?? [],
    byDepartment: byDept,
    totals: { synced: totalSynced, unmatched: totalUnmatched },
    // תאימות לאחור עם הרכיב הישן
    connected: mailboxes.some(m => m.connected),
    lastSync: mailboxes[0]?.lastSyncAt ?? null,
    unmatched: totalUnmatched,
  })
}
