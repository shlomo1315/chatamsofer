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

/**
 * המפל כלפי מטה: אחרי מיזוג, ילדי הצומת שנשאר עשויים להיות כפילים זה של זה.
 * ממזג אותם ויורד הלאה, עד שאין יותר כפילויות בענף.
 */
async function cascadeDown(
  db: SupabaseClient,
  startId: string,
  ctx: { batchId: string; userId?: string | null },
): Promise<{ merged: number; children: number; beneficiaries: number }> {
  let merged = 0, children = 0, beneficiaries = 0
  const queue: string[] = [startId]
  const seen = new Set<string>()
  // ⚠️ תקרה קשיחה: נתוני עץ פגומים (מעגל אחרי עריכה שגויה) היו מסובבים
  // את הלולאה עד ל-timeout של הבקשה.
  let guard = 0

  while (queue.length && guard++ < 20_000) {
    const parentId = queue.shift() as string
    if (seen.has(parentId)) continue
    seen.add(parentId)

    const { data: kids } = await db.from('lineage_nodes')
      .select('id, name, parent_id, generation, status, relation')
      .eq('parent_id', parentId)
    const list = (kids ?? []) as MergeNodeRow[]
    if (!list.length) continue

    // מספר הילדים של כל מועמד — לבחירת מי נשאר
    const counts = new Map<string, number>()
    if (list.length > 1) {
      const { data: grand } = await db.from('lineage_nodes')
        .select('parent_id').in('parent_id', list.map(k => k.id))
      for (const g of grand ?? []) {
        const pid = (g as { parent_id: string }).parent_id
        counts.set(pid, (counts.get(pid) ?? 0) + 1)
      }
    }

    const groups = groupForAutoMerge(list)
    const mergedAway = new Set<string>()

    for (const group of groups) {
      const keepId = pickKeepId(group, counts)
      const ids = group.map(g => g.id).filter(id => id !== keepId)
      const r = await mergeOne(db, keepId, ids, { ...ctx, source: 'cascade' })
      merged += ids.length
      children += r.children
      beneficiaries += r.beneficiaries
      ids.forEach(id => mergedAway.add(id))
      // הצומת שנשאר נבדק שוב — הילדים שהצטרפו אליו עשויים להיות כפילים בעצמם
      queue.push(keepId)
    }

    for (const k of list) if (!mergedAway.has(k.id)) queue.push(k.id)
  }

  return { merged, children, beneficiaries }
}

/**
 * המפל כלפי מעלה: אם ההורה של הצומת שנשאר הוא כפיל של אח שלו (אותו סב,
 * אותו שם) — ממזגים גם אותו, וממשיכים למעלה.
 * מחזיר את המזהה של הצומת העליון ביותר שנגענו בו.
 */
async function cascadeUp(
  db: SupabaseClient,
  fromId: string,
  ctx: { batchId: string; userId?: string | null },
): Promise<{ merged: number; children: number; beneficiaries: number; topId: string }> {
  let merged = 0, children = 0, beneficiaries = 0
  let cur = fromId
  let guard = 0

  while (guard++ < 100) {
    const { data: node } = await db.from('lineage_nodes')
      .select('id, parent_id').eq('id', cur).maybeSingle()
    const parentId = (node as { parent_id: string | null } | null)?.parent_id
    if (!parentId) break

    const { data: parent } = await db.from('lineage_nodes')
      .select('id, name, parent_id, generation, status, relation').eq('id', parentId).maybeSingle()
    if (!parent) break
    const grandId = (parent as MergeNodeRow).parent_id
    if (!grandId) break

    // האחים של ההורה — מי מהם נושא את אותו שם
    const { data: siblings } = await db.from('lineage_nodes')
      .select('id, name, parent_id, generation, status, relation')
      .eq('parent_id', grandId)
    const list = (siblings ?? []) as MergeNodeRow[]
    const key = autoMergeKey((parent as MergeNodeRow).name)
    const group = list.filter(s => (s.status ?? '') !== 'rejected' && autoMergeKey(s.name) === key)
    if (group.length < 2) { cur = parentId; continue }

    // ⚠️ ההורה של הענף שאנחנו בתוכו הוא שנשאר — אחרת הצומת שהמשתמש עמד עליו
    // היה עובר לצומת אחר, והמבט שלו היה קופץ למקום לא צפוי.
    const ids = group.map(g => g.id).filter(id => id !== parentId)
    const r = await mergeOne(db, parentId, ids, { ...ctx, source: 'cascade' })
    merged += ids.length
    children += r.children
    beneficiaries += r.beneficiaries
    cur = parentId
  }

  return { merged, children, beneficiaries, topId: cur }
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

/**
 * מיזוג מלא: המיזוג שהמשתמש ביקש, ואחריו המפל (למטה ולמעלה, לפי הבחירה).
 */
export async function mergeWithCascade(
  db: SupabaseClient,
  opts: {
    keepId: string
    mergeIds: string[]
    batchId: string
    userId?: string | null
    cascadeDown?: boolean
    cascadeUp?: boolean
  },
): Promise<MergeResult> {
  const ctx = { batchId: opts.batchId, userId: opts.userId }
  const base = await mergeOne(db, opts.keepId, opts.mergeIds, { ...ctx, source: 'manual' })

  let cascaded = 0
  let children = base.children
  let beneficiaries = base.beneficiaries
  let top = opts.keepId

  if (opts.cascadeUp !== false) {
    const up = await cascadeUp(db, opts.keepId, ctx)
    cascaded += up.merged; children += up.children; beneficiaries += up.beneficiaries
    top = up.topId
  }
  if (opts.cascadeDown !== false) {
    const down = await cascadeDown(db, opts.keepId, ctx)
    cascaded += down.merged; children += down.children; beneficiaries += down.beneficiaries
  }

  await recalcGenerations(db, top)

  return {
    batchId: opts.batchId,
    mergedCount: opts.mergeIds.length + cascaded,
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
