// ─────────────────────────────────────────────────────────────────────────────
// מצב היחוס של משפחה, ולמה היא בבדיקה מעמיקה — מקור אמת אחד.
//
// עד כה כל מסך חישב לבד: השער (classifyLineage) ידע רק על דורות 2–5, הדוח
// ידע רק על פערים, ואף אחד לא ידע שאב במסלול נפסל. משפחה שאביה בדור 3 נפסל
// נשארה "מאושרת" בלי שום סימן.
//
// ⚠️ קריאה בלבד, טהור. מחושב מחדש בכל קריאה מתוך העץ — ולכן ביטול פסילה
// מחזיר את המשפחות שתחתיה אוטומטית, בלי לכתוב כלום לכרטסות.
// ⚠️ "תלוי בפסילה" אינו משנה את eligibility_status: סטטוס זכאות נקבע רק
// בהחלטה מפורשת בכרטסת (ראו ההערה ב-lineageSync.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { classifyLineage, pathFromRoot, GAP_KIND_LABEL, type GapBen, type GapFinding, type GapKind, type GapNode } from './deepReviewGaps'
import { isAutoDeepReason, isUncheckedDeepReason } from './earlyLineageGate'
import type { ApprovedRefTreeLookup } from './lineageApprovedRef'

export type LineageStanding =
  | 'approved_descendant'   // המסלול תקין, ואושר (בעץ או בכרטסת)
  | 'pending'               // המסלול תקין, ממתין לאישור
  | 'depends_on_rejection'  // אב במסלול נפסל
  | 'in_review'             // בבדיקה מעמיקה, או שהשער מוצא תקלה
  | 'undetermined'          // אין שיוך לעץ, או שהצומת מנותק — אי אפשר לקבוע
  | 'family_rejected'       // המשפחה עצמה נדחתה בכרטסת

export const STANDING_LABEL: Record<LineageStanding, string> = {
  approved_descendant: 'נכד מאושר',
  pending: 'ממתין לאישור',
  depends_on_rejection: 'תלוי בפסילה',
  in_review: 'בבדיקה',
  undetermined: 'לא ניתן לקבוע',
  family_rejected: 'המשפחה נדחתה',
}

export interface RejectedAncestor { id: string; name: string; generation: number }

export interface StandingResult {
  standing: LineageStanding
  /** מה השער אומר כעת על 5 הדורות. null = תקין. */
  finding: GapFinding | null
  /** האב הפסול הקרוב ביותר לשורש — ממנו יורדת הפסילה. */
  rejectedAt: RejectedAncestor | null
}

export function lineageStanding(
  ben: GapBen,
  byId: Map<string, GapNode>,
  approved: ApprovedRefTreeLookup,
): StandingResult {
  const finding = classifyLineage(ben, byId, approved)
  const status = ben.eligibility_status ?? ''

  let rejectedAt: RejectedAncestor | null = null
  let fullyVerified = false
  const path = ben.lineage_node_id ? pathFromRoot(ben.lineage_node_id, byId) : null
  if (path) {
    // ⚠️ המסלול מסודר מהשורש — הראשון שנמצא הוא מקור הפסילה.
    const r = path.find(n => n.status === 'rejected')
    if (r) rejectedAt = { id: r.id, name: r.name, generation: Number(r.generation) }
    fullyVerified = path.every(n => n.status === 'verified')
  }

  const result = (standing: LineageStanding): StandingResult => ({ standing, finding, rejectedAt })

  if (status === 'rejected') return result('family_rejected')
  // הפסילה גוברת על כל השאר: אין טעם לבדוק דורות של ענף שנפסל.
  if (rejectedAt) return result('depends_on_rejection')
  if (ben.lineage_node_id && !path) return result('undetermined')
  if (!ben.lineage_node_id && finding?.kind === 'no_lineage') return result('undetermined')
  if (finding || status === 'deep_review') return result('in_review')
  // בלי שיוך לעץ השרשרת השמורה תקינה, אבל אי אפשר לדעת אם אב בה נפסל.
  if (!ben.lineage_node_id) return result('undetermined')
  if (status === 'approved' || fullyVerified) return result('approved_descendant')
  return result('pending')
}

// ── למה המשפחה ברשימת הבדיקה ──────────────────────────────────────────────

export type ReviewReason =
  | GapKind                  // 1–6: השער מוצא תקלה ב-5 הדורות (עדיין בתוקף)
  | 'rejected_ancestor'      // 7: אב במסלול נפסל
  | 'secretary_note'         // 8: המזכיר העביר ידנית, והדורות תקינים
  | 'unchecked'              // 9: נכנסה כי השער לא הצליח לבדוק, והדורות תקינים כעת
  | 'reason_gone'            // 10: הסיבה שהשער רשם כבר לא קיימת
  | 'stuck_no_reason'        // 11: בבדיקה בלי סיבה, והדורות תקינים
  | 'missing_from_review'    // 12: פגומה — ולא בבדיקה מעמיקה

export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  ...GAP_KIND_LABEL,
  rejected_ancestor: 'אב במסלול נפסל',
  secretary_note: 'הועברה ידנית ע"י המזכירות',
  unchecked: 'לא נבדק מול הקובץ המאושר, ותקין כעת',
  reason_gone: 'הסיבה שנרשמה כבר לא קיימת',
  stuck_no_reason: 'תקועה בבדיקה בלי סיבה',
  missing_from_review: 'פגומה ואינה בבדיקה מעמיקה',
}

/** סיבות שמסמנות טעות של המערכת ולא בעיה ביחוס — מועמדות לשחרור. */
export const MISTAKE_REASONS = new Set<ReviewReason>(['unchecked', 'reason_gone', 'stuck_no_reason', 'missing_from_review'])

/** null = המשפחה לא שייכת לרשימה (תקינה ולא בבדיקה, או נדחתה). */
export function reviewReasonOf(
  ben: GapBen & { deep_review_reason?: string | null },
  s: StandingResult,
): ReviewReason | null {
  if (s.standing === 'family_rejected') return null
  if (s.rejectedAt) return 'rejected_ancestor'
  if (ben.eligibility_status !== 'deep_review') return s.finding ? 'missing_from_review' : null
  if (s.finding) return s.finding.kind
  const recorded = String(ben.deep_review_reason ?? '').trim()
  if (!recorded) return 'stuck_no_reason'
  if (isUncheckedDeepReason(recorded)) return 'unchecked'
  if (isAutoDeepReason(recorded)) return 'reason_gone'
  return 'secretary_note'
}

export interface LineageReportRow {
  id: string
  id_number: string | null
  name: string
  status: string | null
  reason: ReviewReason
  standing: LineageStanding
  generation: number | null
  detail: string
  rejectedAt: RejectedAncestor | null
  recordedReason: string | null
  registration_source: string | null
  created_at: string | null
}

export interface LineageReport {
  scanned: number
  total: number
  /** סיבה → כמות. */
  byReason: Partial<Record<ReviewReason, number>>
  /** מצב → כמות, על כל המשפחות שנסרקו. */
  byStanding: Partial<Record<LineageStanding, number>>
  /** כמה מהרשימה הן טעות של המערכת ולא בעיה ביחוס. */
  mistakes: number
  rows: LineageReportRow[]
}

function familyLabel(b: GapBen): string {
  // ⚠️ full_name הוא השם הפרטי בלבד — שם המשפחה ב-family_name.
  const own = [b.family_name, b.full_name].map(s => String(s ?? '').trim()).filter(Boolean).join(' ')
  const spouse = String(b.spouse_name ?? '').trim()
  return spouse ? `${own} ו${spouse}` : own
}

/** הדוח המלא: כל משפחה שבבדיקה מעמיקה, או שצריכה להיות בה, עם הסיבה והמצב כעת. */
export function buildLineageReport(
  bens: (GapBen & { deep_review_reason?: string | null })[],
  nodes: GapNode[],
  approved: ApprovedRefTreeLookup,
): LineageReport {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const byReason: LineageReport['byReason'] = {}
  const byStanding: LineageReport['byStanding'] = {}
  const rows: LineageReportRow[] = []
  for (const b of bens) {
    const s = lineageStanding(b, byId, approved)
    byStanding[s.standing] = (byStanding[s.standing] ?? 0) + 1
    const reason = reviewReasonOf(b, s)
    if (!reason) continue
    byReason[reason] = (byReason[reason] ?? 0) + 1
    rows.push({
      id: b.id,
      id_number: b.id_number,
      name: familyLabel(b),
      status: b.eligibility_status,
      reason,
      standing: s.standing,
      generation: s.rejectedAt?.generation ?? s.finding?.generation ?? null,
      detail: s.rejectedAt?.name ?? s.finding?.detail ?? '',
      rejectedAt: s.rejectedAt,
      recordedReason: b.deep_review_reason ?? null,
      registration_source: b.registration_source ?? null,
      created_at: b.created_at ?? null,
    })
  }
  return {
    scanned: bens.length,
    total: rows.length,
    byReason,
    byStanding,
    mistakes: rows.filter(r => MISTAKE_REASONS.has(r.reason)).length,
    rows,
  }
}
