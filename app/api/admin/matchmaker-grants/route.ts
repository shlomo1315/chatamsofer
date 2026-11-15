import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, getServiceClient, forbidden } from '@/lib/apiAuth'
import { computeCounters, filterClaims, filterFromParams, loadAdminClaims } from '@/lib/matchmaker/adminData'
import { loadSettings } from '@/lib/matchmaker/settings'

export const dynamic = 'force-dynamic'

// רשימת בקשות המלגה + מונים + הגדרות. מונים תמיד על הכול (לא על הסינון).
export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const all = await loadAdminClaims(db)
  const claims = filterClaims(all, filterFromParams(request.nextUrl.searchParams))
  const matchmakers = [...new Map(all.map(c => [c.matchmaker.id, c.matchmaker.name])).entries()].map(([id, name]) => ({ id, name }))
  return NextResponse.json({ claims, counters: computeCounters(all), settings: await loadSettings(db), matchmakers }, { headers: { 'Cache-Control': 'no-store' } })
}
