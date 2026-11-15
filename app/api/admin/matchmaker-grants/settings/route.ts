import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, getServiceClient, forbidden } from '@/lib/apiAuth'
import { logAudit } from '@/lib/matchmaker/adminData'

export const dynamic = 'force-dynamic'

function num(v: unknown, max: number): number | null | undefined {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= max ? n : undefined
}

// סכומי מלגה והגבלת בקשות לשדכן. סכומים לא נקבעו מראש: המנהל מגדיר.
export async function PUT(request: NextRequest) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const regular = num(body.regular_amount, 1_000_000), enlarged = num(body.enlarged_amount, 1_000_000), max = num(body.max_claims_per_matchmaker, 10_000)
  if (regular === undefined || enlarged === undefined || max === undefined) return NextResponse.json({ error: 'ערך לא תקין' }, { status: 400 })
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const actor = staff.email ?? staff.userId
  await db.from('matchmaker_settings').update({ regular_amount: regular, enlarged_amount: enlarged, max_claims_per_matchmaker: max == null ? null : Math.floor(max), updated_at: new Date().toISOString(), updated_by: actor }).eq('id', 1)
  await logAudit(db, null, 'settings', `רגילה ${regular ?? '-'}, מוגדלת ${enlarged ?? '-'}, מקס׳ ${max ?? '-'}`, actor)
  return NextResponse.json({ ok: true })
}
