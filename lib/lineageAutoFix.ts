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
import { generationsStatus, registrantGeneration, tooFewGenerations } from './minGenerations'

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
  /** האם השרשרת המתוקנת עדיין מכילה פחות משבעה דורות (נשאר נדחה). */
  tooFew: boolean
  /** הדור של הנרשם לפי השרשרת המתוקנת. */
  generation: number | null
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
  // 🔴 גם דורות 2–5 מול הקובץ המאושר (24.11) — לא רק דילוג. כשל בבדיקה,
  // או שרשרת שלא חוברה לצומת, = בדיקה מעמיקה. ראו lib/earlyLineageGate.
  if (!needsReview) {
    const { earlyLineageGate } = await import('./earlyLineageGate')
    needsReview = (await earlyLineageGate(admin, { lineage_node_id: nodeId })).deep
  }

  const { data: cur } = await admin
    .from('beneficiaries').select('eligibility_status, deep_review_reason').eq('id', beneficiaryId).maybeSingle()
  const row = cur as { eligibility_status?: string; deep_review_reason?: string | null } | null
  const status = row?.eligibility_status ?? ''

  // 🔴 שבעה דורות לפחות (lib/minGenerations): פחות → נדחה; מי שנדחה רק בגלל
  // זה ותיקן כראוי → חוזר ל"ממתין" (או לבדיקה מעמיקה כשהשער נכשל).
  const generation = registrantGeneration(chain)
  const tooFew = tooFewGenerations(generation)
  const byRule = await generationsStatus(
    { status, reason: row?.deep_review_reason }, generation,
    async () => ({ deep: needsReview, reason: needsReview ? 'סדר הדורות אחרי התיקון לא תואם את הקובץ' : null }),
  )
  if (byRule) {
    await admin.from('beneficiaries').update(byRule).eq('id', beneficiaryId)
  } else if (status !== 'rejected' && status !== 'approved') {
    // ⚠️ 'rejected' אינו נדרס: משפחה שנדחתה במפורש אינה חוזרת להמתנה רק
    // משום שתיקנה ייחוס. ההחלטה הזו היא של המשרד ולא של המבקש.
    await admin.from('beneficiaries')
      .update({ eligibility_status: statusAfterFix(needsReview) })
      .eq('id', beneficiaryId)
  }

  console.log(`[lineage-autofix] ben=${beneficiaryId} node=${nodeId} gap=${needsReview}`)
  return { applied: true, needsReview, nodeId, tooFew, generation }
}
