import { randomUUID } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { mergeWithCascade } from '@/lib/lineageMerge'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { findSiblingDuplicates, pairKey, type DupNode } from '@/lib/lineageDupGroups'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// סקירת כפילויות — קבוצה אחרי קבוצה (12.10).
//
// GET  → כל הקבוצות לפי הכלל האחד (lib/lineageDupGroups), עם פרטי כל צומת.
// POST { action:'merge', key, keepId, name }      → מיזוג הקבוצה לשורד, בשם שנבחר
// POST { action:'not_duplicate', key }            → הקבוצה לא תוצע שוב
//
// 🔴 הקבוצה מחושבת מחדש בשרת בכל פעולה — לא סומכים על מה שהמסך שלח. קבוצה
// שהשתנתה בינתיים (מישהו מיזג/הוסיף) נדחית, והמסך נטען מחדש.
// 🔴 רמות C/D ובן/חתן סותרים — מנהל בלבד (החלטת המשתמש).
// ⚠️ בלי מפל: המיזוג נוגע רק בקבוצה. ילדים שהפכו לאחים כפולים יופיעו בסריקה
// הבאה כקבוצה משלהם, ויוכרעו בעין — לא בשקט.
// ─────────────────────────────────────────────────────────────────────────────

async function loadGroups(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const [{ rows: nodes }, { rows: bens }, { rows: notDupRows }] = await Promise.all([
    fetchAllRows<DupNode>((from, to) => db.from('lineage_nodes').select('id, name, parent_id, generation, status, relation').range(from, to)),
    fetchAllRows<{ lineage_node_id: string }>((from, to) => db.from('beneficiaries').select('lineage_node_id').not('lineage_node_id', 'is', null).range(from, to)),
    fetchAllRows<{ node_a: string; node_b: string }>((from, to) => db.from('lineage_not_duplicates').select('node_a, node_b').range(from, to)),
  ])
  const benCount = new Map<string, number>()
  for (const b of bens) benCount.set(b.lineage_node_id, (benCount.get(b.lineage_node_id) ?? 0) + 1)
  const kids = new Map<string, DupNode[]>()
  for (const n of nodes) if (n.parent_id) { const l = kids.get(n.parent_id); if (l) l.push(n); else kids.set(n.parent_id, [n]) }
  const kidCount = new Map([...kids].map(([k, v]) => [k, v.length]))
  const notDup = new Set(notDupRows.map(r => pairKey(r.node_a, r.node_b)))
  const groups = findSiblingDuplicates(nodes, notDup, { bens: benCount, kids: kidCount })
  return { nodes, groups, benCount, kids }
}

export async function GET() {
  const staff = await requirePermission('lineage', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { nodes, groups, benCount, kids } = await loadGroups(db)
  const byId = new Map(nodes.map(n => [n.id, n]))
  const isAdmin = staff.role === 'admin'
  return NextResponse.json({
    isAdmin,
    counts: {
      total: groups.length,
      A: groups.filter(g => g.level === 'A').length,
      B: groups.filter(g => g.level === 'B').length,
      C: groups.filter(g => g.level === 'C').length,
      D: groups.filter(g => g.level === 'D').length,
      adminOnly: groups.filter(g => g.adminOnly).length,
    },
    groups: groups.map(g => ({
      ...g,
      canDecide: !g.adminOnly || isAdmin,
      parentName: g.parentId ? byId.get(g.parentId)?.name ?? null : null,
      nodes: g.nodeIds.map(id => {
        const n = byId.get(id)!
        const ch = kids.get(id) ?? []
        return {
          id, name: n.name, status: n.status, relation: n.relation,
          families: benCount.get(id) ?? 0,
          children: ch.length,
          childNames: ch.slice(0, 5).map(c => c.name),
        }
      }),
    })),
  })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { action?: string; key?: string; keepId?: string; name?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { groups } = await loadGroups(db)
  const g = groups.find(x => x.key === body.key)
  if (!g) return NextResponse.json({ error: 'הקבוצה השתנתה או כבר טופלה — המסך יתרענן', stale: true }, { status: 409 })
  if (g.adminOnly && staff.role !== 'admin') {
    return NextResponse.json({ error: 'קבוצה זו (שמות אישה שונים / בן מול חתן) מוכרעת על ידי מנהל בלבד' }, { status: 403 })
  }

  if (body.action === 'not_duplicate') {
    const rows: { node_a: string; node_b: string; created_by: string }[] = []
    for (let i = 0; i < g.nodeIds.length; i++)
      for (let j = i + 1; j < g.nodeIds.length; j++) {
        const [a, b] = [g.nodeIds[i], g.nodeIds[j]].sort()
        rows.push({ node_a: a, node_b: b, created_by: staff.userId })
      }
    const { error } = await db.from('lineage_not_duplicates').upsert(rows, { onConflict: 'node_a,node_b' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logActivity(db, { userId: staff.userId, action: 'lineage_not_duplicate', entityType: 'lineage_node', entityId: g.keepId, details: { nodeIds: g.nodeIds, level: g.level } })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'merge') {
    const keepId = body.keepId && g.nodeIds.includes(body.keepId) ? body.keepId : g.keepId
    const name = String(body.name ?? '').trim().slice(0, 200) || g.suggestedName
    const batchId = randomUUID()
    try {
      const r = await mergeWithCascade(db, {
        keepId, mergeIds: g.nodeIds.filter(id => id !== keepId), batchId, userId: staff.userId,
        names: { [keepId]: name }, cascadeUp: false, cascadeDown: false,
        // ⚠️ אחים באותו דור — הדורות אינם זזים (ראו safe-merge).
        skipRecalc: true,
      })
      invalidateLineageCache()
      await logActivity(db, { userId: staff.userId, action: 'lineage_dup_review_merge', entityType: 'lineage_node', entityId: keepId, details: { batchId, nodeIds: g.nodeIds, level: g.level, name } })
      return NextResponse.json({ ok: true, batchId, merged: r.mergedCount, families: r.reassignedBeneficiaries, children: r.reassignedChildren })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'המיזוג נכשל' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
}
