// ─────────────────────────────────────────────────────────────────────────────
// משפחות ש-5 הדורות הראשונים שלהן אינם תקינים — ואינן בבדיקה מעמיקה.
//
// 🔴 הפער (24.11, ת"ז 302746730): הסטטוס deep_review נקבע ברישום לפי כלל
// אחד בלבד — "בחר עוגן בדור < 5 *וגם* הקליד שמות ידנית". אבל הכרטסת צובעת
// את דורות 2–5 לפי הקובץ המאושר. משפחה שבחרה מהרשימה צומת שאינו בקובץ
// (ענף שגוי, עותק שנוצר מהקלדה ישנה), שלא נקשרה לצומת בכלל, או שנרשמה לפני
// 26.07 — מקבלת 'pending' ונראית תקינה בסטטוס, אף שהדורות שלה אדומים.
//
// ⚠️ קריאה בלבד. הכלל לתקינות הוא אותו earlyGenerationsCheck שמשמש את קישור
// התיקון — מקור אמת אחד, כדי שהרשימה לא תחלוק על השער.
// ─────────────────────────────────────────────────────────────────────────────

import { earlyGenerationsCheck } from './lineageFixApply'
import { chainHasGap } from './lineageChainHealth'
import type { ApprovedRefTreeLookup } from './lineageApprovedRef'

export interface GapNode { id: string; name: string; parent_id: string | null; generation: number }

export interface GapBen {
  id: string
  id_number: string | null
  full_name: string | null
  family_name: string | null
  spouse_name?: string | null
  eligibility_status: string | null
  lineage_node_id: string | null
  lineage_chain?: unknown
  lineage_manual?: unknown
  registration_source?: string | null
  created_at?: string | null
}

export type GapKind =
  | 'not_in_ref'   // דור 2–5 במסלול אינו בקובץ המאושר (במקום הזה)
  | 'too_shallow'  // המשפחה עצמה או דור שהוקלד יושבים בתוך דורות 2–5
  | 'gen_gap'      // דילוג דורות בשרשרת
  | 'broken_node'  // הצומת המשויך אינו מגיע לשורש
  | 'no_node'      // אין שיוך לעץ — נבדקה רק השרשרת השמורה
  | 'no_lineage'   // אין שיוך ואין שרשרת כלל

export const GAP_KIND_LABEL: Record<GapKind, string> = {
  not_in_ref: 'דור 2–5 אינו בקובץ המאושר',
  too_shallow: 'המשפחה או דור שהוקלד יושבים בתוך 5 הדורות',
  gen_gap: 'דילוג דורות',
  broken_node: 'הצומת המשויך מנותק מהשורש',
  no_node: 'לא משויך לעץ, והשרשרת השמורה אינה תקינה',
  no_lineage: 'אין סדר דורות כלל',
}

export interface GapFinding { kind: GapKind; generation: number | null; detail: string }

/** סטטוסים שכבר מטופלים — לא נכללים בפער. */
const HANDLED = new Set(['deep_review', 'rejected'])

/** המסלול מהשורש עד הצומת. null = ניתוק (הורה חסר, מעגל, או שורש שאינו דור 1). */
export function pathFromRoot(nodeId: string, byId: Map<string, GapNode>): GapNode[] | null {
  const out: GapNode[] = []
  const seen = new Set<string>()
  let cur = byId.get(nodeId)
  while (cur) {
    if (seen.has(cur.id)) return null
    seen.add(cur.id)
    out.push(cur)
    if (!cur.parent_id) break
    const parent = byId.get(cur.parent_id)
    if (!parent) return null
    cur = parent
  }
  if (!out.length || Number(out[out.length - 1].generation) !== 1) return null
  return out.reverse()
}

function chainOf(v: unknown): { name: string; generation: number }[] {
  if (!Array.isArray(v)) return []
  return v
    .map(e => ({ name: String((e as { name?: unknown })?.name ?? '').trim(), generation: Number((e as { generation?: unknown })?.generation) }))
    .filter(e => e.name && Number.isFinite(e.generation) && e.generation >= 1)
    .sort((a, b) => a.generation - b.generation)
}

function hasManual(v: unknown): boolean {
  return Array.isArray(v) && v.some(x => String(x ?? '').trim())
}

/** בדיקת משפחה אחת. null = 5 הדורות הראשונים תקינים. */
export function classifyLineage(
  ben: GapBen,
  byId: Map<string, GapNode>,
  approved: ApprovedRefTreeLookup,
): GapFinding | null {
  if (ben.lineage_node_id) {
    const path = pathFromRoot(ben.lineage_node_id, byId)
    if (!path) return { kind: 'broken_node', generation: null, detail: 'הצומת אינו מגיע לשורש העץ' }
    if (chainHasGap(ben.lineage_node_id, byId)) return { kind: 'gen_gap', generation: null, detail: 'חסרים דורות בין צומת לאביו' }
    // ⚠️ lineage_node_id הוא האב העמוק ביותר (העוגן), לא המשפחה — המשפחה היא דור העוגן+1.
    const early = earlyGenerationsCheck(path, approved)
    if (early.ok) return null
    const node = path.find(n => Number(n.generation) === early.generation)
    // אין צומת בדור הכושל = המשפחה עצמה יושבת בתוך 5 הדורות
    if (!node) {
      return { kind: 'too_shallow', generation: early.generation, detail: `העוגן בדור ${path[path.length - 1].generation}` }
    }
    return { kind: 'not_in_ref', generation: early.generation, detail: node.name }
  }

  const chain = chainOf(ben.lineage_chain)
  if (!chain.length) {
    return { kind: 'no_lineage', generation: null, detail: hasManual(ben.lineage_manual) ? 'יש רק שמות שהוקלדו ידנית' : 'ריק' }
  }
  // השרשרת השמורה כוללת את האבות בלבד; המשפחה עצמה היא הדור שאחרי האחרון.
  for (let g = 2; g <= 5; g++) {
    if (!chain.some(e => e.generation === g)) return { kind: 'no_node', generation: g, detail: `דור ${g} חסר בשרשרת` }
  }
  const path = chain[0].generation === 1 ? chain : [{ name: '', generation: 1 }, ...chain]
  const early = earlyGenerationsCheck(path, approved)
  if (early.ok) return null
  const bad = path.find(e => e.generation === early.generation)
  return { kind: 'no_node', generation: early.generation, detail: bad?.name ?? '' }
}

export interface GapRow extends GapFinding {
  id: string
  id_number: string | null
  name: string
  status: string | null
  registration_source: string | null
  created_at: string | null
}

/** כל המשפחות שבפער — לא בבדיקה מעמיקה ולא נדחו, ו-5 הדורות שלהן אינם תקינים. */
export function findDeepReviewGaps(
  bens: GapBen[],
  nodes: GapNode[],
  approved: ApprovedRefTreeLookup,
): GapRow[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const out: GapRow[] = []
  for (const b of bens) {
    if (HANDLED.has(b.eligibility_status ?? '')) continue
    const f = classifyLineage(b, byId, approved)
    if (!f) continue
    out.push({
      ...f,
      id: b.id,
      id_number: b.id_number,
      name: [b.full_name, b.spouse_name].filter(Boolean).join(' ו') || (b.family_name ?? ''),
      status: b.eligibility_status,
      registration_source: b.registration_source ?? null,
      created_at: b.created_at ?? null,
    })
  }
  return out
}
