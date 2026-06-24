import { NextResponse } from 'next/server'
import { getAdminClient, getCities, fetchCitiesFromGov } from '@/lib/govData'

export const dynamic = 'force-dynamic'

// קוראים תמיד את הרשימה המעודכנת מ-gov_cities (שאילתה מהירה) — בלי מטמון בזיכרון
// שהחזיק רשימה ישנה ומנע מערים חדשות (כמו יישובי יו"ש) להופיע בטפסים.
export async function GET() {
  const admin = getAdminClient()
  if (admin) {
    try {
      const cities = await getCities(admin)
      return NextResponse.json({ cities }, { headers: { 'Cache-Control': 'no-store' } })
    } catch { /* נופלים ל-API ישיר */ }
  }

  try {
    return NextResponse.json({ cities: await fetchCitiesFromGov() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ cities: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
