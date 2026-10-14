import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { KVITEL_STATUSES, type KvitelStatus } from '@/lib/kvitel'

// עדכון סטטוס לבקשה אחת או לכמה יחד (app/admin/kvitel).
// PATCH { ids: uuid[], status } — "בוצע" רושם מתי ומי; חזרה ממנו מנקה.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 500

export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('kvitel', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown> | null = null
  try { body = await request.json() } catch { /* נבדק מיד */ }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 })

  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)))] : []
  const status = String(body.status ?? '') as KvitelStatus
  if (!ids.length || ids.length > MAX_IDS) return NextResponse.json({ error: 'לא נבחרו בקשות' }, { status: 400 })
  if (!(status in KVITEL_STATUSES)) return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 })

  const done = status === 'done'
  const { data, error } = await db.from('kvitel_requests')
    .update({ status, done_at: done ? new Date().toISOString() : null, done_by: done ? staff.userId : null })
    .in('id', ids)
    .select('id')
  if (error) {
    console.error('[kvitel] status update failed:', error)
    return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'kvitel_status', entityType: 'kvitel_request',
    entityId: ids.length === 1 ? ids[0] : null, details: { status, count: data?.length ?? 0, ids },
  })
  return NextResponse.json({ ok: true, updated: data?.length ?? 0 })
}
