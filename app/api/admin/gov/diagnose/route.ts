import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// כלי אבחון: רץ מהשרת (שמגיע ל-data.gov.il) ובודק באילו משאבים נמצא יישוב מסוים
// ומהם שמות העמודות — כדי לאתר בדיוק מאיפה למשוך את יישובי יו"ש (למשל עמנואל).
// שימוש: פתח בדפדפן (כמנהל מחובר): /api/admin/gov/diagnose?q=עמנואל

const GOV_URL = 'https://data.gov.il/api/3/action/datastore_search'
const GOV_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'he,en;q=0.8',
}

const RESOURCES: { id: string; label: string }[] = [
  { id: '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba', label: 'מרשם יישובים (CITIES_RESOURCE הנוכחי)' },
  { id: '55a24991-c3d3-4c5f-83bf-855db318d1b2', label: 'רשימת ישובים בישראל (SETTLEMENTS)' },
  { id: '8f714b6f-c35c-4b40-a0e7-547b675eee0e', label: 'רשימת ישובים — כותרות אנגלית' },
  { id: 'a7296d1a-f8c9-4b70-96c2-6ebb4352f8e3', label: 'רחובות בישראל (STREETS)' },
]

async function probe(resourceId: string, q: string) {
  try {
    const res = await fetch(GOV_URL, {
      method: 'POST',
      headers: GOV_HEADERS,
      body: JSON.stringify({ resource_id: resourceId, q, limit: 5 }),
    })
    if (!res.ok) return { ok: false, http: res.status }
    const data = await res.json()
    const records: Record<string, unknown>[] = data?.result?.records ?? []
    return {
      ok: true,
      total: data?.result?.total ?? null,
      fields: records[0] ? Object.keys(records[0]) : [],
      sample: records.slice(0, 3),
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function GET(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const q = (request.nextUrl.searchParams.get('q') ?? 'עמנואל').trim()
  const out: Record<string, unknown> = { q }
  for (const r of RESOURCES) {
    out[r.label] = await probe(r.id, q)
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
