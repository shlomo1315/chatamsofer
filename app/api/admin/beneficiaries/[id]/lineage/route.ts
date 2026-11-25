import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { computeGenStatus, getLineagePath, buildMaternityGens } from '@/lib/maternityLineage'
import { getApprovedRefLookup } from '@/lib/lineageApprovedRef'

export const dynamic = 'force-dynamic'

// סדר הדורות הצבוע של צאצא — לחלונית הצאצא המהירה.
// ⚠️ אותו חישוב בדיוק כמו בחלון תיק הלידה (lib/maternityLineage), כולל סימונים
// ידניים. העריכה עצמה דרך LineageChainEditButton, בלי שינוי בלוגיקה שלו.
// 🔴 service client: ב-lineage_approved_ref ו-lineage_nodes יש RLS שמחזיר 0
// שורות בשקט למשתמש המחובר — וכל הדורות נצבעים אדום.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePermission('beneficiaries', 'view'))) return forbidden('אין הרשאה')
  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben, error } = await db
    .from('beneficiaries')
    .select('lineage_node_id, lineage_chain, lineage_manual, lineage_manual_marks')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'שגיאה בטעינה' }, { status: 500 })
  if (!ben) return NextResponse.json({ gens: [] })

  const row = ben as {
    lineage_node_id?: string | null
    lineage_chain?: unknown
    lineage_manual?: unknown
    lineage_manual_marks?: Record<string, 'red' | 'green'> | null
  }
  const typedChain = Array.isArray(row.lineage_chain)
    ? (row.lineage_chain as { generation: number; name: string; relation?: string | null }[])
    : []
  const lineageManual = Array.isArray(row.lineage_manual) ? (row.lineage_manual as string[]) : []
  const [lineagePath, genStatus, approvedRef] = await Promise.all([
    getLineagePath(row.lineage_node_id, typedChain),
    computeGenStatus(typedChain, row.lineage_node_id),
    getApprovedRefLookup(db),
  ])
  const marks = row.lineage_manual_marks ?? {}
  const gens = buildMaternityGens({ typedChain, lineagePath, lineageManual, genStatus, approvedRef })
    // סימון ידני גובר על הצבע המחושב — כמו ב-LineageChainChips
    .map(g => ({ ...g, color: marks[String(g.generation)] ?? g.color }))

  return NextResponse.json({ gens })
}
