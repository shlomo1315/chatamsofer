import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אבחון ביצועים: כמה שורות יש בכל טבלה ראשית. לפי זה נדע היכן pagination
// באמת ישפר (מאות+ שורות) והיכן זה מיותר (עשרות בודדות). קריאה-בלבד, מנהל בלבד.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const tables = [
    'beneficiaries', 'maternity_aids', 'loans', 'financial_aid_requests',
    'widow_requests', 'family_relations', 'mail_events', 'distributions',
  ]

  const counts: Record<string, number | string> = {}
  await Promise.all(tables.map(async t => {
    try {
      const { count, error } = await admin.from(t).select('id', { count: 'exact', head: true })
      counts[t] = error ? `שגיאה: ${error.message}` : (count ?? 0)
    } catch (e) {
      counts[t] = `שגיאה: ${e instanceof Error ? e.message : String(e)}`
    }
  }))

  return NextResponse.json({
    counts,
    note: 'מספר השורות בכל טבלה. pagination משתלם מ-~200 שורות ומעלה; מתחת לזה השיפור זניח.',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
