// ─────────────────────────────────────────────────────────────────────────────
// קליטה אוטומטית של בקשת תיקון סדר דורות.
//
// 🔴 בקשת תיקון היא *רישום מחדש*, לא בקשה לאישור. עד כה כל בקשה המתינה
// לאישור ידני, ו-158 בקשות נערמו מ-16.08 בלי שאיש ידע עליהן — המשפחה
// תיקנה, והתיקון לא הגיע לשום מקום.
//
// 🔴 אחרי הקליטה הכרטסת חוזרת למסלול הרגיל:
//   שרשרת רציפה  → 'pending'      (ממתין לאישור ראשוני)
//   דילוג דורות  → 'deep_review'  (בדיקה מעמיקה)
//
// ⚠️ סטטוס הצמתים אינו קריטריון — ראו lib/lineageChainHealth: 96% מהעץ
// מסומן pending משום שאיש לא עבר עליו.
//
// ⚠️ מצב מעורפל (שני צמתים באותו שם תחת אותו אב) *אינו* נקלט: applyChain
// זורקת, והבקשה נשארת להכרעה ידנית. ניחוש היה מחבר משפחה לענף שאינו שלה
// — בדיוק הטעות שהיא ביקשה לתקן.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { chainHasGap, statusAfterFix, type ChainNode } from './lineageChainHealth'
import { fetchAllRows } from './fetchAllRows'

export interface FixChainRow {
  generation: number
  name: string
  relation?: string | null
}

export interface AutoFixResult {
  /** האם השרשרת הוחלה על העץ. */
  applied: boolean
  /** האם הכרטסת נשלחה לבדיקה מעמיקה (דילוג דורות). */
  needsReview: boolean
  /** הצומת שאליו חובר המוטב. */
  nodeId: string | null
}

/**
 * מחילה את השרשרת שהמשפחה מסרה, ומחזירה את הכרטסת למסלול.
 *
 * ⚠️ זורקת כשההחלה בלתי אפשרית (עמימות) — הקורא מטפל ומשאיר את הבקשה
 * לטיפול ידני.
 */
export async function autoApplyLineageFix(
  admin: SupabaseClient,
  beneficiaryId: string,
  chain: FixChainRow[],
): Promise<AutoFixResult> {
  const { applyChain } = await import('@/app/api/admin/lineage/requests/route')
  const res = await applyChain(admin, beneficiaryId, chain)
  const nodeId = res.movedTo

  // ── לאן הכרטסת חוזרת ──
  // ⚠️ נקרא מהעץ *אחרי* ההחלה: applyChain יוצרת צמתים חדשים, והבדיקה
  // חייבת לרוץ על המצב שנוצר ולא על זה שקדם לו.
  let needsReview = false
  if (nodeId) {
    const { rows } = await fetchAllRows<ChainNode>((from, to) =>
      admin.from('lineage_nodes').select('id, parent_id, generation').range(from, to))
    needsReview = chainHasGap(nodeId, new Map(rows.map(n => [n.id, n])))
  }

  // ⚠️ 'rejected' אינו נדרס: משפחה שנדחתה במפורש אינה חוזרת להמתנה רק
  // משום שתיקנה ייחוס. ההחלטה הזו היא של המשרד ולא של המבקש.
  const { data: cur } = await admin
    .from('beneficiaries').select('eligibility_status').eq('id', beneficiaryId).maybeSingle()
  const status = (cur as { eligibility_status?: string } | null)?.eligibility_status ?? ''
  if (status !== 'rejected' && status !== 'approved') {
    await admin.from('beneficiaries')
      .update({ eligibility_status: statusAfterFix(needsReview) })
      .eq('id', beneficiaryId)
  }

  console.log(`[lineage-autofix] ben=${beneficiaryId} node=${nodeId} gap=${needsReview}`)
  return { applied: true, needsReview, nodeId }
}
