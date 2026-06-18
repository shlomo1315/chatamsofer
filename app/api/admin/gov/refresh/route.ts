import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { syncCitiesDetailed, syncStreetsForCity, getCitiesMeta } from '@/lib/govData'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// מצב נוכחי של מאגר הערים (כמה ערים, מתי עודכן לאחרונה) — לתצוגה בהגדרות.
export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })
  try {
    const meta = await getCitiesMeta(admin)
    return NextResponse.json({ ok: true, ...meta })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 })
  }
}

// רענון יזום של רשימת הערים (ובמידת הצורך רחובות של עיר ספציפית) ישירות ממשרד הפנים.
// מאפשר לוודא שהמאגר מלא ומעודכן בלי להמתין לרענון הלילי.
export async function POST(request: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  let body: { city?: string } = {}
  try { body = await request.json() } catch { /* גוף ריק — רענון ערים בלבד */ }

  try {
    const detail = await syncCitiesDetailed(admin)
    let streetsForCity: number | undefined
    if (body.city?.trim()) streetsForCity = await syncStreetsForCity(admin, body.city.trim())
    const meta = await getCitiesMeta(admin)
    return NextResponse.json({
      ok: true,
      cities: meta.count,            // סך הערים במאגר (מצטבר)
      fetched: detail.total,         // כמה נמשכו כעת ממשרד הפנים
      registry: detail.registry,     // מתוכן ממרשם היישובים
      streets: detail.streets,       // מתוכן ממאגר הרחובות
      streetsMethod: detail.streetsMethod,
      streetsForCity,
      errors: detail.errors,
      lastSyncedAt: meta.lastSyncedAt,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'הרענון נכשל' }, { status: 502 })
  }
}
