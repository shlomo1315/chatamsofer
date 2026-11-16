import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { loadAdminClaims, loadAdminMatchmakers } from '@/lib/matchmaker/adminData'
import {
  filterMatchmakers, matchmakerCounters, matchmakerFilterFromParams, matchmakerSortFromParams, sortMatchmakers, summarizeMatchmakers,
} from '@/lib/matchmaker/matchmakerList'

export const dynamic = 'force-dynamic'

// רשימת השדכנים לטבלה: סינון ומיון בשרת. מונים וחוגים תמיד על הכול (לא על הסינון).
// חשבון הבנק מוסווה; חשיפה מלאה רק בנתיב reveal (מנהל בלבד, עם יומן).
export async function GET(request: NextRequest) {
  if (!(await requirePermission('matchmaker_grants', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const claims = await loadAdminClaims(db)
  const all = summarizeMatchmakers(await loadAdminMatchmakers(db, claims), claims)
  const p = request.nextUrl.searchParams
  const rows = sortMatchmakers(filterMatchmakers(all, matchmakerFilterFromParams(p)), matchmakerSortFromParams(p))
  const circles = [...new Set(all.map(m => m.circle).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'he'))
  return NextResponse.json({ rows, counters: matchmakerCounters(all), circles }, { headers: { 'Cache-Control': 'no-store' } })
}
