import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const cache = new Map<string, { streets: string[]; at: number }>()
const TTL = 60 * 60 * 1000 // 1 hour per city

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get('city')?.trim()
  if (!city) return NextResponse.json({ streets: [] }, { status: 400 })

  const hit = cache.get(city)
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json({ streets: hit.streets })
  }

  try {
    const filters = encodeURIComponent(JSON.stringify({ 'שם_ישוב': city }))
    const res = await fetch(
      `https://data.gov.il/api/3/action/datastore_search?resource_id=a7296d1a-f8c9-4b70-96c2-6ebb4352f8e3&filters=${filters}&limit=5000`,
      { signal: AbortSignal.timeout(10000) }
    )
    const data = await res.json()
    const streets: string[] = (data?.result?.records ?? [])
      .map((r: Record<string, string>) => (r['שם_רחוב'] ?? '').trim())
      .filter(Boolean)
      .sort((a: string, b: string) => a.localeCompare(b, 'he'))
    const unique = [...new Set(streets)]
    cache.set(city, { streets: unique, at: Date.now() })
    return NextResponse.json({ streets: unique })
  } catch {
    const fallback = cache.get(city)?.streets ?? []
    return NextResponse.json({ streets: fallback })
  }
}
