import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { syncStreetsForCity, getCitiesMeta } from '@/lib/govData'

export const dynamic = 'force-dynamic'

// ניהול ידני של ערים במאגר — להשלמת יישובים שאינם מופיעים ב-data.gov.il
// (למשל יישובי יו"ש כמו עמנואל). ערים שנוספו ידנית נשמרות ולא נמחקות ברענון
// הלילי, שכן הסנכרון מבצע upsert בלבד.

// POST { name } — הוספת/עדכון עיר ידנית. מנסה גם למשוך רחובות (best-effort).
export async function POST(request: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  let body: { name?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const name = (body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'יש להזין שם עיר' }, { status: 400 })
  if (name.length > 80) return NextResponse.json({ error: 'שם ארוך מדי' }, { status: 400 })

  const { error } = await admin.from('gov_cities').upsert(
    { name, synced_at: new Date().toISOString() },
    { onConflict: 'name' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ניסיון למשוך רחובות לעיר (אם קיימת ב-data.gov.il תחת שם זה) — לא חוסם
  let streets = 0
  try { streets = await syncStreetsForCity(admin, name) } catch { /* לעיר אין רחובות במאגר — אפשר להזין ידנית בטופס */ }

  const meta = await getCitiesMeta(admin)
  return NextResponse.json({ ok: true, name, streets, count: meta.count })
}

// DELETE ?name= — הסרת עיר (והרחובות שלה) מהמאגר
export async function DELETE(request: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const name = (request.nextUrl.searchParams.get('name') ?? '').trim()
  if (!name) return NextResponse.json({ error: 'חסר שם עיר' }, { status: 400 })

  await admin.from('gov_streets').delete().eq('city', name)
  const { error } = await admin.from('gov_cities').delete().eq('name', name)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const meta = await getCitiesMeta(admin)
  return NextResponse.json({ ok: true, count: meta.count })
}
