import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// שיוך ידני של צאצא לצומת בעץ הדורות.
//
// במבנה הקיים הצאצא מצביע לצומת עלה יחיד (lineage_node_id), וכל שרשרת הדורות
// נגזרת ממנו כלפי מעלה (parent_id). לכן "עריכת השיוך" = בחירת צומת העלה,
// וה-endpoint מחשב מחדש את lineage_chain מהצומת החדש עד השורש.
//
// אינו משנה status של צמתים ואינו נוגע ב-lineage_manual — פעולה ידנית של אדמין.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { beneficiaryId?: string; nodeId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { beneficiaryId, nodeId } = body
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה נרשם' }, { status: 400 })
  if (!nodeId) return NextResponse.json({ error: 'חסר מזהה צומת' }, { status: 400 })

  // כל צמתי העץ — לבניית השרשרת מהצומת הנבחר עד השורש
  const { data: allNodes, error: nErr } = await db
    .from('lineage_nodes')
    .select('id, name, parent_id, generation, relation')
  if (nErr) return NextResponse.json({ error: 'טעינת עץ הדורות נכשלה' }, { status: 500 })

  type Node = { id: string; name: string; parent_id: string | null; generation: number; relation: string | null }
  const map = new Map<string, Node>((allNodes ?? []).map(n => [n.id, n as Node]))
  if (!map.has(nodeId)) return NextResponse.json({ error: 'הצומת שנבחר אינו קיים בעץ' }, { status: 404 })

  // walk-up מהצומת עד השורש, עם הגנה מפני מעגל (Set)
  const chain: { generation: number; name: string; relation: string | null }[] = []
  const seen = new Set<string>()
  let cur: Node | undefined = map.get(nodeId)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    chain.unshift({ generation: cur.generation, name: cur.name, relation: cur.relation })
    cur = cur.parent_id ? map.get(cur.parent_id) : undefined
  }

  const { error: uErr } = await db
    .from('beneficiaries')
    .update({ lineage_node_id: nodeId, lineage_chain: chain })
    .eq('id', String(beneficiaryId))
  if (uErr) return NextResponse.json({ error: 'עדכון השיוך נכשל' }, { status: 500 })

  return NextResponse.json({ ok: true, chain })
}
