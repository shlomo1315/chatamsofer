// ─────────────────────────────────────────────────────────────────────────────
// בירור (25.11): מי קיבל את מייל "תקלה בסדר הדורות" ובצדק או בטעות.
//
// הסבב הראשון (24.11, 18:25) נשלח לכל מי שהיה בסטטוס deep_review, בלי לבדוק
// שהשרשרת באמת שגויה ובלי לסנן סיבה שהמזכירות הקלידה. כאן משחזרים לכל נמען את
// המצב ברגע השליחה ומריצים עליו את אותו שער (classifyLineage):
//   • הסדיר בקישור אחרי השליחה → השרשרת של "לפני" מתוך lineage_review_applied.
//   • שוחרר בבדיקה מחדש          → הסיבה של "לפני" מתוך deep_review_recheck_released.
//   • אחרת                       → המצב השמור כעת.
//
// כאן רק הסיווג הטהור, כדי שייבדק בלי מסד. הנתיב:
// /api/admin/beneficiaries/lineage-fault-notice/audit
// ─────────────────────────────────────────────────────────────────────────────

import type { ApprovedRefTreeLookup } from './lineageApprovedRef'
import { classifyLineage, type GapNode } from './deepReviewGaps'
import { gateReasonOf, isAutoDeepReason } from './earlyLineageGate'
import type { RecheckBen } from './deepReviewRecheck'

export type AuditGroup = 'justified' | 'wrong_chain_ok' | 'wrong_other_reason' | 'unclear'

export const AUDIT_GROUP_LABEL: Record<AuditGroup, string> = {
  justified: 'נשלח בצדק: סדר הדורות שגוי',
  wrong_chain_ok: 'נשלח בטעות: סדר הדורות תקין',
  wrong_other_reason: 'נשלח בטעות: בבדיקה מעמיקה מסיבה שהמזכירות רשמה, לא סדר הדורות',
  unclear: 'לא ברור',
}

export interface AuditInput {
  ben: RecheckBen
  /** הסדרה בקישור אחרי המייל (הראשונה), עם המצב שלפניה. */
  applied: { before: { chain: unknown; node_id: string | null } } | null
  /** שחרור בבדיקה מחדש אחרי המייל (הראשון), עם הסיבה שלפניו. */
  released: { prevReason: string | null } | null
}

export interface AuditResult { group: AuditGroup; why: string }

export function auditFaultRecipient(
  { ben, applied, released }: AuditInput,
  byId: Map<string, GapNode>,
  approved: ApprovedRefTreeLookup,
): AuditResult {
  const reason = String((released ? released.prevReason : ben.deep_review_reason) ?? '').trim()
  if (reason && !isAutoDeepReason(reason)) return { group: 'wrong_other_reason', why: `סיבת הבדיקה: ${reason}` }

  // הסטטוס השתנה בדרך אחרת (למשל אישור ידני): אי אפשר לשחזר את המצב בשליחה.
  if (!applied && !released && ben.eligibility_status !== 'deep_review') {
    return { group: 'unclear', why: `הסטטוס שונה ידנית ל-${ben.eligibility_status ?? 'ריק'} אחרי השליחה` }
  }

  const atSend = applied
    ? { ...ben, lineage_node_id: applied.before.node_id, lineage_chain: applied.before.chain }
    : ben
  if (atSend.lineage_node_id && !byId.has(atSend.lineage_node_id)) {
    return { group: 'unclear', why: 'הצומת שהמשפחה הייתה משויכת אליו כבר לא קיים בעץ' }
  }
  const finding = classifyLineage(atSend, byId, approved)
  if (!finding) return { group: 'wrong_chain_ok', why: reason ? `סיבה שנרשמה אז: ${reason}` : 'בלי סיבה רשומה' }
  return { group: 'justified', why: gateReasonOf(finding) }
}
