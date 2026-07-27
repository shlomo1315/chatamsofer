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

  // atGeneration — כשעורכים דור *מסוים* בשרשרת (בורר בצ'יפים): מחליפים רק את
  // הדורות עד הדור הזה (1..N) ושומרים את הדורות שמתחת (N+1+). כשלא מועבר
  // (בורר leaf מלא) — מחליפים את כל השרשרת מהצומת עד השורש (התנהגות מקורית).
  let body: { beneficiaryId?: string; nodeId?: string; atGeneration?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { beneficiaryId, nodeId, atGeneration } = body
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה נרשם' }, { status: 400 })
  if (!nodeId) return NextResponse.json({ error: 'חסר מזהה צומת' }, { status: 400 })

  // כל צמתי העץ — לבניית השרשרת מהצומת הנבחר עד השורש
  const { data: allNodes, error: nErr } = await db
    .from('lineage_nodes')
    .select('id, name, parent_id, generation, relation')
  if (nErr) return NextResponse.json({ error: 'טעינת עץ הדורות נכשלה' }, { status: 500 })

  type Node = { id: string; name: string; parent_id: string | null; generation: number; relation: string | null }
  type ChainEntry = { generation: number; name: string; relation: string | null }
  const map = new Map<string, Node>((allNodes ?? []).map(n => [n.id, n as Node]))
  const chosen = map.get(nodeId)
  if (!chosen) return NextResponse.json({ error: 'הצומת שנבחר אינו קיים בעץ' }, { status: 404 })

  // walk-up מהצומת שנבחר עד השורש — הדורות 1..(הדור של הצומת), עם הגנה מפני מעגל
  const upChain: ChainEntry[] = []
  const seen = new Set<string>()
  let cur: Node | undefined = chosen
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    upChain.unshift({ generation: cur.generation, name: cur.name, relation: cur.relation })
    cur = cur.parent_id ? map.get(cur.parent_id) : undefined
  }

  let chain: ChainEntry[] = upChain
  // עריכת דור מסוים: שומרים את הדורות שמתחת לצומת שנבחר (generation גדול משלו).
  // כך בחירת צומת חדש לדור 5 לא מוחקת את דורות 6+ (הדורות החדשים).
  if (typeof atGeneration === 'number') {
    const { data: ben } = await db
      .from('beneficiaries').select('lineage_chain').eq('id', String(beneficiaryId)).maybeSingle()
    const existing: ChainEntry[] = Array.isArray(ben?.lineage_chain) ? (ben!.lineage_chain as ChainEntry[]) : []
    const below = existing.filter(e => e && typeof e.generation === 'number' && e.generation > chosen.generation)
    // ממזגים: השרשרת החדשה עד הצומת + הדורות הישנים שמתחתיו, ממוין לפי דור
    chain = [...upChain, ...below].sort((a, b) => a.generation - b.generation)
  }

  // lineage_node_id: אם נשמרו דורות מתחת (הצומת אינו העלה) — משאירים את הקיים,
  // כי ה-leaf האמיתי עמוק יותר. אחרת הצומת שנבחר הוא העלה.
  const hasBelow = chain.some(e => e.generation > chosen.generation)
  const update: Record<string, unknown> = { lineage_chain: chain }
  if (!hasBelow) update.lineage_node_id = nodeId

  const { error: uErr } = await db
    .from('beneficiaries')
    .update(update)
    .eq('id', String(beneficiaryId))
  if (uErr) return NextResponse.json({ error: 'עדכון השיוך נכשל' }, { status: 500 })

  return NextResponse.json({ ok: true, chain })
}
