// ─────────────────────────────────────────────────────────────────────────────
// השער של 5 הדורות הראשונים: האם המשפחה צריכה בדיקה מעמיקה.
//
// 🔴 הכלל (שלמה, 24.11): מי שדורות 2–5 שלו אינם תואמים לקובץ המאושר
// (שם, דור והורה) נכנס לבדיקה מעמיקה, בלי קשר לשאלה אם הקליד שמות ידנית.
// עד כה הרישום בדק רק "עוגן רדוד וגם הוקלדו צמתים", ומשפחה שבחרה מהרשימה
// ענף שאינו בקובץ קיבלה 'pending' (ת"ז 302746730).
//
// ⚠️ מקור אמת אחד: classifyLineage מ-lib/deepReviewGaps, אותה בדיקה של הדוח.
//
// 🔴 כשל בטעינה = בדיקה מעמיקה (fail closed). getApprovedRefTree מחזיר בודק
// מתירני כשהטעינה נכשלת, וכאן זה היה מאשר בשקט. לכן הקובץ נטען ישירות.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildApprovedRefTree, type ApprovedRefTreeLookup } from './lineageApprovedRef'
import { classifyLineage, GAP_KIND_LABEL, type GapFinding, type GapNode } from './deepReviewGaps'
import { fetchAllRows } from './fetchAllRows'

type RefRow = { key: string; name: string; generation: number; parent_key: string | null }

/** הקובץ המאושר, או null כשהטעינה נכשלה או שהטבלה ריקה. */
export async function loadApprovedRefStrict(db: SupabaseClient): Promise<ApprovedRefTreeLookup | null> {
  try {
    const { rows, error } = await fetchAllRows<RefRow>((f, t) =>
      db.from('lineage_approved_ref').select('key, name, generation, parent_key').range(f, t))
    if (error || !rows.length) return null
    return buildApprovedRefTree(rows)
  } catch {
    return null
  }
}

/** מסלול הצומת עד השורש, בהליכה על ההורים. null = כשל בקריאה. */
async function loadAncestors(db: SupabaseClient, nodeId: string): Promise<Map<string, GapNode> | null> {
  const out = new Map<string, GapNode>()
  let id: string | null = nodeId
  for (let i = 0; id && i < 40 && !out.has(id); i++) {
    const { data, error } = await db.from('lineage_nodes')
      .select('id, name, parent_id, generation').eq('id', id).maybeSingle()
    if (error) return null
    if (!data) break // צומת חסר — classifyLineage תחזיר broken_node
    const n = data as GapNode
    out.set(n.id, n)
    id = n.parent_id
  }
  return out
}

export interface GateInput {
  lineage_node_id: string | null
  lineage_chain?: unknown
  lineage_manual?: unknown
}

export interface GateResult {
  /** true = בדיקה מעמיקה. */
  deep: boolean
  /** מה נכשל (null כשתקין, או כשהבדיקה לא הושלמה). */
  finding: GapFinding | null
  /** הבדיקה לא הושלמה (כשל בטעינה), ולכן deep=true. */
  unknown: boolean
  /** הסבר לשדה deep_review_reason. */
  reason: string | null
}

const UNKNOWN_REASON_PREFIX = 'סדר הדורות לא נבדק מול הקובץ המאושר'

/**
 * האם deep_review_reason נכתב ע"י השער (ולא הערה שהמזכיר הקליד).
 * ⚠️ הבאנר בכרטסת הציג כל סיבה כ"הערת המזכיר" ו"המסמכים אושרו ע"י המזכירות",
 * גם כשהשער קבע אותה ברישום ואיש לא אישר דבר.
 */
export function isAutoDeepReason(reason: string | null | undefined): boolean {
  const s = String(reason ?? '').trim()
  if (!s) return false
  return s.startsWith(UNKNOWN_REASON_PREFIX) || Object.values(GAP_KIND_LABEL).some(l => s.startsWith(l))
}

/** בדיקת המשפחה מול הקובץ המאושר. עם approved מוכן נחסכת טעינה חוזרת. */
export async function earlyLineageGate(
  db: SupabaseClient,
  ben: GateInput,
  approvedIn?: ApprovedRefTreeLookup | null,
): Promise<GateResult> {
  const unknown = (why: string): GateResult =>
    ({ deep: true, finding: null, unknown: true, reason: `${UNKNOWN_REASON_PREFIX} (${why}) — נדרשת בדיקה ידנית` })
  try {
    const approved = approvedIn ?? await loadApprovedRefStrict(db)
    if (!approved) return unknown('הקובץ המאושר לא נטען')
    let byId = new Map<string, GapNode>()
    if (ben.lineage_node_id) {
      const loaded = await loadAncestors(db, ben.lineage_node_id)
      if (!loaded) return unknown('העץ לא נטען')
      byId = loaded
    }
    const finding = classifyLineage({
      id: '', id_number: null, full_name: null, family_name: null, eligibility_status: null,
      lineage_node_id: ben.lineage_node_id, lineage_chain: ben.lineage_chain, lineage_manual: ben.lineage_manual,
    }, byId, approved)
    if (!finding) return { deep: false, finding: null, unknown: false, reason: null }
    const where = finding.generation ? ` (דור ${finding.generation}${finding.detail ? `: ${finding.detail}` : ''})` : ''
    return { deep: true, finding, unknown: false, reason: `${GAP_KIND_LABEL[finding.kind]}${where}` }
  } catch (e) {
    console.error('[early-lineage-gate]', e instanceof Error ? e.message : e)
    return unknown('שגיאה בבדיקה')
  }
}
