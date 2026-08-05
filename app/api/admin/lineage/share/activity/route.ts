import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { NODE_SELECT, resyncSubtree, approveVerifiedBeneficiaries, invalidateLineageCache, type TreeNodeRow } from '@/lib/lineageSync'

export const dynamic = 'force-dynamic'

// היסטוריית הפעולות של בן משפחה דרך הזמנת שיתוף, + ביטול פעולה ספציפית.
//   GET  ?token=... → כל הפעולות (אישור/דחייה/תיקון) שבוצעו דרך ההזמנה, מהחדש לישן.
//   POST { activityId } → מבטל פעולה ספציפית — מחזיר את הצומת למצבו הקודם.

const FAMILY_ACTIONS = ['lineage_node_family_verified', 'lineage_node_family_rejected', 'lineage_node_family_renamed']

export async function GET(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'חסר טוקן' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  // כל הפעולות מסוג "בן משפחה" (user_id=null), ואז סינון לפי shareToken שב-details
  const { data } = await admin
    .from('activity_log')
    .select('id, action, entity_id, details, created_at')
    .in('action', FAMILY_ACTIONS)
    .order('created_at', { ascending: false })
    .limit(500)

  const rows = (data ?? []).filter(r => {
    const d = r.details as { shareToken?: string } | null
    return d?.shareToken === token
  })

  // האם כבר בוטלה — מסומן ב-details.undone_at (אחרי ביטול)
  const activity = rows.map(r => {
    const d = (r.details ?? {}) as Record<string, unknown>
    return {
      id: r.id,
      action: r.action,
      nodeId: r.entity_id,
      createdAt: r.created_at,
      previousName: d.previousName ?? null,
      newName: d.newName ?? null,
      previousStatus: d.previousStatus ?? null,
      newStatus: d.newStatus ?? null,
      undoneAt: d.undone_at ?? null,
    }
  })

  return NextResponse.json({ activity })
}

// ביטול פעולה ספציפית — מחזיר את הצומת למצבו הקודם (previousStatus / previousName).
export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  let body: { activityId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.activityId) return NextResponse.json({ error: 'חסר מזהה פעולה' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const { data: entry } = await admin
    .from('activity_log')
    .select('id, action, entity_id, details')
    .eq('id', body.activityId)
    .maybeSingle()
  if (!entry || !FAMILY_ACTIONS.includes(entry.action)) return NextResponse.json({ error: 'הפעולה לא נמצאה' }, { status: 404 })

  const d = (entry.details ?? {}) as Record<string, unknown>
  if (d.undone_at) return NextResponse.json({ error: 'הפעולה כבר בוטלה' }, { status: 400 })

  const nodeId = entry.entity_id as string
  // שחזור המצב הקודם: שם או סטטוס, לפי סוג הפעולה
  const restore: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (entry.action === 'lineage_node_family_renamed') {
    restore.name = d.previousName ?? null
  } else {
    restore.status = d.previousStatus ?? 'pending'
  }

  const { error } = await admin.from('lineage_nodes').update(restore).eq('id', nodeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  invalidateLineageCache()

  // סנכרון מחדש לאגפים (הצומת חזר למצבו הקודם)
  try {
    const fresh = (await admin.from('lineage_nodes').select(NODE_SELECT).limit(100000)).data as TreeNodeRow[] | null
    if (fresh) {
      await resyncSubtree(admin, fresh, nodeId)
      if (restore.status === 'verified') await approveVerifiedBeneficiaries(admin, fresh, nodeId)
    }
  } catch (e) { console.error('[share-activity-undo] sync failed:', e) }

  // סימון הפעולה כמבוטלת (ב-details) + רישום פעולת הביטול
  await admin.from('activity_log').update({ details: { ...d, undone_at: new Date().toISOString(), undone_by: staff.userId } }).eq('id', entry.id)
  await logActivity(admin, {
    userId: staff.userId, action: 'lineage_node_family_action_undone',
    entityType: 'lineage_node', entityId: nodeId,
    details: { originalActivityId: entry.id, originalAction: entry.action },
  })

  return NextResponse.json({ ok: true })
}
