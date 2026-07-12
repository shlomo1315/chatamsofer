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

  // הרשימה המלאה — המשתמש רואה בדיוק למי הוא שולח, ויכול להסיר מי שלא רוצה.
  // תקרה של 5,000 כדי שהדפדפן לא ייחנק; מעבר לזה הרשימה גדולה מדי לעריכה ידנית.
  const MAX_LIST = 5000
  const manualEmails = new Set((def.manual ?? []).map(m => m.email.toLowerCase().trim()))

  return NextResponse.json({
    total: stats.total,
    noEmail: stats.noEmail,
    suppressed: stats.suppressed,
    excluded: stats.excluded,
    truncated: recipients.length > MAX_LIST,
    recipients: recipients.slice(0, MAX_LIST).map(r => ({
      email: r.email,
      name: r.mergeData['שם_מלא'] || '',
      city: r.mergeData['עיר'] ?? '',
      isManual: manualEmails.has(r.email),
    })),
  })
}

// GET — ערכי המסננים הקיימים בפועל.
// כל הערכים נגזרים מהנתונים האמיתיים ב-DB (select distinct), ולא מרשימה
// מקודדת בקוד — כדי שלא יוצגו אפשרויות שאין להן אף רשומה.
export async function GET() {
  const ctx = await requirePermission('newsletter', 'view')
  if (ctx instanceof NextResponse) return ctx

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data } = await db
    .from('beneficiaries')
    .select('city, community_affiliation, marital_status, eligibility_status')

  const cities = new Set<string>()
  const communities = new Set<string>()
  const maritalStatuses = new Set<string>()
  const eligibilityStatuses = new Set<string>()

  for (const r of (data ?? []) as {
    city?: string | null
    community_affiliation?: string | null
    marital_status?: string | null
    eligibility_status?: string | null
  }[]) {
    if (r.city?.trim()) cities.add(r.city.trim())
    if (r.community_affiliation?.trim()) communities.add(r.community_affiliation.trim())
    if (r.marital_status?.trim()) maritalStatuses.add(r.marital_status.trim())
    if (r.eligibility_status?.trim()) eligibilityStatuses.add(r.eligibility_status.trim())
  }

  // כל האפשרויות שהמערכת תומכת בהן (זהה ל-MARITAL_OPTIONS בטופס המוטב),
  // מאוחדות עם ערכים שכבר קיימים ב-DB — כך מוצגות כל האפשרויות גם אם
  // אין עדיין אף רשומה מסוג מסוים.
  const MARITAL_OPTIONS = ['נשואים', 'גרוש', 'גרושה', 'אלמן', 'אלמנה']
  for (const m of MARITAL_OPTIONS) maritalStatuses.add(m)

  const ELIGIBILITY_OPTIONS = ['pending', 'approved', 'rejected', 'review', 'docs_pending']
  for (const e of ELIGIBILITY_OPTIONS) eligibilityStatuses.add(e)

  return NextResponse.json({
    cities: [...cities].sort((a, b) => a.localeCompare(b, 'he')),
    communities: [...communities].sort((a, b) => a.localeCompare(b, 'he')),
    // סדר קבוע ועקבי (לא אלפביתי) — כמו בטופס
    maritalStatuses: MARITAL_OPTIONS.filter(m => maritalStatuses.has(m))
      .concat([...maritalStatuses].filter(m => !MARITAL_OPTIONS.includes(m))),
    eligibilityStatuses: ELIGIBILITY_OPTIONS.filter(e => eligibilityStatuses.has(e)),
  })
}
