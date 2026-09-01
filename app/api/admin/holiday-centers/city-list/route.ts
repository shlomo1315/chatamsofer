import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { citiesByNumber, cityMenuText } from '@/lib/holidayCityMenu'
import type { CenterRow } from '@/lib/holidayCenterPick'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// רשימת הערים כפי שהשלוחה מקריאה אותה — "לירושלים הקישו 1 לבני ברק הקישו 2…"
//
// 🔴 למה זה קיים: הודעת בחירת העיר היא דינמית ({list}), ולכן לא ניתן היה
// ליצור לה קול טבעי — היא נאמרה תמיד ב-TTS גולמי, בלי שליטה על הטון,
// הפסיקים וההקראה של המספרים. כאן המנהל מושך את הרשימה האמיתית לתוך
// שדה הטקסט, עורך אותה כרצונו, ומייצר ממנה הקלטה.
//
// ⚠️ 🔴 הסיכון שהנתיב הזה יוצר, ולמה מוחזר גם signature:
// הקלטה היא צילום מצב. אם ייפתח או ייסגר מוקד אחרי ההקלטה, השלוחה
// תמשיך לומר "לחיפה הקישו 8" בזמן שמקש 8 מוביל לעיר אחרת — כלומר
// תשלח משפחות למקום הלא נכון. החתימה מאפשרת לממשק להתריע בדיוק על כך.
//
// ⚠️ המספרים נגזרים מ-sort_order ולא מהמיקום ברשימה — ראו holidayCityMenu.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const distributionId = request.nextUrl.searchParams.get('distribution_id') ?? ''

  // ⚠️ בלי מזהה חלוקה מחזירים את כל המוקדים הפעילים: מסך ההגדרות אינו
  // יושב בתוך חלוקה מסוימת, והרשימה שם היא הרשימה הכללית.
  let centers: CenterRow[] = []
  if (distributionId) {
    const { data: open } = await db.from('holiday_center_openings')
      .select('center_id').eq('distribution_id', distributionId)
    const ids = (open ?? []).map((o: { center_id: string }) => o.center_id)
    if (ids.length) {
      const { data } = await db.from('holiday_centers')
        .select('id, city, name, region, sort_order').in('id', ids).eq('is_active', true)
      centers = (data ?? []) as CenterRow[]
    }
  } else {
    const { data } = await db.from('holiday_centers')
      .select('id, city, name, region, sort_order').eq('is_active', true)
    centers = (data ?? []) as CenterRow[]
  }

  const cities = citiesByNumber(centers)

  return NextResponse.json({
    text: cityMenuText(cities),
    cities: cities.map(c => ({ number: c.number, city: c.city, centers: c.centers.length })),
    // 🔴 החתימה — "מספר:עיר" מופרד בפסיקים. הממשק שומר אותה לצד ההקלטה,
    // ומשווה בכל טעינה כדי לזהות שהרשימה השתנתה מאז שהוקלטה.
    signature: cities.map(c => `${c.number}:${c.city}`).join(','),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
