import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const cache = new Map<string, { streets: string[]; at: number }>()
const TTL = 60 * 60 * 1000

async function fetchStreets(body: object): Promise<Record<string, string>[]> {
  const res = await fetch('https://data.gov.il/api/3/action/datastore_search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data?.result?.records ?? []
}

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get('city')?.trim()
  if (!city) return NextResponse.json({ streets: [] }, { status: 400 })

  const hit = cache.get(city)
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json({ streets: hit.streets })
  }

  try {
    const BASE = {
      resource_id: 'a7296d1a-f8c9-4b70-96c2-6ebb4352f8e3',
      limit: 5000,
      fields: ['שם_רחוב', 'שם_ישוב'],
    }

    // 1st attempt: exact match via filters
    let records = await fetchStreets({ ...BASE, filters: { 'שם_ישוב': city } })

    // 2nd attempt: text search via q if exact match returned nothing
    if (records.length === 0) {
      const qRecords = await fetchStreets({ ...BASE, q: { 'שם_ישוב': city } })
      // prefer records that exactly match the city name
      const exact = qRecords.filter(r => (r['שם_ישוב'] ?? '').trim() === city)
      records = exact.length > 0 ? exact : qRecords
    }

    const raw = records.map(r => (r['שם_רחוב'] ?? '').trim()).filter(Boolean)
    const streets = [...new Set(raw)].sort((a, b) => a.localeCompare(b, 'he'))
    cache.set(city, { streets, at: Date.now() })
    return NextResponse.json({ streets })
  } catch {
    const fallback = cache.get(city)?.streets ?? []
    return NextResponse.json({ streets: fallback })
  }
}
