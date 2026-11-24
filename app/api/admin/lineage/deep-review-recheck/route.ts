import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { loadApprovedRefStrict } from '@/lib/earlyLineageGate'
import { planDeepReviewRecheck, benName, RECHECK_RELEASE_ACTION, type RecheckBen } from '@/lib/deepReviewRecheck'
import { logActivity } from '@/lib/activityLog'
import type { GapNode } from '@/lib/deepReviewGaps'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// חישוב מחדש של כל המשפחות בבדיקה מעמיקה: מי שסדר הדורות שלה תקין עכשיו
// עוברת ל"ממתין", והשאר מקבלות סיבה מעודכנת. ראו lib/deepReviewRecheck.
//
// 🔴 בלי { apply: true } — תצוגה מקדימה בלבד, בלי שום שינוי במסד.
// ⚠️ הקובץ המאושר נטען ישירות (loadApprovedRefStrict): כשל בטעינה עוצר הכול,
// אחרת היה משחרר את כולם בשקט.
// ⚠️ העדכון מותנה ב-eligibility_status='deep_review', כדי לא לדרוס סטטוס
// שמישהו שינה בין התצוגה להחלה.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { apply?: boolean } = {}
  try { body = await request.json() } catch { /* בלי גוף = תצוגה מקדימה */ }

  const approved = await loadApprovedRefStrict(db)
  if (!approved) return NextResponse.json({ error: 'הקובץ המאושר לא נטען — לא בוצע שום שינוי' }, { status: 500 })

  const [nodes, bens] = await Promise.all([
    fetchAllRows<GapNode>((f, t) => db.from('lineage_nodes').select('id, name, parent_id, generation').range(f, t)),
    fetchAllRows<RecheckBen>((f, t) => db.from('beneficiaries')
      .select('id, id_number, full_name, family_name, eligibility_status, deep_review_reason, lineage_node_id, lineage_chain, lineage_manual')
      .eq('eligibility_status', 'deep_review').order('id').range(f, t)),
  ])
  const loadError = nodes.error || bens.error
  if (loadError) return NextResponse.json({ error: `טעינה נכשלה: ${loadError}` }, { status: 500 })

  const plan = planDeepReviewRecheck(bens.rows, new Map(nodes.rows.map(n => [n.id, n])), approved)
  const people = (rows: RecheckBen[]) => rows.map(b => ({ id: b.id, name: benName(b), reason: b.deep_review_reason ?? null }))
  const summary = {
    total: bens.rows.length,
    release: people(plan.release),
    reasonUpdate: plan.reasonUpdate.length,
    stillDeep: plan.reasonUpdate.length + plan.unchanged.length,
    manual: people(plan.manual),
  }

  if (body.apply !== true) return NextResponse.json({ dryRun: true, ...summary })

  const now = new Date().toISOString()
  let released = 0, reasonsUpdated = 0
  const failed: { name: string; error: string }[] = []
  for (const b of plan.release) {
    const { error } = await db.from('beneficiaries')
      .update({ eligibility_status: 'pending', deep_review_reason: null, updated_at: now })
      .eq('id', b.id).eq('eligibility_status', 'deep_review')
    if (error) { failed.push({ name: benName(b), error: error.message }); continue }
    released++
    await logActivity(db, {
      userId: staff.userId, action: RECHECK_RELEASE_ACTION, entityType: 'beneficiary', entityId: b.id,
      details: { prevReason: b.deep_review_reason ?? null },
    })
  }
  for (const { ben, reason } of plan.reasonUpdate) {
    const { error } = await db.from('beneficiaries')
      .update({ deep_review_reason: reason, updated_at: now })
      .eq('id', ben.id).eq('eligibility_status', 'deep_review')
    if (error) { failed.push({ name: benName(ben), error: error.message }); continue }
    reasonsUpdated++
  }
  return NextResponse.json({ dryRun: false, ...summary, released, reasonsUpdated, failed })
}
