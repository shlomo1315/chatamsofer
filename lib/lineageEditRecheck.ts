// ─────────────────────────────────────────────────────────────────────────────
// 🔴 עריכת השושלת בדף העריכה: השרשרת והבדיקה המעמיקה מחושבות מחדש.
//
// הבאג (24.11):הנרשם הקליד ידנית את דור 5 תחת עוגן בדור 4,
// ההקלדה נחסמה (earlyManualBlocked) והכרטסת נכנסה לבדיקה מעמיקה. המנהל בחר
// בדף העריכה את הצומת הנכון מהרשימה, אבל /api/admin/beneficiaries/update שמר
// רק את lineage_node_id: השרשרת השמורה (ממנה הכרטסת צובעת) נשארה עם השם
// שהוקלד, הסטטוס נשאר deep_review והסיבה נשארה "העוגן בדור 4".
//
// כאן אותו כלל כמו בשיוך מהעץ (/api/admin/lineage/assign): השרשרת נגזרת
// מהמסלול בעץ, הדורות שמתחת לצומת נשמרים, והשער המלא (שם, דור והורה) מוחלט
// מחדש. משתחרר ל"ממתין" רק כשהוא עובר; אחרת הסיבה מתעדכנת למצב הנוכחי.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { earlyLineageGate } from './earlyLineageGate'
import { generationsStatus, registrantGeneration } from './minGenerations'

type ChainEntry = { generation: number; name: string; relation: string | null }
type Node = { id: string; name: string; parent_id: string | null; generation: number; relation: string | null }

function sameManual(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (Array.isArray(v) ? v : []).map(x => String(x ?? '').trim()).filter(Boolean)
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

/** המסלול מהשורש עד הצומת. null = הצומת או אחד מאבותיו חסר. */
async function pathFromRoot(db: SupabaseClient, nodeId: string): Promise<Node[] | null> {
  const out: Node[] = []
  const seen = new Set<string>()
  let id: string | null = nodeId
  while (id && !seen.has(id) && out.length < 40) {
    seen.add(id)
    const { data, error } = await db.from('lineage_nodes')
      .select('id, name, parent_id, generation, relation').eq('id', id).maybeSingle()
    if (error || !data) return null
    const n = data as Node
    out.unshift(n)
    id = n.parent_id
  }
  return out
}

/**
 * שדות נוספים לעדכון הכרטסת אחרי עריכת השושלת. ריק כשהשושלת לא השתנתה.
 * ⚠️ best-effort: כשל בקריאה משאיר את הכרטסת כפי שהיא, ולא משחרר.
 */
export async function recheckAfterLineageEdit(
  db: SupabaseClient,
  beneficiaryId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!('lineage_node_id' in payload) && !('lineage_manual' in payload)) return {}
  const { data: cur } = await db.from('beneficiaries')
    .select('lineage_node_id, lineage_chain, lineage_manual, eligibility_status, deep_review_reason')
    .eq('id', beneficiaryId).maybeSingle()
  if (!cur) return {}
  const row = cur as { lineage_node_id: string | null; lineage_chain: unknown; lineage_manual: unknown; eligibility_status: string | null; deep_review_reason?: string | null }

  const nodeId = 'lineage_node_id' in payload ? (payload.lineage_node_id ? String(payload.lineage_node_id) : null) : row.lineage_node_id
  const manual = 'lineage_manual' in payload ? payload.lineage_manual : row.lineage_manual
  const nodeChanged = (nodeId ?? '') !== (row.lineage_node_id ?? '')
  if (!nodeChanged && sameManual(manual, row.lineage_manual)) return {}

  const extra: Record<string, unknown> = {}
  let chain: unknown = row.lineage_chain
  if (nodeChanged && nodeId) {
    const path = await pathFromRoot(db, nodeId)
    if (path?.length) {
      const leafGen = path[path.length - 1].generation
      const existing = Array.isArray(row.lineage_chain) ? (row.lineage_chain as ChainEntry[]) : []
      const below = existing.filter(e => e && typeof e.generation === 'number' && e.generation > leafGen)
      chain = [...path.map(n => ({ generation: n.generation, name: n.name, relation: n.relation ?? null })), ...below]
        .sort((a, b) => a.generation - b.generation)
      extra.lineage_chain = chain
    }
  }

  // 🔴 שבעה דורות לפחות (lib/minGenerations) — גם בעריכה מאוחרת. סטטוס
  // שהמנהל קבע במפורש באותה שמירה גובר.
  if (!('eligibility_status' in payload)) {
    const byRule = await generationsStatus(
      { status: row.eligibility_status, reason: row.deep_review_reason },
      registrantGeneration(chain),
      () => earlyLineageGate(db, { lineage_node_id: nodeId, lineage_chain: chain, lineage_manual: manual }),
    )
    if (byRule) return { ...extra, ...byRule }
  }

  // סטטוס שהמנהל קבע במפורש באותה שמירה גובר. סטטוסים אחרים לא משתנים כאן.
  if (row.eligibility_status === 'deep_review' && !('eligibility_status' in payload)) {
    const gate = await earlyLineageGate(db, { lineage_node_id: nodeId, lineage_chain: chain, lineage_manual: manual })
    if (!gate.deep) {
      extra.eligibility_status = 'pending'
      extra.deep_review_reason = null
    } else if (gate.reason) {
      extra.deep_review_reason = gate.reason
    }
  }
  return extra
}
