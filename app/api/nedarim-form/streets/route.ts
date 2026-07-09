// טופס נדרים — רחובות של עיר (נתונים ציבוריים ממשרד הפנים). זהה ל-/api/gov/streets + CORS.
import { type NextRequest } from 'next/server'
import { getAdminClient, getStreets, fetchStreetsFromGov } from '@/lib/govData'
import { jsonCors, preflight } from '@/lib/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get('origin'))
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  const city = request.nextUrl.searchParams.get('city')?.trim()
  if (!city) return jsonCors({ streets: [] }, { status: 400 }, origin)

  const admin = getAdminClient()
  if (admin) {
    try {
      const streets = await getStreets(admin, city)
      return jsonCors({ streets }, { headers: { 'Cache-Control': 'no-store' } }, origin)
    } catch { /* נופלים ל-API ישיר */ }
  }

  try {
    const streets = await fetchStreetsFromGov(city)
    return jsonCors({ streets }, { headers: { 'Cache-Control': 'no-store' } }, origin)
  } catch {
    return jsonCors({ streets: [] }, { headers: { 'Cache-Control': 'no-store' } }, origin)
  }
}
