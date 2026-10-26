import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { processDuplicateLoads } from '@/lib/duplicateLoadCancel'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// GET = דוח בלבד (יתרות, בלי לבטל). POST = ביטול הטעינה העודפת בשמונת התיקים. מנהל בלבד.
export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  return NextResponse.json({ rows: await processDuplicateLoads(admin, { execute: false }) })
}

export async function POST() {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const by = staff.userId
  return NextResponse.json({ rows: await processDuplicateLoads(admin, { execute: true, by }) })
}
