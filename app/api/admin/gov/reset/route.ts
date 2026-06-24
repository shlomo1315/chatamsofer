import { NextResponse } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { syncCities, syncAllStreets } from '@/lib/govData'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// איפוס מלא: מוחק את כל הערים והרחובות המקומיים ומסנכרן מחדש ישירות ממשרד הפנים
// (data.gov.il) — רק מה שמשויך לכל עיר לפי המקור, בלי שום תוספת מקומית.
export async function POST() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  try {
    // מחיקת הכל (filter שמתאים לכל השורות)
    await admin.from('gov_streets').delete().not('city', 'is', null)
    await admin.from('gov_cities').delete().not('name', 'is', null)

    // סנכרון מחדש ממשרד הפנים
    const cities = await syncCities(admin)
    const streets = await syncAllStreets(admin)

    return NextResponse.json({
      ok: true,
      cities,                    // כמה ערים נמשכו ממשרד הפנים
      streetsCities: streets.cities, // כמה ערים קיבלו רחובות
      streets: streets.streets,  // סך הרחובות שנכתבו
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'האיפוס נכשל' }, { status: 502 })
  }
}
