import { NextResponse, type NextRequest } from 'next/server'
import { getAdminClient, syncCities, syncAllStreets } from '@/lib/govData'
import { verifyCronSecret } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// רענון לילי (00:00) של מאגר הערים והרחובות מ-data.gov.il (משרד הפנים).
// מוגן בטוקן CRON_SECRET (נכשל-סגור). מרענן את כל הערים, ואת הרחובות של ערים שכבר נשאלו.
export async function GET(request: NextRequest) {
  const okToken = verifyCronSecret(request) || request.nextUrl.searchParams.get('token') === process.env.CRON_SECRET
  if (!process.env.CRON_SECRET || !okToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'no admin client' }, { status: 500 })

  const result: { cities?: number; streetsCities?: number; errors: string[] } = { errors: [] }

  // 1. רענון רשימת הערים
  try {
    result.cities = await syncCities(admin)
  } catch (e) {
    result.errors.push(`cities: ${e instanceof Error ? e.message : 'error'}`)
  }

  // 2. מירור מלא של כל הרחובות לכל הערים (לשליפה מיידית בטפסים)
  try {
    const r = await syncAllStreets(admin)
    result.streetsCities = r.cities
  } catch (e) {
    result.errors.push(`streets: ${e instanceof Error ? e.message : 'error'}`)
  }

  return NextResponse.json({ ok: true, ...result })
}
