import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// סנכרון בין עץ הדורות לכרטסות הצאצאים.
//
// הבעיה שזה פותר: לכל צאצא נשמר עותק של שרשרת הדורות (lineage_chain), והכרטסת
// זיהתה את הסטטוס של כל דור ע"י *התאמת שמות* מול העץ. לכן שינוי בעץ — שינוי
// שם, העברת ענף, אישור צומת — לא הגיע לכרטסת: הצאצא הופיע כ"חריג" למרות
// שבעץ הצומת שלו מאושר, רק כי השם בעותק השמור לא היה זהה לשם שבעץ.
//
// העיקרון כאן: **העץ הוא מקור האמת**. כשלצאצא יש שיוך לצומת (lineage_node_id),
// השרשרת והסטטוסים נגזרים מהמסלול בעץ לפי מזהי צמתים — לא לפי שמות. שינוי בעץ
// משתקף מיד. במקביל, עריכה בעץ מרעננת את העותק השמור אצל הצאצאים המושפעים,
// כדי שגם המסכים והמיילים שקוראים את lineage_chain יישארו נכונים.
// ─────────────────────────────────────────────────────────────────────────────

export interface TreeNodeRow {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status: string
  relation?: string | null
}

export interface ChainEntry {
  generation: number
  name: string
  relation: string | null
}

export const NODE_SELECT = 'id, name, parent_id, generation, status, relation'

/** המסלול מהשורש עד הצומת (כולל), לפי parent_id. ריק אם הצומת לא נמצא. */
export function pathToRoot(nodes: TreeNodeRow[] | Map<string, TreeNodeRow>, nodeId?: string | null): TreeNodeRow[] {
  if (!nodeId) return []
  const map = nodes instanceof Map ? nodes : new Map(nodes.map(n => [n.id, n]))
  const out: TreeNodeRow[] = []
  const seen = new Set<string>()
  let cur = map.get(nodeId)
  // seen — הגנה מפני מעגל בעץ (parent_id שמצביע חזרה), אחרת לולאה אינסופית
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.unshift(cur)
    cur = cur.parent_id ? map.get(cur.parent_id) : undefined
  }
  return out
}

/** שרשרת הדורות בפורמט lineage_chain, מתוך מסלול בעץ. */
export function chainFromPath(path: TreeNodeRow[]): ChainEntry[] {
  return path.map(n => ({ generation: n.generation, name: n.name, relation: n.relation ?? null }))
}

/** מזהי כל הצמתים בתת-העץ שמתחת לצומת (כולל הצומת עצמו). */
export function subtreeNodeIds(nodes: TreeNodeRow[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    const list = childrenOf.get(n.parent_id)
    if (list) list.push(n.id)
    else childrenOf.set(n.parent_id, [n.id])
  }
  const out = new Set<string>([rootId])
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()!
    for (const child of childrenOf.get(id) ?? []) {
      if (out.has(child)) continue   // הגנה מפני מעגל
      out.add(child)
      stack.push(child)
    }
  }
  return out
}

/**
 * מרענן את lineage_chain של כל הצאצאים ששויכו לאחד הצמתים שברשימה, לפי המסלול
 * העדכני בעץ. נקרא אחרי עריכה בעץ (שם / הורה / סטטוס / מחיקה).
 *
 * best-effort: שגיאה נרשמת ללוג ואינה מפילה את עריכת העץ עצמה — עדיף שהעריכה
 * תצליח והעותק יתעדכן בפעם הבאה, מאשר שהמנהל ייחסם מלתקן את העץ.
 *
 * מחזיר את מספר הצאצאים שעודכנו.
 */
export async function resyncBeneficiaryChains(
  db: SupabaseClient,
  nodes: TreeNodeRow[],
  nodeIds: Iterable<string>,
): Promise<number> {
  const ids = [...nodeIds]
  if (!ids.length) return 0

  const { data: affected, error } = await db
    .from('beneficiaries')
    .select('id, lineage_node_id')
    .in('lineage_node_id', ids)
  if (error) {
    console.error('[lineageSync] load affected beneficiaries:', error.message)
    return 0
  }

  const map = new Map(nodes.map(n => [n.id, n]))
  let updated = 0
  for (const ben of affected ?? []) {
    const path = pathToRoot(map, (ben as { lineage_node_id?: string | null }).lineage_node_id)
    if (!path.length) continue
    const { error: upErr } = await db
      .from('beneficiaries')
      .update({ lineage_chain: chainFromPath(path) })
      .eq('id', (ben as { id: string }).id)
    if (upErr) console.error('[lineageSync] update chain:', upErr.message)
    else updated++
  }
  return updated
}

/**
 * מרענן את השרשרות לכל תת-העץ שמתחת לצומת שהשתנה — כולל צאצאים ששויכו
 * לצמתים עמוקים יותר, שהמסלול שלהם עובר דרך הצומת שנערך.
 */
export async function resyncSubtree(
  db: SupabaseClient,
  nodes: TreeNodeRow[],
  changedNodeId: string,
): Promise<number> {
  return resyncBeneficiaryChains(db, nodes, subtreeNodeIds(nodes, changedNodeId))
}
