import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ענפי העץ לבחירה בדוח — "כל הצאצאים תחת אברהם סופר מדור 2".
//
// 🔴 שונה מסינון לפי מספר דור: זה מחזיר את כל מי שנמצא באותו דור בכל
// העץ, בעוד כאן מדובר בענף של אדם מסוים.
//
// ⚠️ מוחזרים רק הדורות הראשונים (2-5): 11,331 צמתים כרשימת בחירה הם
// בלתי שמישים, והשאלה המעשית היא תמיד על ראשי הענפים.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_GENERATION = 5

export async function GET() {
  if (!(await requirePermission('beneficiaries', 'view'))) {
    return forbidden('אין הרשאה לצפות בדוחות')
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ fetchAllRows — 11,331 צמתים בעץ, ותקרת 1,000 השקטה הייתה חותכת
  // את הרשימה בלי שום סימן.
  const { rows, error } = await fetchAllRows<{
    id: string; name: string; generation: number; parent_id: string | null
  }>((from, to) => db
    .from('lineage_nodes')
    .select('id, name, generation, parent_id')
    .lte('generation', MAX_GENERATION)
    .range(from, to))

  if (error) return NextResponse.json({ error }, { status: 500 })

  // ⚠️ ספירת המשפחות אינה מוחזרת כאן: היא דורשת מעבר על תת-העץ המלא
  // לכל צומת, והתוצאה הייתה שאילתה כבדה על כל טעינת מסך. המונה החי
  // בדוח עצמו נותן את המספר המדויק ברגע שבוחרים ענף.

  const byId = new Map(rows.map(n => [n.id, n]))
  const nodes = rows
    .filter(n => n.generation >= 2)   // דור 1 הוא החתם סופר עצמו — כל העץ
    .map(n => ({
      id: n.id,
      name: n.name,
      generation: n.generation,
      parentName: n.parent_id ? (byId.get(n.parent_id)?.name ?? null) : null,
    }))
    .sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, 'he'))

  return NextResponse.json({ nodes }, { headers: { 'Cache-Control': 'no-store' } })
}
