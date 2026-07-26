import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אבחון הפריקה האוטומטית (בתום 6 שבועות): מתי רצה לאחרונה, מי ממתין לפריקה
// הלילה, ומי כבר נפרק. קריאה-בלבד — לא מבצע פריקה. מנהל בלבד.
//
// הפריקה עצמה רצה כל לילה בחצות שעון ישראל (instrumentation.ts →
// runUnloadExpired), ופורקת כל תיק שעבר six_weeks_end וטרם נפרק.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const today = new Date().toISOString().slice(0, 10)

  // 1) מתי הפריקה רצה לאחרונה — 10 האירועים האחרונים מ-activity_log
  const { data: lastRuns } = await admin
    .from('activity_log')
    .select('created_at, entity_id, details')
    .eq('action', 'maternity_card_unloaded')
    .order('created_at', { ascending: false })
    .limit(10)

  // 2) תיקים שממתינים לפריקה *הלילה* — אותו סינון בדיוק כמו runUnloadExpired:
  //    loaded + יש card_tlush_id + six_weeks_end <= היום.
  const { data: dueNow } = await admin
    .from('maternity_aids')
    .select('id, six_weeks_end, card_tlush_id, card_balance, beneficiary:beneficiaries(family_name, spouse_name, full_name)')
    .eq('card_load_status', 'loaded')
    .not('card_tlush_id', 'is', null)
    .lte('six_weeks_end', today)
    .order('six_weeks_end', { ascending: true })

  // 3) תיקים טעונים שטרם הגיע מועד הפריקה שלהם — לצפי קדימה
  const { data: loadedFuture } = await admin
    .from('maternity_aids')
    .select('id, six_weeks_end, beneficiary:beneficiaries(family_name, spouse_name, full_name)')
    .eq('card_load_status', 'loaded')
    .not('card_tlush_id', 'is', null)
    .gt('six_weeks_end', today)
    .order('six_weeks_end', { ascending: true })
    .limit(20)

  // 4) כמה כבר נפרקו בסה"כ
  const { count: unloadedCount } = await admin
    .from('maternity_aids')
    .select('id', { count: 'exact', head: true })
    .eq('card_load_status', 'unloaded')

  const name = (b: unknown) => {
    const x = (Array.isArray(b) ? b[0] : b) as Record<string, string | null> | null
    return [x?.family_name, x?.spouse_name || x?.full_name].filter(Boolean).join(' ') || '—'
  }

  return NextResponse.json({
    today,
    // ⚠️ הפריקה רצה בחצות שעון ישראל (21:00 UTC בקיץ) דרך המתזמן הפנימי
    schedule: 'כל לילה בחצות שעון ישראל (instrumentation.ts)',
    lastUnloadRunAt: lastRuns?.[0]?.created_at ?? '(טרם רצה / אין רישום)',
    recentUnloads: (lastRuns ?? []).map(r => ({
      at: r.created_at,
      aidId: r.entity_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reason: (r.details as any)?.reason ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cardRemoved: (r.details as any)?.card_removed ?? null,
    })),
    dueTonightCount: (dueNow ?? []).length,
    dueTonight: (dueNow ?? []).map(a => ({
      name: name(a.beneficiary), sixWeeksEnd: a.six_weeks_end,
      tlushId: a.card_tlush_id, balance: a.card_balance,
    })),
    loadedNotYetDue: (loadedFuture ?? []).map(a => ({
      name: name(a.beneficiary), sixWeeksEnd: a.six_weeks_end,
    })),
    totalUnloadedEver: unloadedCount ?? 0,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
