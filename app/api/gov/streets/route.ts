import { NextResponse, type NextRequest } from 'next/server'
import { getAdminClient, getStreets, fetchStreetsFromGov } from '@/lib/govData'

export const dynamic = 'force-dynamic'

// קוראים תמיד את כל הרחובות מהמאגר המקומי (gov_streets) — בלי מטמון בזיכרון
// שהחזיק רשימה חלקית שנשלפה קודם. השליפה מהירה (אינדקס על city).
export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get('city')?.trim()
  if (!city) return NextResponse.json({ streets: [] }, { status: 400 })

  const admin = getAdminClient()
  if (admin) {
    try {
      const streets = await getStreets(admin, city)
      return NextResponse.json({ streets }, { headers: { 'Cache-Control': 'no-store' } })
    } catch { /* נופלים ל-API ישיר */ }
  }

  try {
    const streets = await fetchStreetsFromGov(city)
    return NextResponse.json({ streets }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ streets: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
