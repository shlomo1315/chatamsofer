// טופס נדרים — רשימת ערים (נתונים ציבוריים ממשרד הפנים). זהה ל-/api/gov/cities + CORS.
import { type NextRequest } from 'next/server'
import { getAdminClient, getCities, fetchCitiesFromGov } from '@/lib/govData'
import { jsonCors, preflight } from '@/lib/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get('origin'))
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  const admin = getAdminClient()
  if (admin) {
    try {
      const cities = await getCities(admin)
      return jsonCors({ cities }, { headers: { 'Cache-Control': 'no-store' } }, origin)
    } catch { /* נופלים ל-API ישיר */ }
  }

  try {
    return jsonCors({ cities: await fetchCitiesFromGov() }, { headers: { 'Cache-Control': 'no-store' } }, origin)
  } catch {
    return jsonCors({ cities: [] }, { headers: { 'Cache-Control': 'no-store' } }, origin)
  }
}
