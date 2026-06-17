import { NextResponse, type NextRequest } from 'next/server'
import { getAdminClient, syncCities, syncStreetsForCity } from '@/lib/govData'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// רענון לילי (00:00) של מאגר הערים והרחובות מ-data.gov.il (משרד הפנים).
// מוגן בטוקן CRON_SECRET. מרענן את כל הערים, ואת הרחובות של ערים שכבר נשאלו.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const token = request.nextUrl.searchParams.get('token')
  if (secret && auth !== `Bearer ${secret}` && token !== secret) {
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

  // 2. רענון רחובות עבור ערים שכבר נטענו למאגר (אלו שבשימוש בפועל)
  try {
    const { data } = await admin.from('gov_streets').select('city')
    const cities = [...new Set((data ?? []).map(r => r.city))]
    let ok = 0
    for (const city of cities) {
      try { await syncStreetsForCity(admin, city); ok++ }
      catch (e) { result.errors.push(`streets/${city}: ${e instanceof Error ? e.message : 'error'}`) }
    }
    result.streetsCities = ok
  } catch (e) {
    result.errors.push(`streets-scan: ${e instanceof Error ? e.message : 'error'}`)
  }

  return NextResponse.json({ ok: true, ...result })
}
