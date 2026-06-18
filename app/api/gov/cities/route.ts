import { NextResponse, type NextRequest } from 'next/server'
import { getAdminClient, getCities, fetchCitiesFromGov } from '@/lib/govData'

export const dynamic = 'force-dynamic'

// L1 cache בזיכרון (מהיר), מעל המאגר ב-Supabase (עמיד), מעל data.gov.il (מקור).
let mem: string[] | null = null
let memAt = 0
const TTL = 60 * 60 * 1000

export async function GET(request: NextRequest) {
  // ?fresh=1 — דילוג על מטמון הזיכרון (לאחר רענון יזום ממשרד הפנים בהגדרות)
  const fresh = request.nextUrl.searchParams.get('fresh') === '1'
  if (!fresh && mem && Date.now() - memAt < TTL) return NextResponse.json({ cities: mem })

  const admin = getAdminClient()
  if (admin) {
    try {
      const cities = await getCities(admin)
      if (cities.length > 0) { mem = cities; memAt = Date.now() }
      return NextResponse.json({ cities })
    } catch { /* נופלים ל-API ישיר */ }
  }

  try {
    const cities = await fetchCitiesFromGov()
    mem = cities; memAt = Date.now()
    return NextResponse.json({ cities })
  } catch {
    return NextResponse.json({ cities: mem ?? [] })
  }
}
