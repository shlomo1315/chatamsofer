import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { resyncSubtree, invalidateLineageCache, NODE_SELECT, type TreeNodeRow } from '@/lib/lineageSync'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'

// ביטול פסילה מסולם הדורות: מחזיר כל צומת בענף לסטטוס שהיה לו לפני הפסילה.
// PATCH הרגיל לא מתאים כאן, כי פסילה היא מפל (cascadeRejectSubtree) וחזרה
// ממנה אינה מפל. המסך שולח את הרשימה המדויקת שהוא שמר לפני הפסילה.
// נוגעים רק בצמתים שכרגע פסולים, כדי לא לדרוס החלטה שהתקבלה בינתיים.
const MAX_ITEMS = 5000

export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  const body = await request.json().catch(() => null)
  const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
  const items: unknown = body?.items
  if (!rootId || !Array.isArray(items) || !items.length || items.length > MAX_ITEMS) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const byStatus: Record<'verified' | 'pending', string[]> = { verified: [], pending: [] }
  for (const it of items as { id?: unknown; status?: unknown }[]) {
    if (typeof it?.id !== 'string' || (it.status !== 'verified' && it.status !== 'pending')) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }
    byStatus[it.status].push(it.id)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })
  const admin = createClient(url, key)

  let restored = 0
  for (const status of ['verified', 'pending'] as const) {
    const ids = byStatus[status]
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await admin.from('lineage_nodes').update({ status })
        .in('id', ids.slice(i, i + 200)).eq('status', 'rejected').select('id')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      restored += data?.length ?? 0
    }
  }

  const { rows } = await fetchAllRows<TreeNodeRow>((from, to) =>
    admin.from('lineage_nodes').select(NODE_SELECT).range(from, to),
  )
  if (rows.length) await resyncSubtree(admin, rows as TreeNodeRow[], rootId)
  await logActivity(admin, {
    userId: staff.userId, action: 'lineage_reject_undone',
    entityType: 'lineage_node', entityId: rootId, details: { count: restored },
  }).catch(() => {})
  invalidateLineageCache()

  return NextResponse.json({ restored })
}
