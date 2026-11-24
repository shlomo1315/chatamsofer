// ─────────────────────────────────────────────────────────────────────────────
// חישוב מחדש מרוכז לכל המשפחות בבדיקה מעמיקה (שלמה, 24.11).
//
// אותו שער כמו ברישום, בעריכה ובשיוך (classifyLineage: שם, דור והורה מול
// הקובץ המאושר), על המצב השמור של כל כרטסת:
//   עוברת  → 'pending' והסיבה נמחקת (מי שהסדיר היום את סדר הדורות).
//   נכשלת  → נשארת בבדיקה מעמיקה, והסיבה מתעדכנת למצב הנוכחי.
//
// 🔴 כרטסת שהסיבה שלה הוקלדה ע"י המזכירות (לא נכתבה ע"י השער) לא נוגעים בה:
// היא בבדיקה מעמיקה מסיבה אחרת, ותקינות הדורות לא משחררת אותה.
//
// כאן רק החלוקה הטהורה, כדי שתיבדק בלי מסד. הנתיב:
// /api/admin/lineage/deep-review-recheck
// ─────────────────────────────────────────────────────────────────────────────

import type { ApprovedRefTreeLookup } from './lineageApprovedRef'
import { classifyLineage, type GapBen, type GapNode } from './deepReviewGaps'
import { gateReasonOf, isAutoDeepReason } from './earlyLineageGate'

/** נרשם ב-activity_log לכל כרטסת ששוחררה ל"ממתין" בחישוב המרוכז. */
export const RECHECK_RELEASE_ACTION = 'deep_review_recheck_released'

export type RecheckBen = GapBen & { deep_review_reason: string | null }

export interface RecheckPlan {
  /** עוברות את הבדיקה: יעברו ל"ממתין". */
  release: RecheckBen[]
  /** נשארות בבדיקה מעמיקה, והסיבה השמורה שונה מהמצב הנוכחי. */
  reasonUpdate: { ben: RecheckBen; reason: string }[]
  /** נשארות בבדיקה מעמיקה, והסיבה כבר נכונה. */
  unchanged: RecheckBen[]
  /** בבדיקה מעמיקה מסיבה שהמזכירות הקלידה: לא נוגעים. */
  manual: RecheckBen[]
}

export function planDeepReviewRecheck(
  bens: RecheckBen[],
  byId: Map<string, GapNode>,
  approved: ApprovedRefTreeLookup,
): RecheckPlan {
  const plan: RecheckPlan = { release: [], reasonUpdate: [], unchanged: [], manual: [] }
  for (const b of bens) {
    if (b.eligibility_status !== 'deep_review') continue
    const cur = String(b.deep_review_reason ?? '').trim()
    if (cur && !isAutoDeepReason(cur)) { plan.manual.push(b); continue }
    const finding = classifyLineage(b, byId, approved)
    if (!finding) { plan.release.push(b); continue }
    const reason = gateReasonOf(finding)
    if (reason === cur) plan.unchanged.push(b)
    else plan.reasonUpdate.push({ ben: b, reason })
  }
  return plan
}

/** שם לתצוגה: משפחה ואז פרטי. */
export const benName = (b: { family_name: string | null; full_name: string | null }) =>
  [b.family_name, b.full_name].map(s => String(s ?? '').trim()).filter(Boolean).join(' ') || '(ללא שם)'
