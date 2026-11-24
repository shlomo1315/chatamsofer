import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { loadApprovedRefStrict } from '@/lib/earlyLineageGate'
import { benName, RECHECK_RELEASE_ACTION, type RecheckBen } from '@/lib/deepReviewRecheck'
import { LINEAGE_FAULT_ACTION } from '@/lib/lineageFaultNotice'
import { AUDIT_GROUP_LABEL, auditFaultRecipient, type AuditGroup } from '@/lib/lineageFaultAudit'
import type { GapNode } from '@/lib/deepReviewGaps'

export const dynamic = 'force-dynamic'

// דוח קריאה בלבד: כל מי שקיבל את מייל "תקלה בסדר הדורות", מסווג לנשלח בצדק,
// נשלח בטעות ולא ברור. ראו lib/lineageFaultAudit. נפתח בדפדפן, בלי שום שינוי.

type LogRow = { entity_id: string | null; action: string; created_at: string; details: Record<string, unknown> | null }
type Ben = RecheckBen & { email: string | null }

export async function GET() {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const approved = await loadApprovedRefStrict(db)
  if (!approved) return NextResponse.json({ error: 'הקובץ המאושר לא נטען' }, { status: 500 })

  const logs = await fetchAllRows<LogRow>((f, t) => db.from('activity_log')
    .select('entity_id, action, created_at, details')
    .in('action', [LINEAGE_FAULT_ACTION, RECHECK_RELEASE_ACTION, 'lineage_review_applied'])
    .order('created_at').range(f, t))
  if (logs.error) return NextResponse.json({ error: logs.error }, { status: 500 })

  // השליחה הראשונה לכל משפחה, ואחריה ההסדרה והשחרור הראשונים
  const sentAt = new Map<string, string>()
  for (const l of logs.rows) if (l.action === LINEAGE_FAULT_ACTION && l.entity_id && !sentAt.has(l.entity_id)) sentAt.set(l.entity_id, l.created_at)
  const firstAfter = (action: string) => {
    const m = new Map<string, LogRow>()
    for (const l of logs.rows) {
      const s = l.entity_id ? sentAt.get(l.entity_id) : undefined
      if (l.action === action && s && l.created_at >= s && !m.has(l.entity_id!)) m.set(l.entity_id!, l)
    }
    return m
  }
  const applied = firstAfter('lineage_review_applied')
  const released = firstAfter(RECHECK_RELEASE_ACTION)

  const ids = [...sentAt.keys()]
  const bens: Ben[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('beneficiaries')
      .select('id, id_number, full_name, family_name, email, eligibility_status, deep_review_reason, lineage_node_id, lineage_chain, lineage_manual')
      .in('id', ids.slice(i, i + 200))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    bens.push(...(data ?? []) as Ben[])
  }
  const nodes = await fetchAllRows<GapNode>((f, t) => db.from('lineage_nodes').select('id, name, parent_id, generation').range(f, t))
  if (nodes.error) return NextResponse.json({ error: nodes.error }, { status: 500 })
  const byId = new Map(nodes.rows.map(n => [n.id, n]))

  const groups: Record<AuditGroup, unknown[]> = { justified: [], wrong_chain_ok: [], wrong_other_reason: [], unclear: [] }
  for (const ben of bens) {
    const a = applied.get(ben.id)
    const r = released.get(ben.id)
    const before = (a?.details?.before ?? {}) as { chain?: unknown; node_id?: string | null }
    const res = auditFaultRecipient({
      ben,
      applied: a ? { before: { chain: before.chain ?? null, node_id: before.node_id ?? null } } : null,
      released: r ? { prevReason: (r.details?.prevReason as string | null) ?? null } : null,
    }, byId, approved)
    groups[res.group].push({
      id: ben.id, name: benName(ben), email: ben.email, sentAt: sentAt.get(ben.id),
      statusNow: ben.eligibility_status, why: res.why,
      appliedViaLink: !!a, releasedByRecheck: !!r,
    })
  }

  return NextResponse.json({
    total: bens.length,
    counts: Object.fromEntries(Object.entries(groups).map(([k, v]) => [AUDIT_GROUP_LABEL[k as AuditGroup], v.length])),
    ...groups,
  })
}
