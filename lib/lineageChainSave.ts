// ─────────────────────────────────────────────────────────────────────────────
// שמירת סדר דורות שנערך בעורך המשותף (components/lineage/LineageChainEditor).
//
// 🔴 השמירה עוברת *דרך העץ* (applyChain) ולא בכתיבה חופשית ל-lineage_chain:
// הטריגר sync_lineage_chain בונה את השרשרת מחדש מהמסלול בעץ, ולכן כתיבה
// ישירה הייתה נדרסת בסנכרון הבא. applyChain מתאימה כל דור לצומת קיים תחת
// אותו אב (בלי כפילויות), יוצרת רק את החסרים (pending), ומשייכת את הכרטסת
// — גם משפחה שלא הייתה משויכת לעץ כלל.
//
// ⚠️ lineage_manual מתאפס: כל הדורות נמצאים עכשיו בעץ, ודור ידני שנשאר היה
// מוצג פעמיים (displayChain מצרף אותו בסוף).
//
// שני מסלולים:
//   saveChainByStaff — מזכירות/מנהל. מוחל מיד, הסטטוס לא משתנה.
//   saveChainFromLink — קישור התיקון. מוחל מיד רק כש-5 הדורות הראשונים
//     תואמים את הקובץ המאושר (כמו עד היום); אחרת, וגם במצב מעורפל, נכנס
//     לתור הצוות. אחרי החלה הכרטסת חוזרת ל"ממתין לאישור ראשוני".
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js'
import { earlyGenerationsCheck } from './lineageFixApply'
import { EARLY_DEPTH } from './lineageDeviation'
import { chainHasGap, statusAfterFix, type ChainNode } from './lineageChainHealth'
import type { ApprovedRefTreeLookup } from './lineageApprovedRef'
import type { ChainStep } from './lineageChainEdit'
import type { GateInput, GateResult } from './earlyLineageGate'

type ApplyChain = (admin: SupabaseClient, beneficiaryId: string, chain: ChainStep[]) => Promise<{ createdNodes: number; movedTo: string | null }>
type TreeNode = ChainNode & { name: string; relation?: string | null }

export interface SaveDeps {
  applyChain: ApplyChain
  /** הנתיב של הצומת מהשורש — לעדכון סימון בן/חתן ולבדיקת דילוג דורות. */
  loadNodes: (admin: SupabaseClient) => Promise<TreeNode[]>
  logActivity: (admin: SupabaseClient, entry: Record<string, unknown>) => Promise<unknown>
  invalidate: () => void
  /** השער המלא (שם, דור והורה) — לחישוב הסטטוס ו-deep_review_reason אחרי השמירה. */
  gate?: (admin: SupabaseClient, ben: GateInput, approved?: ApprovedRefTreeLookup | null) => Promise<GateResult>
  /** רענון השרשרת השמורה של משפחות תחת צומת ששמו תוקן. */
  resyncSubtree?: (admin: SupabaseClient, nodes: TreeNode[], nodeId: string) => Promise<unknown>
}

export type SaveResult =
  | { ok: true; applied: true; chain: unknown[]; status?: string }
  | { ok: true; applied: false; reason: string }
  | { ok: false; error: string }

interface BenRow {
  id: string
  lineage_chain: unknown[] | null
  lineage_chain_before_fix: unknown[] | null
  lineage_node_id: string | null
  eligibility_status: string | null
}

async function loadBen(admin: SupabaseClient, id: string): Promise<BenRow | null> {
  const { data } = await admin.from('beneficiaries')
    .select('id, lineage_chain, lineage_chain_before_fix, lineage_node_id, eligibility_status')
    .eq('id', id).maybeSingle()
  return (data as BenRow | null) ?? null
}

function pathOf(nodes: { id: string; parent_id: string | null }[], id: string | null) {
  const map = new Map(nodes.map(n => [n.id, n]))
  const out: typeof nodes = []
  const seen = new Set<string>()
  let cur = id ? map.get(id) : undefined
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); out.unshift(cur); cur = cur.parent_id ? map.get(cur.parent_id) : undefined }
  return out
}

/** מחילה ומחזירה את השרשרת השמורה החדשה (כפי שהעץ בנה אותה). */
async function applyAndRefresh(
  admin: SupabaseClient, deps: SaveDeps, ben: BenRow, chain: ChainStep[], extra: Record<string, unknown>,
  opts: { relations: 'all' | 'fill' | 'none'; renameAll: boolean },
) {
  const res = await deps.applyChain(admin, ben.id, chain)
  const nodes = await deps.loadNodes(admin)
  const path = pathOf(nodes, res.movedTo) as TreeNode[]

  // 🔴 סימון בן/חתן לדור שכבר קיים בעץ — applyChain מתאימה לפי שם בלבד ולא
  // מעדכנת את הקשר.
  //   all  — עורך עץ: כל דור.
  //   fill — קישור המשפחה: סימון שחסר בצומת, והדור של המשפחה עצמה (האחרון).
  //          סימון שסותר סימון קיים בצומת משותף לא נדרס; הוא חוזר ב-conflicts
  //          ונכנס לתור המזכירות. (הבאג של גולדשטיין 25.11: קודם הסימון נזרק
  //          בשקט, המשפחה קיבלה "התקבל" ובכניסה חוזרת הסימון היה חסר.)
  const conflicts: { generation: number; name: string; relation: string; current: string }[] = []
  if (opts.relations !== 'none') {
    for (let i = 1; i < path.length && i < chain.length; i++) {
      const want = chain[i].relation
      if (!want || path[i].relation === want) continue
      const own = i === path.length - 1 && i === chain.length - 1
      if (opts.relations === 'fill' && path[i].relation && !own) {
        conflicts.push({ generation: chain[i].generation, name: path[i].name, relation: want, current: path[i].relation! })
        continue
      }
      await admin.from('lineage_nodes').update({ relation: want }).eq('id', path[i].id)
      path[i].relation = want
    }
  }

  // 🔴 תיקון שם בדור קיים (הבאג של 25.11): applyChain מתאימה גם לפי שם הבעל
  // בלבד, ולכן "רבי עזרא ומרת gyhk rcev זלצמן" ← "רבי עזרא ומרת רחל זלצמן"
  // נמצא כאותו צומת והשם החדש נזרק. השרשרת נבנתה מחדש מהצומת עם השם הישן,
  // והתיקון "לא נקלט". כאן השם שנשלח נכתב לצומת עצמו.
  // ⚠️ צומת קיים משותף למשפחות אחרות: עורך עץ מתקן כל דור, ובשאר המקרים
  // (מזכירות, קישור המשפחה) רק את הדור של המשפחה עצמה — האחרון בשרשרת.
  // ⚠️ רק שם שהמשתמש שינה בפועל מול השרשרת השמורה — שרשרת שמורה ישנה לא
  // מחזירה לאחור שם שתוקן בעץ בינתיים.
  const before = new Map((Array.isArray(ben.lineage_chain) ? ben.lineage_chain as { generation?: unknown; name?: unknown }[] : [])
    .map(e => [Number(e?.generation), String(e?.name ?? '').trim()]))
  const renamed: string[] = []
  for (let i = 1; i < path.length && i < chain.length; i++) {
    const want = chain[i].name.trim()
    const own = i === path.length - 1 && i === chain.length - 1
    if (!want || path[i].name === want || before.get(chain[i].generation) === want) continue
    if (!opts.renameAll && !own) continue
    await admin.from('lineage_nodes').update({ name: want }).eq('id', path[i].id)
    path[i].name = want
    renamed.push(path[i].id)
  }
  if (renamed.length && deps.resyncSubtree) {
    const byId = new Map(path.map(n => [n.id, n]))
    const fresh = nodes.map(n => byId.get(n.id) ?? n)
    await deps.resyncSubtree(admin, fresh, renamed[0]).catch(() => {})
  }

  const fresh = path.map(n => ({ generation: n.generation, name: n.name, relation: n.relation ?? null }))
  await admin.from('beneficiaries').update({
    ...(ben.lineage_chain_before_fix == null ? { lineage_chain_before_fix: ben.lineage_chain ?? [] } : {}),
    ...(fresh.length ? { lineage_chain: fresh } : {}),
    lineage_manual: [],
    updated_at: new Date().toISOString(),
    ...extra,
  }).eq('id', ben.id)
  deps.invalidate()
  const gap = res.movedTo ? chainHasGap(res.movedTo, new Map(nodes.map(n => [n.id, n]))) : false
  return { nodeId: res.movedTo, chain: fresh, gap, conflicts }
}

export async function saveChainByStaff(
  admin: SupabaseClient, deps: SaveDeps, beneficiaryId: string, chain: ChainStep[], userId: string | null,
  /** ⚠️ צומת קיים משותף למשפחות אחרות — שינוי בן/חתן בו רק למי שעורך את העץ. */
  opts: { canEditTree: boolean } = { canEditTree: true },
): Promise<SaveResult> {
  const ben = await loadBen(admin, beneficiaryId)
  if (!ben) return { ok: false, error: 'הכרטסת לא נמצאה' }
  let out
  try {
    out = await applyAndRefresh(admin, deps, ben, chain, {}, { relations: opts.canEditTree ? 'all' : 'none', renameAll: opts.canEditTree })
  } catch (e) {
    // מצב מעורפל (שני צמתים באותו שם תחת אותו אב) — הודעה ברורה, בלי כתיבה.
    return { ok: false, error: e instanceof Error ? e.message : 'שמירת סדר הדורות נכשלה' }
  }
  // 🔴 כרטסת בבדיקה מעמיקה: השער המלא מוחל מחדש על השרשרת המתוקנת (כמו בדף
  // העריכה, lib/lineageEditRecheck). משתחררת ל"ממתין" רק כשהיא עוברת; אחרת
  // הסיבה מתעדכנת למצב הנוכחי. סטטוס אחר לא משתנה בעריכת צוות.
  let status: string | undefined
  if (ben.eligibility_status === 'deep_review' && deps.gate) {
    const gate = await deps.gate(admin, { lineage_node_id: out.nodeId, lineage_chain: out.chain, lineage_manual: [] })
    const extra = !gate.deep && !out.gap
      ? { eligibility_status: 'pending', deep_review_reason: null }
      : { deep_review_reason: gate.reason ?? 'דילוג דורות' }
    await admin.from('beneficiaries').update(extra).eq('id', ben.id)
    if ('eligibility_status' in extra) status = extra.eligibility_status
  }
  await deps.logActivity(admin, {
    userId, action: 'lineage_chain_edited', entityType: 'beneficiary', entityId: ben.id,
    details: {
      before: { chain: ben.lineage_chain ?? null, node_id: ben.lineage_node_id, eligibility_status: ben.eligibility_status },
      after: { chain: out.chain, node_id: out.nodeId, eligibility_status: status ?? ben.eligibility_status },
    },
  }).catch(() => {})
  return { ok: true, applied: true, chain: out.chain, ...(status ? { status } : {}) }
}

export interface LinkInvite { token: string; root_node_id: string | null; recipient_name: string | null; beneficiary_id: string }

/** 5 הדורות הראשונים תואמים לקובץ המאושר, והנמען אינו בדורות האלה. */
export function earlyOk(chain: ChainStep[], approved: ApprovedRefTreeLookup): { ok: true } | { ok: false; generation: number } {
  const early = earlyGenerationsCheck(chain.slice(0, EARLY_DEPTH), approved)
  if (!early.ok) return early
  const last = chain[chain.length - 1]?.generation ?? 1
  if (last <= EARLY_DEPTH) return { ok: false, generation: last }
  return { ok: true }
}

export async function saveChainFromLink(
  admin: SupabaseClient, deps: SaveDeps, inv: LinkInvite, chain: ChainStep[], approved: ApprovedRefTreeLookup,
): Promise<SaveResult> {
  const ben = await loadBen(admin, inv.beneficiary_id)
  if (!ben) return { ok: false, error: 'הכרטסת לא נמצאה' }

  const queue = async (reason: string): Promise<SaveResult> => {
    const text = `בקשת תיקון סדר דורות (לא הוחלה אוטומטית — ${reason}):\n`
      + chain.map(c => `דור ${c.generation}: ${c.name}${c.relation ? ` (${c.relation === 'son' ? 'בן' : 'חתן'})` : ''}`).join('\n')
    const { error } = await admin.from('lineage_review_suggestions').insert({
      token: inv.token, root_node_id: inv.root_node_id, kind: 'note', node_id: ben.lineage_node_id,
      beneficiary_id: ben.id,
      payload: { text, chain, chain_before: ben.lineage_chain ?? null, source: 'lineage_link_editor' },
      reviewer_name: inv.recipient_name, status: 'pending',
    })
    if (error) return { ok: false, error: 'שמירת הבקשה נכשלה. אנא נסו שוב.' }
    return { ok: true, applied: false, reason }
  }

  const early = earlyOk(chain, approved)
  if (!early.ok) return queue(`דור ${early.generation} אינו תואם את סדר הדורות המאושר`)

  let out
  try {
    out = await applyAndRefresh(admin, deps, ben, chain, {}, { relations: 'fill', renameAll: false })
  } catch (e) {
    return queue(e instanceof Error ? e.message : 'לא ניתן היה להחיל אוטומטית')
  }
  // סימון בן/חתן שסותר צומת משותף — לא נדרס, אבל גם לא נעלם: נכנס לתור המזכירות.
  if (out.conflicts.length) {
    const label = (r: string) => (r === 'son' ? 'בן' : 'חתן')
    const text = 'המשפחה סימנה בן/חתן שונה מהרשום בעץ (צומת משותף, לא עודכן אוטומטית):\n'
      + out.conflicts.map(c => `דור ${c.generation}: ${c.name}: ${label(c.relation)} (בעץ: ${label(c.current)})`).join('\n')
    await admin.from('lineage_review_suggestions').insert({
      token: inv.token, root_node_id: inv.root_node_id, kind: 'note', node_id: out.nodeId,
      beneficiary_id: ben.id,
      payload: { text, chain, chain_before: ben.lineage_chain ?? null, source: 'lineage_link_editor' },
      reviewer_name: inv.recipient_name, status: 'pending',
    })
  }
  // 🔴 כמו רישום חדש (החלטה 11.10) — חוזר לאישור ראשוני, או לבדיקה מעמיקה כשיש
  // דילוג או כשהשער המלא נכשל. deep_review_reason מתעדכן תמיד: קודם נשארה
  // הסיבה הישנה (או ריקה) גם אחרי שהמשפחה תיקנה.
  const gate = deps.gate
    ? await deps.gate(admin, { lineage_node_id: out.nodeId, lineage_chain: out.chain, lineage_manual: [] }, approved)
    : null
  const status = statusAfterFix(out.gap || !!gate?.deep)
  const reason = status === 'deep_review' ? (gate?.reason ?? 'דילוג דורות') : null
  await admin.from('beneficiaries').update({ eligibility_status: status, deep_review_reason: reason }).eq('id', ben.id)
  await deps.logActivity(admin, {
    action: 'lineage_review_applied', entityType: 'beneficiary', entityId: ben.id,
    details: {
      token: inv.token, source: 'lineage_link_editor',
      before: { chain: ben.lineage_chain ?? null, node_id: ben.lineage_node_id, eligibility_status: ben.eligibility_status },
      after: { chain: out.chain, node_id: out.nodeId, eligibility_status: status },
    },
  }).catch(() => {})
  return { ok: true, applied: true, chain: out.chain, status }
}
