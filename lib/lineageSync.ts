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

// ─────────────────────────────────────────────────────────────────────────────
// גרסת המטמון של עץ הדורות. כרטסת הלידה (app/admin/maternity/[id]/page.tsx)
// מחזיקה מטמון בזיכרון של lineage_nodes ל-5 דקות, כדי לא לסרוק את הטבלה בכל
// טעינה. אבל כל מי שכותב status (אישור/דחיית יחוס — approve-lineage, מיזוג,
// ייבוא) חייב לפסול אותו מיד: בלי זה, אישור יחוס בכרטסת צאצא לא היה מופיע
// בכרטסת הלידה עד שהמטמון פג — הצ'יפים היו נשארים כתום למרות שהעץ כבר כחול.
// ─────────────────────────────────────────────────────────────────────────────
let _lineageCacheVersion = 0
export function invalidateLineageCache(): void { _lineageCacheVersion++; _treeCache = null }
export function lineageCacheVersion(): number { return _lineageCacheVersion }

// ─────────────────────────────────────────────────────────────────────────────
// מטמון משותף של *כל* עץ הדורות בזיכרון השרת.
//
// ⚠️ למה: כל טעינת עץ (GET /api/admin/lineage, getAllLineageNodes בכרטסת צאצא,
// getLineageMap בכרטסת לידה) סרקה את כל ~5000 הצמתים מחדש — 6 סבבי רשת דרך
// fetchAllRows בכל פתיחת מסך. העץ משתנה לעיתים נדירות (רק בכתיבה מפורשת), ולכן
// מטמון בזיכרון עם TTL קצר + פסילה מיידית ב-invalidateLineageCache (שכבר נקרא
// בכל approve/merge/import/PATCH) בטוח לחלוטין ומאיץ פתיחת כל כרטסת במערכת.
//
// שים לב: המטמון משותף בין בקשות באותו תהליך; ריבוי מכונות/עובדים → כל אחד
// מטמון משלו, וזה תקין — TTL קצר וה-version מגבילים את חלון אי-העקביות.
// ─────────────────────────────────────────────────────────────────────────────
let _treeCache: { at: number; version: number; rows: TreeNodeRow[] } | null = null
const TREE_CACHE_TTL_MS = 60_000
// גיל מרבי להגשת עותק *מיושן* בזמן רענון ברקע. מעבר לו ממתינים לשליפה אמיתית.
const TREE_STALE_MAX_MS = 10 * 60_000
// שליפה שכבר רצה — כדי ששתי בקשות במקביל לא יסרקו את העץ פעמיים (single-flight).
let _treeInflight: Promise<TreeNodeRow[]> | null = null

/**
 * טוען את כל צמתי העץ, עם מטמון. `loader` מבצע את השליפה בפועל (fetchAllRows).
 * מוחזר עותק חדש בכל קריאה כדי שצרכנים שממיינים/משנים לא ידרסו את המטמון.
 *
 * ⚡ stale-while-revalidate: כשהעותק פג או נפסל, הוא עדיין מוגש *מיד* והרענון
 * רץ ברקע. הסיבה: invalidateLineageCache נקרא גם מנתיב הרישום הציבורי
 * (public-register — אישור אוטומטי של שם), ובגל רישום המוני הוא נקרא כל כמה
 * שניות. בלי זה כל פתיחת כרטסת בממשק הניהול נפלה על סריקה מלאה של ~5000 צמתים
 * (6 סבבי רשת סדרתיים) — ולכן הפורטל הציבורי בפועל *הקפיא את ממשק הניהול*.
 * חלון אי-העקביות הוא עד סיום רענון אחד ברקע, ועל נתוני עץ זה בטוח לחלוטין.
 */
export async function getCachedLineageTree(
  loader: () => Promise<TreeNodeRow[]>,
): Promise<TreeNodeRow[]> {
  const now = Date.now()
  const fresh = _treeCache && _treeCache.version === _lineageCacheVersion && now - _treeCache.at < TREE_CACHE_TTL_MS
  if (fresh) return _treeCache!.rows.slice()

  const refresh = (): Promise<TreeNodeRow[]> => {
    if (_treeInflight) return _treeInflight
    const version = _lineageCacheVersion
    _treeInflight = loader()
      .then(rows => { _treeCache = { at: Date.now(), version, rows }; return rows })
      .finally(() => { _treeInflight = null })
    return _treeInflight
  }

  // עותק מיושן אך שמיש — מגישים אותו מיד ומרעננים ברקע.
  if (_treeCache && now - _treeCache.at < TREE_STALE_MAX_MS) {
    void refresh().catch(e => console.error('[lineage] רענון מטמון ברקע נכשל:', e))
    return _treeCache.rows.slice()
  }

  return (await refresh()).slice()
}

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

/**
 * דחיית מפל: כשצומת נדחה, כל צאצאיו בעץ נדחים גם הם אוטומטית — כי אם דור אינו
 * מיוחס, ממילא כל צאצאיו אינם מיוחסים. לא ייתכן שדור נדחה ודור אחריו מאושר.
 * (החזרה מדחייה אינה מפל: כדי לאשר צאצא צריך לאשר אותו במפורש — דחייה חמורה מדי
 * לביטול אוטומטי.)
 *
 * מחזיר את מזהי הצמתים שנדחו (הצומת + כל צאצאיו שלא היו כבר rejected).
 * best-effort — כשל נרשם ואינו מפיל את הפעולה.
 */
export async function cascadeRejectSubtree(
  db: SupabaseClient,
  nodes: TreeNodeRow[],
  rejectedNodeId: string,
): Promise<string[]> {
  const ids = [...subtreeNodeIds(nodes, rejectedNodeId)]
  // רק צמתים שאינם כבר rejected — כדי לא לדרוס ולרשום מיותר
  const map = new Map(nodes.map(n => [n.id, n]))
  const toReject = ids.filter(id => map.get(id)?.status !== 'rejected')
  if (!toReject.length) return []
  const { error } = await db
    .from('lineage_nodes')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .in('id', toReject)
  if (error) { console.error('[lineageSync] cascade reject:', error.message); return [] }
  return toReject
}

/**
 * דחייה בעץ → דחיית המשפחות המקושרות.
 *
 * ⚠️ המראה של approveVerifiedBeneficiaries. עד כה דחיית צומת צבעה את העץ בלבד,
 * והמשפחה המקושרת נשארה "מאושרת" בצאצאים — כלומר יחוס שנדחה במפורש והמשך
 * זכאות מלאה, בלי שום דבר שסוגר את הפער.
 *
 * חל על הצומת שנדחה *וכל צאצאיו* (הם נדחו איתו במפל), על כל סטטוס שאינו כבר
 * 'rejected'. אינו שולח מייל — דחייה בעץ היא פעולה פנימית, והמייל נשלח
 * מהדחייה הידנית בכרטסת, שם היא מכוונת.
 *
 * מחזיר את מספר המשפחות שנדחו. best-effort — כשל נרשם ואינו מפיל את הפעולה.
 */
export async function rejectLinkedBeneficiaries(
  db: SupabaseClient,
  nodes: TreeNodeRow[],
  rejectedNodeId: string,
  reason = 'היחוס נדחה בעץ הדורות',
): Promise<number> {
  const ids = [...subtreeNodeIds(nodes, rejectedNodeId)]
  if (!ids.length) return 0
  const { data, error } = await db
    .from('beneficiaries')
    .update({
      eligibility_status: 'rejected',
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .in('lineage_node_id', ids)
    .neq('eligibility_status', 'rejected')
    .select('id')
  if (error) {
    console.error('[lineageSync] rejectLinkedBeneficiaries:', error.message)
    return 0
  }
  return (data ?? []).length
}

// ─────────────────────────────────────────────────────────────────────────────
// אישור בעץ הדורות → אישור המשפחה בצאצאים.
//
// ⚠️ עד כה הסנכרון היה חד-כיווני בלבד: אישור משפחה בכרטסת צבע את הצומת בעץ
// (approve-lineage), אבל אישור בעץ לא נגע ב-eligibility_status. התוצאה —
// צומת ירוק בעץ ומשפחה שנשארת "ממתינה לאישור" בצאצאים, בלי שום דבר שיסגור
// את הפער. זה בדיוק המקרה של יחיאל חיים טוביאס.
//
// "מאושר לגמרי" = הצומת עצמו וכל שרשרת האבות שמעליו עד השורש מאומתים. די
// בחוליה אחת שאינה מאומתת כדי שהיחוס לא יהיה מוכח, ולכן הבדיקה היא על כל
// המסלול ולא על הצומת בלבד.
// ─────────────────────────────────────────────────────────────────────────────

/** האם כל המסלול מהצומת עד השורש מאומת. */
function chainFullyVerified(byId: Map<string, TreeNodeRow>, nodeId: string): boolean {
  const path = pathToRoot(byId, nodeId)
  if (!path.length) return false
  return path.every(n => (n.status ?? 'verified') === 'verified')
}

/**
 * מאשר משפחות שהיחוס שלהן הושלם — הצומת שאושר, כל צאצאיו, *וכל אבותיו*.
 *
 * ⚠️ מקודמות רק משפחות במצב 'pending'. משפחה ב-'docs_pending' ממתינה
 * למסמכים, וקידום אוטומטי שלה היה מדלג על דרישת המסמכים בלי שאיש שם לב;
 * ו-'rejected' נדחתה בהחלטה מפורשת ואין לבטלה מהעץ. שתיהן נשארות כפי שהן.
 *
 * ⚠️ אינו שולח מייל: אישור בעץ הוא פעולה פנימית של הצוות, ואישור של עשרות
 * צמתים ברצף היה מפיץ עשרות מיילים למשפחות בלי כוונה. המייל נשלח באישור
 * הידני מהכרטסת, שם הוא מכוון.
 *
 * מחזיר את מזהי המשפחות שקודמו — הקורא מריץ עליהן את המשך התהליך
 * (הכנסת ילדיהן לעץ כמאושרים).
 */
export async function approveVerifiedBeneficiaries(
  db: SupabaseClient,
  nodes: TreeNodeRow[],
  changedNodeId: string,
): Promise<string[]> {
  const byId = new Map(nodes.map(n => [n.id, n]))
  // ── מי מועמד לקידום ──
  // • הצומת שאושר וכל *צאצאיו* — אישור של אב עשוי להשלים את השרשרת גם לצאצאים
  //   שכבר היו מאומתים בעצמם וחיכו דווקא לחוליה הזו.
  // • ⚠️ וגם כל *אבותיו*: אישור צומת מאמת אוטומטית את שרשרת האבות ה"ממתינים"
  //   שמעליו (ראו הראוט), ולכן ברגע הזה גם היחוס שלהם הושלם. עד כה הם לא נבדקו
  //   כלל — מי שאישר את הבן ראה שהאבא נצבע ירוק בעץ אבל הכרטסת שלו נשארה
  //   "ממתינה לאישור", בלי שום דבר שיסגור את הפער.
  const scope = new Set<string>([
    ...subtreeNodeIds(nodes, changedNodeId),
    ...pathToRoot(byId, changedNodeId).map(n => n.id),
  ])
  const candidates = [...scope].filter(id => chainFullyVerified(byId, id))
  if (!candidates.length) return []

  // ⚠️ לא רק 'pending': משפחה במצב 'review' (ממתינה לבדיקת מסמכים) או בלי
  // סטטוס כלל (רשומות ותיקות) נשארה "ממתינה לאישור" אחרי שהצומת שלה אושר בעץ —
  // בדיוק התלונה מהשטח. 'docs_pending' ו-'rejected' עדיין אינם מקודמים: הראשון
  // ממתין למסמכים והשני נדחה בהחלטה מפורשת.
  const { data, error } = await db
    .from('beneficiaries')
    .update({ eligibility_status: 'approved', updated_at: new Date().toISOString() })
    .in('lineage_node_id', candidates)
    .or('eligibility_status.in.(pending,review),eligibility_status.is.null')
    .select('id')
  if (error) {
    console.error('[lineageSync] approveVerifiedBeneficiaries:', error.message)
    return []
  }
  const approved = (data ?? []).map(r => (r as { id: string }).id)

  // ── נפילה-לאחור: משפחה שאין לה שיוך לצומת ──
  // ⚠️ הפער האמיתי שהתגלה: משפחה שנרשמה בלי lineage_node_id (או שהשיוך אבד
  // במיזוג) *אינה* יכולה להיות מקושרת לצומת שאושר, ולכן שום אישור בעץ לא נגע
  // בה — היא נשארה "ממתינה לאישור" לנצח בלי שאיש יבין למה.
  // הקישור נעשה רק בהתאמה *מלאה* של השרשרת: אותו אורך ואותם שמות מנורמלים בכל
  // דור. התאמה חלקית (שם בודד) הייתה יכולה לשייך אדם לענף של אחר.
  const linked = await linkOrphansByChain(db, byId, candidates)
  return [...approved, ...linked]
}

/** נרמול שם להשוואה — בלי תארים, גרשיים וכפילות רווחים. */
function nameKey(v: unknown): string {
  return String(v ?? '')
    .replace(/["'׳״]/g, '')
    .replace(/\b(רבי|ר|הרב|הרה"ג|מרת|הרבנית|זצ"ל|זיע"א|שליט"א|הי"ד)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function linkOrphansByChain(
  db: SupabaseClient,
  byId: Map<string, TreeNodeRow>,
  candidates: string[],
): Promise<string[]> {
  if (!candidates.length) return []
  // מפתח → מזהה צומת. המפתח הוא שרשרת השמות המנורמלת מהשורש עד הצומת.
  const keyToNode = new Map<string, string>()
  for (const id of candidates) {
    const path = pathToRoot(byId, id)
    if (!path.length) continue
    keyToNode.set(path.map(n => nameKey(n.name)).join('|'), id)
  }
  if (!keyToNode.size) return []

  const { data: orphans, error } = await db
    .from('beneficiaries')
    .select('id, lineage_chain, eligibility_status')
    .is('lineage_node_id', null)
  if (error) { console.error('[lineageSync] load orphans:', error.message); return [] }

  const out: string[] = []
  for (const row of orphans ?? []) {
    const b = row as { id: string; lineage_chain?: unknown; eligibility_status?: string | null }
    const chain = Array.isArray(b.lineage_chain) ? (b.lineage_chain as { name?: string }[]) : []
    if (!chain.length) continue
    const nodeId = keyToNode.get(chain.map(c => nameKey(c.name)).join('|'))
    if (!nodeId) continue
    const status = b.eligibility_status ?? null
    const promote = status === null || status === 'pending' || status === 'review'
    const { error: upErr } = await db.from('beneficiaries').update({
      lineage_node_id: nodeId,
      ...(promote ? { eligibility_status: 'approved' } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', b.id)
    if (upErr) { console.error('[lineageSync] link orphan:', upErr.message); continue }
    console.log(`[lineageSync] משפחה ${b.id} שויכה לצומת ${nodeId} לפי התאמת שרשרת מלאה${promote ? ' ואושרה' : ''}`)
    if (promote) out.push(b.id)
  }
  return out
}
