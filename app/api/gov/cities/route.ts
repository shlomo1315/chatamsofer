import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

let cached: string[] | null = null
let cachedAt = 0
const TTL = 24 * 60 * 60 * 1000

export async function GET() {
  if (cached && Date.now() - cachedAt < TTL) {
    return NextResponse.json({ cities: cached })
  }
  try {
    const res = await fetch(
      'https://data.gov.il/api/3/action/datastore_search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_id: '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba',
          limit: 2000,
          fields: ['שם_ישוב'],
        }),
      }
    )
    const data = await res.json()
    const cities: string[] = (data?.result?.records ?? [])
      .map((r: Record<string, string>) => (r['שם_ישוב'] ?? '').trim())
      .filter(Boolean)
      .sort((a: string, b: string) => a.localeCompare(b, 'he'))
    cached = cities
    cachedAt = Date.now()
    return NextResponse.json({ cities })
  } catch {
    return NextResponse.json({ cities: cached ?? [] })
  }
}
