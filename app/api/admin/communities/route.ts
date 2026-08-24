import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { suggestGroups, type CommunityCount } from '@/lib/communitySimilarity'

export const dynamic = 'force-dynamic'

// רשימת ערכי הקהילה במאגר + הצעות מיזוג.
//
// 🔒 מנהל בלבד: הרשימה חושפת את התפלגות הקהילות של כל המשפחות, והמיזוג
// שנגזר ממנה משנה אלפי רשומות.
//
// ⚠️ אין middleware — הנתיב מגן על עצמו.
export async function GET() {
  if (!(await requireAdmin())) return forbidden('מיזוג קהילות שמור למנהל המערכת')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ fetchAllRows ולא select רגיל: 7,108 משפחות, ותקרת 1,000 השקטה
  // הייתה מחזירה ספירות שגויות שנראות תקינות לחלוטין.
  const { rows, error } = await fetchAllRows<{ community_affiliation: string | null }>(
    (from, to) => db.from('beneficiaries').select('community_affiliation').range(from, to),
  )
  if (error) return NextResponse.json({ error }, { status: 500 })

  const counts = new Map<string, number>()
  for (const r of rows) {
    const name = (r.community_affiliation ?? '').trim()
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  const items: CommunityCount[] = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json(
    {
      items,
      groups: suggestGroups(items),
      // כמה משפחות בלי שיוך כלל — מוצג במסך כדי שהסכום יסתדר.
      withoutCommunity: rows.length - items.reduce((s, i) => s + i.count, 0),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
