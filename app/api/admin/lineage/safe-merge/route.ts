import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { mergeWithCascade, pickKeepId } from '@/lib/lineageMerge'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { findSafeMergeGroups, exactNameKey, type SafeNode } from '@/lib/safeMergeGroups'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// מיזוג בטוח: רק שם זהה *בדיוק*, תחת אותו אב, באותו דור.
//
// נפרד מהמיזוג הרגיל ולא מחליף אותו. הרגיל מזהה גם וריאציות כתיב ותארים, ולכן
// מחייב עין אנושית על כל אשכול (אשכול מקורב אחד כבר איחד שלושה אנשים שונים).
// כאן אין פרשנות — או שהמחרוזת זהה או שלא — ולכן אפשר להריץ על מאות קבוצות.
//
// ⚠️ בלי מפל, בשום כיוון:
//  • cascadeUp מזג אבות — החלטה שאינה נובעת מהכלל הבטוח.
//  • cascadeDown משתמש ב-autoMergeKey שמסיר תארים, כלומר מקורב יותר מהכלל כאן.
// המסלול הזה עושה דבר אחד: מקפל כל קבוצה זהה לצומת אחד. שום דבר מעבר.
//
// GET  — תצוגה מקדימה: הקבוצות, כמה צמתים ייעלמו, וכמה ילדים/משפחות יזוזו.
// POST — מבצע. batchId אחד לכל ההרצה, כך שביטול אחד מחזיר את הכל.
// ─────────────────────────────────────────────────────────────────────────────

type Row = SafeNode & { id_number?: string | null }

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function loadTree(admin: NonNullable<ReturnType<typeof getAdminClient>>) {
  const nodes = await fetchAllRows<Row>((from, to) =>
    admin.from('lineage_nodes').select('id, name, parent_id, generation, status').range(from, to))
  if (nodes.error) return { error: nodes.error, groups: [], childCount: new Map<string, number>(), nameById: new Map<string, string>(), benCount: new Map<string, number>() }

  const childCount = new Map<string, number>()
  for (const n of nodes.rows) {
    if (n.parent_id) childCount.set(n.parent_id, (childCount.get(n.parent_id) ?? 0) + 1)
  }
  const nameById = new Map(nodes.rows.map(n => [n.id, n.name]))

  const bens = await fetchAllRows<{ lineage_node_id: string | null }>((from, to) =>
    admin.from('beneficiaries').select('lineage_node_id').not('lineage_node_id', 'is', null).range(from, to))
  const benCount = new Map<string, number>()
  for (const b of bens.rows) {
    if (b.lineage_node_id) benCount.set(b.lineage_node_id, (benCount.get(b.lineage_node_id) ?? 0) + 1)
  }

  return { error: null, groups: findSafeMergeGroups(nodes.rows), childCount, nameById, benCount }
}

export async function GET() {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const { error, groups, childCount, nameById, benCount } = await loadTree(admin)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const sum = (ids: string[], m: Map<string, number>) => ids.reduce((t, id) => t + (m.get(id) ?? 0), 0)

  return NextResponse.json({
    stats: {
      groups: groups.length,
      nodesInGroups: groups.reduce((t, g) => t + g.length, 0),
      nodesRemoved: groups.reduce((t, g) => t + g.length - 1, 0),
      childrenMoved: groups.reduce((t, g) => t + sum(g.map(x => x.id), childCount), 0),
      familiesMoved: groups.reduce((t, g) => t + sum(g.map(x => x.id), benCount), 0),
    },
    groups: groups.slice(0, 400).map(g => ({
      name: exactNameKey(g[0].name),
      generation: g[0].generation,
      parentName: g[0].parent_id ? (nameById.get(g[0].parent_id) ?? '—') : 'שורש',
      copies: g.length,
      children: sum(g.map(x => x.id), childCount),
      families: sum(g.map(x => x.id), benCount),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST() {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const { error, groups, childCount } = await loadTree(admin)
  if (error) return NextResponse.json({ error }, { status: 500 })
  if (!groups.length) return NextResponse.json({ merged: 0, removed: 0, summary: 'לא נמצאו קבוצות בטוחות למיזוג.' })

  // ⚠️ batchId אחד לכל ההרצה: מיזוג של מאות קבוצות הוא פעולה אחת מבחינת
  // המשתמש, וביטול צריך להחזיר את כולה ולא קבוצה בודדת.
  const batchId = randomUUID()
  let merged = 0, removed = 0, children = 0, families = 0
  const failures: { name: string; reason: string }[] = []

  // ⚠️ סדרתי: כל מיזוג משנה את העץ (הורות של ילדים מוסבת), ושתי הרצות מקבילות
  // על אותו אב היו קוראות מצב מיושן.
  for (const group of groups) {
    const keepId = pickKeepId(
      group.map(g => ({ id: g.id, name: g.name, parent_id: g.parent_id, generation: g.generation, status: g.status ?? null })),
      childCount,
    )
    const mergeIds = group.map(g => g.id).filter(id => id !== keepId)
    if (!mergeIds.length) continue
    try {
      const res = await mergeWithCascade(admin, {
        keepId, mergeIds, batchId,
        // כל השמות בקבוצה זהים — אין שם לבחור, וזו כל הסיבה שזה בטוח.
        names: {},
        userId: staff.userId,
        cascadeDown: false, cascadeUp: false, cascadeUpApprox: false,
      })
      merged++
      removed += mergeIds.length
      children += res.reassignedChildren ?? 0
      families += res.reassignedBeneficiaries ?? 0
    } catch (e) {
      failures.push({ name: exactNameKey(group[0].name), reason: e instanceof Error ? e.message : String(e) })
    }
  }

  invalidateLineageCache()

  await logActivity(admin, {
    userId: staff.userId,
    action: 'lineage_safe_merge_bulk',
    entityType: 'lineage_node',
    details: { batchId, groups: merged, removed, children, families, failed: failures.length },
  }).catch(() => {})

  console.log(`[safe-merge] ${merged} קבוצות · הוסרו ${removed} צמתים · ${children} ילדים · ${families} משפחות · כשלים ${failures.length}`)
  return NextResponse.json({
    merged, removed, children, families, batchId,
    failed: failures.length, failures: failures.slice(0, 20),
    summary: `מוזגו ${merged} קבוצות · הוסרו ${removed} עותקים כפולים` +
      (children ? ` · ${children} ילדים הועברו` : '') +
      (families ? ` · ${families} משפחות הועברו` : '') +
      (failures.length ? ` · ${failures.length} נכשלו` : ''),
  })
}
