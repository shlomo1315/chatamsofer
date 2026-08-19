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
  importTargetEmail?: string | null
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

  // ספירת המיילים בפועל — מקור האמת (לא מונה שעלול להתיישן).
  //
  // ⚠️ הספירה היא פר-*תיבה* (gmail_account_id) ולא פר-מחלקה. קודם היא הייתה
  // לפי מחלקה בלבד, ולכן שתי תיבות של אותה מחלקה הציגו כל אחת את הסכום של
  // שתיהן — תיבה חדשה שזה עתה חוברה נראתה כאילו כבר נקלטו בה מאות מיילים,
  // בדיוק במסך שאליו מסתכלים כדי לוודא שהחיבור עבד.
  //
  // מיילים שנקלטו לפני מיגרציית gmail_account_id נשארים NULL, ולכן נספרים
  // עדיין לפי מחלקה (byDept) ומיוחסים רק לתיבות שאין להן ספירה משלהן.
  const { data: counts } = await db
    .from('inbound_emails')
    .select('department, beneficiary_id, gmail_account_id')
    .eq('source', 'legacy')

  const byDept: Record<string, { total: number; unmatched: number }> = {}
  const byAccount: Record<string, { total: number; unmatched: number }> = {}
  // מיילים ללא שיוך תיבה — הם ורק הם מזינים את הנפילה לפי מחלקה
  const legacyByDept: Record<string, { total: number; unmatched: number }> = {}
  for (const row of (counts ?? []) as { department?: string | null; beneficiary_id?: string | null; gmail_account_id?: string | null }[]) {
    const d = row.department ?? 'main'
    const unmatched = !row.beneficiary_id
    byDept[d] ??= { total: 0, unmatched: 0 }
    byDept[d].total += 1
    if (unmatched) byDept[d].unmatched += 1

    const acc = row.gmail_account_id ?? ''
    if (acc) {
      byAccount[acc] ??= { total: 0, unmatched: 0 }
      byAccount[acc].total += 1
      if (unmatched) byAccount[acc].unmatched += 1
    } else {
      legacyByDept[d] ??= { total: 0, unmatched: 0 }
      legacyByDept[d].total += 1
      if (unmatched) legacyByDept[d].unmatched += 1
    }
  }

  // זמן הסנכרון האחרון בפועל לכל תיבה — מתוך היסטוריית ההרצות (gmail_sync_runs),
  // מקור אמת אמין יותר מ-last_sync_at (שלעיתים נשאר ריק). לוקחים את ה-finished_at
  // האחרון פר-account_id.
  const lastRunByAccount: Record<string, string> = {}
  {
    const { data: allRuns } = await db
      .from('gmail_sync_runs')
      .select('account_id, finished_at')
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(200)
    for (const r of (allRuns ?? []) as { account_id?: string | null; finished_at?: string }[]) {
      const aid = r.account_id ?? ''
      if (aid && r.finished_at && !lastRunByAccount[aid]) lastRunByAccount[aid] = r.finished_at
    }
  }

  // ── תיבות מטבלת gmail_accounts (ריבוי תיבות) ──
  const { data: accounts, error: accErr } = await db
    .from('gmail_accounts')
    .select('id, email, label, department, is_active, last_sync_at, total_synced, last_sync_count, last_error, import_target_email')
    .order('created_at')

  // תיבות שכבר יש להן מיילים משויכים — כדי לא לייחס להן גם את השורות הישנות
  // (ללא gmail_account_id) של אותה מחלקה, מה שהיה סופר פעמיים.
  const deptHasOwnedAccount = new Set(
    (accounts ?? [])
      .filter(a => byAccount[String((a as Record<string, unknown>).id)])
      .map(a => String((a as Record<string, unknown>).department ?? 'main')),
  )

  if (!accErr) {
    for (const a of (accounts ?? []) as Record<string, unknown>[]) {
      const dept = String(a.department ?? 'main')
      const own = byAccount[String(a.id)]
      // ספירה משלה כשקיימת; אחרת — הירושה הישנה של המחלקה, ורק אם אין תיבה
      // אחרת באותה מחלקה שכבר תופסת אותה.
      const stats = own
        ?? (deptHasOwnedAccount.has(dept) ? { total: 0, unmatched: 0 } : (legacyByDept[dept] ?? { total: 0, unmatched: 0 }))
      mailboxes.push({
        id: String(a.id),
        email: String(a.email ?? ''),
        label: String(a.label ?? a.email ?? ''),
        department: dept,
        departmentLabel: deptLabel(dept),
        connected: Boolean(a.is_active),
        // עדיפות לזמן מהיסטוריית ההרצות; נפילה ל-last_sync_at
        lastSyncAt: lastRunByAccount[String(a.id)] ?? (a.last_sync_at as string) ?? null,
        totalSynced: stats.total,
        lastSyncCount: Number(a.last_sync_count ?? 0),
        unmatched: stats.unmatched,
        lastError: (a.last_error as string) ?? null,
        importTargetEmail: (a.import_target_email as string) ?? null,
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
    // רק מיילים שאינם משויכים לתיבה רשומה (legacyByDept) — אחרת מיילים שכבר
    // נספרו לתיבה שלהם היו נספרים כאן שוב.
    const listed = new Set(mailboxes.map(m => m.department))
    const orphans = Object.keys(legacyByDept).filter(d => !listed.has(d))
    const orphanTotal = orphans.reduce((s, d) => s + legacyByDept[d].total, 0)
    const orphanUnmatched = orphans.reduce((s, d) => s + legacyByDept[d].unmatched, 0)

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
