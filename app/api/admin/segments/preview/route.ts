import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'
import { resolveSegment, type SegmentDef } from '@/lib/newsletter/segments'

// מונה קהל חי — כמה נמענים יוצאים מהמסננים שנבחרו.
// מוצג במסך בונה הקהל ומתעדכן בכל שינוי.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const ctx = await requirePermission('newsletter', 'view')
  if (ctx instanceof NextResponse) return ctx

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let def: SegmentDef
  try { def = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { recipients, stats } = await resolveSegment(db, def)

  return NextResponse.json({
    total: stats.total,
    noEmail: stats.noEmail,
    suppressed: stats.suppressed,
    // 10 הראשונים — כדי שהמשתמש יראה למי בדיוק הוא שולח
    sample: recipients.slice(0, 10).map(r => ({
      email: r.email,
      name: r.mergeData['שם_מלא'] || r.email,
      city: r.mergeData['עיר'] ?? '',
    })),
  })
}

// GET — ערכי המסננים הקיימים בפועל (ערים, שיוכים קהילתיים)
export async function GET() {
  const ctx = await requirePermission('newsletter', 'view')
  if (ctx instanceof NextResponse) return ctx

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data } = await db
    .from('beneficiaries')
    .select('city, community_affiliation')

  const cities = new Set<string>()
  const communities = new Set<string>()

  for (const r of (data ?? []) as { city?: string | null; community_affiliation?: string | null }[]) {
    if (r.city?.trim()) cities.add(r.city.trim())
    if (r.community_affiliation?.trim()) communities.add(r.community_affiliation.trim())
  }

  return NextResponse.json({
    cities: [...cities].sort((a, b) => a.localeCompare(b, 'he')),
    communities: [...communities].sort((a, b) => a.localeCompare(b, 'he')),
  })
}
