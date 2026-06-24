import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { fetchCitiesDetailed, getAllStreetsByCity } from '@/lib/govData'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

// כלי אבחון לסנכרון הערים. שימוש (כמנהל מחובר): /api/admin/gov/diagnose?q=עמנואל
// בודק: (1) האם היישוב קיים במאגרי data.gov.il ואיך שמו מאוחסן (ריפוד/רווחים),
// (2) האם לוגיקת הסנכרון בפועל מפיקה אותו, (3) האם הוא קיים בטבלה המקומית gov_cities.

const GOV_URL = 'https://data.gov.il/api/3/action/datastore_search'
const GOV_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'he,en;q=0.8',
}

const RESOURCES: { id: string; label: string }[] = [
  { id: '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba', label: 'מרשם יישובים' },
  { id: '55a24991-c3d3-4c5f-83bf-855db318d1b2', label: 'רשימת ישובים בישראל' },
  { id: 'a7296d1a-f8c9-4b70-96c2-6ebb4352f8e3', label: 'רחובות' },
]

async function probe(resourceId: string, q: string) {
  try {
    const res = await fetch(GOV_URL, { method: 'POST', headers: GOV_HEADERS, body: JSON.stringify({ resource_id: resourceId, q, limit: 3 }) })
    if (!res.ok) return { ok: false, http: res.status }
    const data = await res.json()
    const records: Record<string, unknown>[] = data?.result?.records ?? []
    // מציג את ערך שם_ישוב כפי שהוא (כדי לראות ריפוד/רווחים) ואת אורכו
    const names = records.map(r => {
      const v = (r['שם_ישוב'] ?? r['שם_יישוב'] ?? '') as string
      return { raw: v, len: v.length, trimmed: v.trim() }
    })
    return { ok: true, total: data?.result?.total ?? null, names }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function GET(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  // אימות רחובות לעיר: ?city=ירושלים — משווה כמה רחובות במקור מול כמה במאגר המקומי.
  // אופציונלי ?street=שמגר — בודק אם רחוב מסוים קיים במקור ובמאגר.
  const city = request.nextUrl.searchParams.get('city')?.trim()
  if (city) {
    const streetQ = request.nextUrl.searchParams.get('street')?.trim()
    const map = await getAllStreetsByCity(true)
    const fromSource = map.get(city) ?? []
    const admin = getServiceClient()
    let inTableCount = 0
    let inTableMatches: string[] = []
    if (admin) {
      const { count } = await admin.from('gov_streets').select('street', { count: 'exact', head: true }).eq('city', city)
      inTableCount = count ?? 0
      if (streetQ) {
        const { data } = await admin.from('gov_streets').select('street').eq('city', city).ilike('street', `%${streetQ}%`).limit(20)
        inTableMatches = (data ?? []).map(r => r.street as string)
      }
    }
    // בדיקת רחובות עבריים מוכרים — האם המקור מכיל אותם (לאבחון אם המשאב פגום)
    const known = ['שמגר', 'מאה שערים', 'יפו', 'הרצל', 'בר אילן', 'מלכי ישראל', 'בן יהודה', 'אגריפס', 'סורוצקין', 'מלכה']
    const knownCheck: Record<string, string[]> = {}
    for (const k of known) knownCheck[k] = fromSource.filter(s => s.includes(k)).slice(0, 5)

    const result: Record<string, unknown> = {
      city,
      sourceStreetCount: fromSource.length,
      inTableCount,
      match: fromSource.length === inTableCount,
      // דגימה פרוסה על כל הא״ב (התחלה/אמצע/סוף) — לא רק 15 הראשונים
      spreadSample: [0, 0.25, 0.5, 0.75, 0.95].map(p => fromSource[Math.floor(p * (fromSource.length - 1))]).filter(Boolean),
      knownHebrewStreets: knownCheck,
    }
    if (streetQ) {
      result.streetQuery = streetQ
      result.inSourceMatches = fromSource.filter(s => s.includes(streetQ))
      result.inTableMatches = inTableMatches
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  }

  const q = (request.nextUrl.searchParams.get('q') ?? 'עמנואל').trim()

  // 1) מציאת היישוב במאגרי המקור
  const sources: Record<string, unknown> = {}
  for (const r of RESOURCES) sources[r.label] = await probe(r.id, q)

  // 2) הרצת לוגיקת הסנכרון בפועל — האם q נכלל בתוצאה?
  let syncResult: Record<string, unknown>
  try {
    const detail = await fetchCitiesDetailed()
    const matches = detail.names.filter(n => n.includes(q))
    syncResult = {
      total: detail.total, registry: detail.registry, settlements: detail.settlements,
      streets: detail.streets, streetsMethod: detail.streetsMethod, errors: detail.errors,
      includesExact: detail.names.includes(q),
      matchesContaining: matches,
    }
  } catch (e) {
    syncResult = { error: e instanceof Error ? e.message : String(e) }
  }

  // 3) האם קיים בטבלה המקומית gov_cities
  let localTable: Record<string, unknown> = {}
  const admin = getServiceClient()
  if (admin) {
    const { count } = await admin.from('gov_cities').select('name', { count: 'exact', head: true })
    const { data: like } = await admin.from('gov_cities').select('name').ilike('name', `%${q}%`).limit(10)
    localTable = { totalCities: count ?? 0, matchesInTable: (like ?? []).map(r => ({ name: r.name, len: (r.name as string).length })) }
  }

  return NextResponse.json({ q, sources, syncResult, localTable }, { headers: { 'Cache-Control': 'no-store' } })
}
