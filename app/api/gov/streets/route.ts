import { NextResponse, type NextRequest } from 'next/server'
import { getAdminClient, getStreets, fetchStreetsFromGov } from '@/lib/govData'

export const dynamic = 'force-dynamic'

// L1 cache בזיכרון מעל המאגר ב-Supabase מעל data.gov.il.
const mem = new Map<string, { streets: string[]; at: number }>()
const TTL = 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get('city')?.trim()
  if (!city) return NextResponse.json({ streets: [] }, { status: 400 })

  const hit = mem.get(city)
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ streets: hit.streets })

  const admin = getAdminClient()
  if (admin) {
    try {
      const streets = await getStreets(admin, city)
      if (streets.length > 0) mem.set(city, { streets, at: Date.now() })
      return NextResponse.json({ streets })
    } catch { /* נופלים ל-API ישיר */ }
  }

  try {
    const streets = await fetchStreetsFromGov(city)
    mem.set(city, { streets, at: Date.now() })
    return NextResponse.json({ streets })
  } catch {
    return NextResponse.json({ streets: mem.get(city)?.streets ?? [] })
  }
}
