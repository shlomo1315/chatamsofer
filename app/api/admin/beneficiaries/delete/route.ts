import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// מחיקת נתמך (משפחה) + סנכרון עם עץ הדורות: מוחק גם את צומת העץ המקושר,
// אך רק אם הוא "עלה" (אין לו צאצאים בעץ) — כדי לא ליתם ענפים שלמים.
export async function POST(request: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const { id } = await request.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // צומת העץ המקושר למשפחה
  const { data: ben } = await admin.from('beneficiaries').select('lineage_node_id').eq('id', id).maybeSingle()
  const nodeId = (ben as { lineage_node_id?: string | null } | null)?.lineage_node_id ?? null

  const { error } = await admin.from('beneficiaries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // מחיקת צומת העץ — רק אם אין לו צאצאים בעץ (עלה), כדי לא ליתם ענפים
  let treeRemoved = false
  if (nodeId) {
    const { count } = await admin.from('lineage_nodes').select('id', { count: 'exact', head: true }).eq('parent_id', nodeId)
    if ((count ?? 0) === 0) {
      const { error: delErr } = await admin.from('lineage_nodes').delete().eq('id', nodeId)
      if (!delErr) treeRemoved = true
    }
  }

  return NextResponse.json({ ok: true, treeRemoved })
}
