import type { SupabaseClient } from '@supabase/supabase-js'
import { parseHebrewName } from './hebrewNames'

// ─────────────────────────────────────────────────────────────────────────────
// מנוע המיזוג בעץ הדורות — כולל המפל.
//
// ⚠️ הבעיה שזה פותר: אותו אדם נרשם ע"י כמה צאצאים, וכל אחד בנה ידנית את
// השרשרת עד עצמו. התוצאה — שרשרת שלמה שהתפצלה: אותו סבא מופיע N פעמים, לכל
// עותק ילד אחד (הענף שמוביל לאותו נרשם), וכך גם דור מתחת וגם מעל.
//
// זיהוי הכפילויות היום דורש *אותו אב*. לכן מיזוג דור 6 בלבד משאיר את שני
// הבנים בדור 7 נפרדים; רק אחרי שהאב מוזג הם הופכים לאחים ומזוהים ככפולים.
// דור-דור, עם טעינה מחדש בין כל אחד — בלתי אפשרי במאות שרשראות.
//
// התובנה: כפילות היא מפל. מיזוג זוג הופך את ילדיהם לאחים, כלומר לזוג כפול
// חדש. לכן אחרי כל מיזוג סורקים מיד את ילדי הצומת שנשאר וממזגים גם אותם,
// רקורסיבית עד קצה הענף — לחיצה אחת בראש מקפלת את כל השרשרת.
//
// ⚠️ המפל האוטומטי פועל *רק* על שמות זהים אחרי נרמול והסרת תארים. התאמה
// מקורבת ("מרדכי" מול "מרדכי צבי") לעולם אינה ממוזגת מעצמה — מיזוג של שני
// אנשים שאינם אותו אדם הוא הרסני, והכרעה כזו שייכת לאדם בלבד.
// ─────────────────────────────────────────────────────────────────────────────

export interface MergeNodeRow {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status?: string | null
  relation?: string | null
}

export interface MergeResult {
  batchId: string
  mergedCount: number
  reassignedChildren: number
  reassignedBeneficiaries: number
  /** כמה מיזוגים נגררו אוטומטית מהמפל (מעבר למיזוג שהמשתמש ביקש) */
  cascadedCount: number
}

/**
 * מפתח המיזוג האוטומטי — השם אחרי נרמול והסרת תארים וסימני כבוד.
 * ⚠️ לא normalizeHebrewName לבדו: הוא משאיר את התואר, ולכן "רבי מרדכי"
 * ו-"ר' מרדכי" היו נחשבים שונים — בדיוק הכפילות הנפוצה ביותר.
 */
export function autoMergeKey(name: string): string {
  return parseHebrewName(name).words.join(' ')
}

/**
 * מי נשאר מבין הכפילים.
 * מאומת קודם (הוא כבר אושר ע"י הצוות), אחריו זה שיש לו הכי הרבה ילדים —
 * כך פחות רשומות זזות ממקומן, ופחות מקום לטעות.
 */
export function pickKeepId(group: MergeNodeRow[], childCount: Map<string, number>): string {
  const sorted = [...group].sort((a, b) => {
    const av = (a.status ?? 'verified') === 'verified' ? 1 : 0
    const bv = (b.status ?? 'verified') === 'verified' ? 1 : 0
    if (av !== bv) return bv - av
    const ac = childCount.get(a.id) ?? 0
    const bc = childCount.get(b.id) ?? 0
    if (ac !== bc) return bc - ac
    return a.id.localeCompare(b.id)   // יציב, כדי שאותו קלט ייתן אותה תוצאה
  })
  return sorted[0].id
}

/**
 * מקבץ צמתים לקבוצות מיזוג אוטומטי לפי שם זהה (אחרי נרמול).
 * צומת שסומן 'rejected' אינו משתתף — הוא נדחה בהחלטה מפורשת.
 */
export function groupForAutoMerge(nodes: MergeNodeRow[]): MergeNodeRow[][] {
  const byKey = new Map<string, MergeNodeRow[]>()
  for (const n of nodes) {
    if ((n.status ?? '') === 'rejected') continue
    const key = autoMergeKey(n.name)
    if (!key) continue
    const arr = byKey.get(key) ?? []
    arr.push(n)
    byKey.set(key, arr)
  }
  return [...byKey.values()].filter(g => g.length > 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// תכנון המפל — לוגיקה טהורה, בלי מסד נתונים.
//
// ⚠️ הופרד מהביצוע בכוונה. המפל נוגע בעשרות צמתים בבת אחת, ומיזוג שגוי הוא
// הרסני; לוגיקה שרצה על מפות בזיכרון אפשר לבדוק במלואה מראש, ולהציג למשתמש
// תצוגה מקדימה מדויקת של מה שעומד לקרות — לפני שנוגעים במשהו.
//
// ⚠️ הכלל כלפי מעלה תוקן: קודם הוא חיפש "אח של ההורה באותו שם", וזה פשוט לא
// נכון בשרשרת שהתפצלה — שם ההורים הכפולים אינם אחים אלא יושבים תחת סבים
// כפולים בעצמם:
//
//        ROOT            מיזוג C2→C1 בדק אם ל-B1 יש אח באותו שם.
//       ╱     ╲          התשובה לא (B1 תחת A1, B2 תחת A2), המפל נעצר,
//     A1       A2        ו-B2/A2 נשארו תלויים באוויר.
//     │        │
//     B1       B2        הכלל הנכון: ללכת אחרי *ההורים של מה שמוזג*.
//     │        │         C1 בא מ-B1 ו-C2 בא מ-B2 → B1 ו-B2 הם אותו אדם.
//     C1       C2        וכך הלאה עד השורש.
// ─────────────────────────────────────────────────────────────────────────────

export interface MergeStep {
  keepId: string
  mergeIds: string[]
  generation: number
  direction: 'requested' | 'up' | 'down'
}

export interface CascadePlan {
  steps: MergeStep[]
  /** התאמות מקורבות שהמפל נעצר בהן — דורשות הכרעת אדם ולא מבוצעות לבד */
  stopped: { generation: number; keepId: string; keepName: string; otherId: string; otherName: string }[]
  /** הצומת העליון ביותר שנגעו בו — ממנו מחשבים מחדש דורות */
  topId: string
  /** סך הצמתים שייעלמו (לא כולל הצמתים שנשארים) */
  totalMerged: number
}

export function planCascade(
  nodes: MergeNodeRow[],
  keepId: string,
  mergeIds: string[],
  opts: { up?: boolean; down?: boolean } = {},
): CascadePlan {
  const doUp = opts.up !== false
  const doDown = opts.down !== false

  const byId = new Map(nodes.map(n => [n.id, { ...n }]))
  const kids = new Map<string, string[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    const a = kids.get(n.parent_id) ?? []
    a.push(n.id)
    kids.set(n.parent_id, a)
  }
  const dead = new Set<string>()
  const steps: MergeStep[] = []
  const stopped: CascadePlan['stopped'] = []

  // type-guard ולא boolean — כדי ש-TypeScript יצמצם את הטיפוס אחרי הבדיקה
  const alive = (id: string | null | undefined): id is string => !!id && byId.has(id) && !dead.has(id)
  const parentOf = (id: string) => byId.get(id)?.parent_id ?? null
  const nameOf = (id: string) => byId.get(id)?.name ?? ''
  const genOf = (id: string) => byId.get(id)?.generation ?? 0

  /** מדמה מיזוג בזיכרון: הילדים עוברים ל-keep והכפילים מסומנים כמחוקים. */
  const apply = (keep: string, ids: string[], direction: MergeStep['direction']) => {
    const real = ids.filter(id => alive(id) && id !== keep)
    if (!real.length) return
    for (const m of real) {
      for (const c of kids.get(m) ?? []) {
        const node = byId.get(c)
        if (node) node.parent_id = keep
        const arr = kids.get(keep) ?? []
        if (!arr.includes(c)) arr.push(c)
        kids.set(keep, arr)
      }
      kids.delete(m)
      dead.add(m)
    }
    steps.push({ keepId: keep, mergeIds: real, generation: genOf(keep), direction })
  }

  if (!alive(keepId)) return { steps, stopped, topId: keepId, totalMerged: 0 }

  // ── 1) המיזוג שהמשתמש ביקש. ההורים נשמרים *לפני* הביצוע — הם המפתח למעלה.
  const requestedParents = mergeIds.filter(alive).map(parentOf)
  apply(keepId, mergeIds, 'requested')

  // ── 2) כלפי מעלה: אחרי ההורים של מה שמוזג, לא אחרי אחים.
  let curKeep = keepId
  let curParents = requestedParents
  let guard = 0
  while (doUp && guard++ < 200) {
    const kp = parentOf(curKeep)
    if (!alive(kp)) break
    const cands = [...new Set(curParents.filter(p => alive(p) && p !== kp))] as string[]
    if (!cands.length) break

    const key = autoMergeKey(nameOf(kp))
    const same: string[] = []
    for (const c of cands) {
      if ((byId.get(c)?.status ?? '') === 'rejected') continue
      if (autoMergeKey(nameOf(c)) === key) same.push(c)
      else {
        // ⚠️ התאמה מקורבת — נעצרים ומדווחים. מיזוג של שני אנשים שאינם אותו
        // אדם הוא הרסני, ולכן ההכרעה הזו לעולם אינה נעשית אוטומטית.
        stopped.push({
          generation: genOf(kp), keepId: kp as string, keepName: nameOf(kp),
          otherId: c, otherName: nameOf(c),
        })
      }
    }
    if (!same.length) break

    const nextParents = same.map(parentOf)
    apply(kp as string, same, 'up')
    curKeep = kp as string
    curParents = nextParents
  }
  const topId = curKeep

  // ── 3) כלפי מטה מהצומת העליון: מיזוג ההורים הפך ילדים לאחים, וייתכן
  //      שגם הם כפילים — כולל ענפים שלא היו חלק מהשרשרת המקורית.
  if (doDown) {
    const queue = [topId]
    const seen = new Set<string>()
    let g2 = 0
    while (queue.length && g2++ < 20_000) {
      const pid = queue.shift() as string
      if (seen.has(pid) || !alive(pid)) continue
      seen.add(pid)
      const list = (kids.get(pid) ?? []).filter(alive).map(id => byId.get(id) as MergeNodeRow)
      if (!list.length) continue
      const groups = groupForAutoMerge(list)
      const counts = new Map(list.map(n => [n.id, (kids.get(n.id) ?? []).filter(alive).length]))
      const handled = new Set<string>()
      for (const group of groups) {
        const keep = pickKeepId(group, counts)
        const ids = group.map(x => x.id).filter(id => id !== keep)
        apply(keep, ids, 'down')
        ids.forEach(id => handled.add(id))
        queue.push(keep)
      }
      for (const n of list) if (!handled.has(n.id)) queue.push(n.id)
    }
  }

  return { steps, stopped, topId, totalMerged: dead.size }
}

// ─── פעולות מול המסד ──────────────────────────────────────────────────────────

/** מיזוג יחיד: mergeIds נבלעים לתוך keepId, עם רישום מלא לביטול. */
async function mergeOne(
  db: SupabaseClient,
  keepId: string,
  mergeIds: string[],
  ctx: { batchId: string; userId?: string | null; source: 'manual' | 'cascade' },
): Promise<{ children: number; beneficiaries: number }> {
  let children = 0
  let beneficiaries = 0

  for (const mid of mergeIds) {
    // ⚠️ קוראים את הצומת *לפני* המחיקה — אחרי המחיקה אין מה לשחזר ממנו.
    const { data: node } = await db
      .from('lineage_nodes')
      .select('id, name, parent_id, generation, status, relation, notes')
      .eq('id', mid).maybeSingle()

    const { data: kids } = await db.from('lineage_nodes')
      .update({ parent_id: keepId }).eq('parent_id', mid).select('id')
    const { data: bens } = await db.from('beneficiaries')
      .update({ lineage_node_id: keepId }).eq('lineage_node_id', mid).select('id')

    children += kids?.length ?? 0
    beneficiaries += bens?.length ?? 0

    // ⚠️ הרישום נכתב לפני המחיקה. אם הכתיבה נכשלת — לא מוחקים, כי מחיקה בלי
    // רישום היא בדיוק המצב הבלתי-הפיך שהיומן נועד למנוע.
    const { error: logErr } = await db.from('lineage_merge_log').insert({
      batch_id: ctx.batchId,
      keep_id: keepId,
      merged_id: mid,
      merged_node: node ?? { id: mid },
      moved_children: (kids ?? []).map(k => k.id),
      moved_beneficiaries: (bens ?? []).map(b => b.id),
      source: ctx.source,
      created_by: ctx.userId ?? null,
    })
    if (logErr) {
      console.error('[lineageMerge] רישום הביטול נכשל — המיזוג נעצר:', logErr.message)
      throw new Error('לא ניתן לרשום את המיזוג ביומן — הפעולה בוטלה כדי שלא תיווצר מחיקה בלתי הפיכה')
    }

    await db.from('lineage_nodes').delete().eq('id', mid)
  }

  return { children, beneficiaries }
}

/** חישוב-מחדש של מספרי הדורות בכל תת-העץ, אחרי שילדים הועברו. */
export async function recalcGenerations(db: SupabaseClient, rootId: string): Promise<void> {
  const { data: root } = await db.from('lineage_nodes').select('generation').eq('id', rootId).maybeSingle()
  const baseGen = (root as { generation?: number } | null)?.generation ?? 1

  const { data: all } = await db.from('lineage_nodes').select('id, parent_id')
  const childrenOf = new Map<string | null, string[]>()
  for (const n of all ?? []) {
    const arr = childrenOf.get(n.parent_id) ?? []
    arr.push(n.id)
    childrenOf.set(n.parent_id, arr)
  }

  const genOf = new Map<number, string[]>()
  const queue: { id: string; gen: number }[] = (childrenOf.get(rootId) ?? []).map(id => ({ id, gen: baseGen + 1 }))
  const seen = new Set<string>([rootId])
  let guard = 0
  while (queue.length && guard++ < 100_000) {
    const it = queue.shift() as { id: string; gen: number }
    if (seen.has(it.id)) continue
    seen.add(it.id)
    const arr = genOf.get(it.gen) ?? []
    arr.push(it.id)
    genOf.set(it.gen, arr)
    for (const c of childrenOf.get(it.id) ?? []) queue.push({ id: c, gen: it.gen + 1 })
  }
  for (const [gen, ids] of genOf) {
    await db.from('lineage_nodes').update({ generation: gen }).in('id', ids)
  }
}

export const MERGE_NODE_SELECT = 'id, name, parent_id, generation, status, relation'

/** טוען את העץ ומחשב את תוכנית המפל — בלי לגעת בנתונים. */
export async function loadCascadePlan(
  db: SupabaseClient,
  keepId: string,
  mergeIds: string[],
  opts: { up?: boolean; down?: boolean } = {},
): Promise<{ plan: CascadePlan; nodes: MergeNodeRow[] }> {
  const { data } = await db.from('lineage_nodes').select(MERGE_NODE_SELECT)
  const nodes = (data ?? []) as MergeNodeRow[]
  return { plan: planCascade(nodes, keepId, mergeIds, opts), nodes }
}

/**
 * ביצוע תוכנית המפל.
 *
 * ⚠️ names ממפה צומת-שנשאר → השם שייקבע לו. בלי זה המפל היה בוחר שם בשקט:
 * "ר' יוסף יהודה קראוס" ו-"יוסף יהודה קראוס" הם אותו מפתח (התואר מוסר), ולכן
 * המיזוג נכון — אבל *איזה נוסח יישאר* היא החלטה שאין למערכת דרך להכריע בה,
 * והיא נעשתה בלי לשאול. עכשיו כל דור שבו הניסוחים אינם זהים מגיע להכרעת
 * המשתמש מראש, ונשלח לכאן מוכן.
 */
export async function mergeWithCascade(
  db: SupabaseClient,
  opts: {
    keepId: string
    mergeIds: string[]
    batchId: string
    userId?: string | null
    /** צומת-שנשאר → שם סופי. מוחל אחרי המיזוג של אותו שלב. */
    names?: Record<string, string>
    cascadeDown?: boolean
    cascadeUp?: boolean
  },
): Promise<MergeResult> {
  const ctx = { batchId: opts.batchId, userId: opts.userId }
  const { plan } = await loadCascadePlan(db, opts.keepId, opts.mergeIds, {
    up: opts.cascadeUp, down: opts.cascadeDown,
  })

  let children = 0, beneficiaries = 0, cascaded = 0, requested = 0

  for (const step of plan.steps) {
    const r = await mergeOne(db, step.keepId, step.mergeIds, {
      ...ctx, source: step.direction === 'requested' ? 'manual' : 'cascade',
    })
    children += r.children
    beneficiaries += r.beneficiaries
    if (step.direction === 'requested') requested += step.mergeIds.length
    else cascaded += step.mergeIds.length

    // ⚠️ השם נכתב אחרי המיזוג של אותו שלב ולא לפניו: אם השלב נכשל, לא נשאר
    // צומת שקיבל שם חדש אך לא בלע דבר.
    const nm = opts.names?.[step.keepId]?.trim()
    if (nm) {
      const { error } = await db.from('lineage_nodes').update({ name: nm }).eq('id', step.keepId)
      if (error) console.error('[lineageMerge] עדכון שם נכשל:', error.message)
    }
  }

  await recalcGenerations(db, plan.topId)

  return {
    batchId: opts.batchId,
    mergedCount: requested + cascaded,
    cascadedCount: cascaded,
    reassignedChildren: children,
    reassignedBeneficiaries: beneficiaries,
  }
}

/** ביטול מיזוג — מחזיר את כל הצמתים של אותה אצווה למקומם. */
export async function undoMergeBatch(db: SupabaseClient, batchId: string): Promise<number> {
  const { data: rows } = await db.from('lineage_merge_log')
    .select('id, merged_id, merged_node, moved_children, moved_beneficiaries')
    .eq('batch_id', batchId).is('undone_at', null)
    .order('created_at', { ascending: false })   // הפוך לסדר הביצוע
  if (!rows?.length) return 0

  let restored = 0
  for (const r of rows) {
    const node = (r as { merged_node: Record<string, unknown> }).merged_node
    if (!node?.id) continue
    // ⚠️ upsert ולא insert: ריצת ביטול שנקטעה באמצע לא תיפול על "כבר קיים"
    // ותשאיר את שאר השרשרת בלי שחזור.
    const { error } = await db.from('lineage_nodes').upsert(node, { onConflict: 'id' })
    if (error) { console.error('[lineageMerge] שחזור צומת נכשל:', error.message); continue }

    const kids = (r as { moved_children: string[] }).moved_children ?? []
    if (kids.length) await db.from('lineage_nodes').update({ parent_id: node.id }).in('id', kids)
    const bens = (r as { moved_beneficiaries: string[] }).moved_beneficiaries ?? []
    if (bens.length) await db.from('beneficiaries').update({ lineage_node_id: node.id }).in('id', bens)

    await db.from('lineage_merge_log').update({ undone_at: new Date().toISOString() })
      .eq('id', (r as { id: string }).id)
    restored++
  }
  return restored
}
