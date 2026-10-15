import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

// בקשות לסעודת ההילולא: אישור, דחייה או החזרה להמתנה.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUSES = ['pending', 'approved', 'rejected'] as const

// PATCH { id, status: 'pending' | 'approved' | 'rejected' }
export async function PATCH(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' && UUID_RE.test(body.id) ? body.id : null
  const status = STATUSES.find(s => s === body?.status) ?? null
  if (!id || !status) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const now = new Date().toISOString()
  const pending = status === 'pending'
  const { data, error } = await db.from('gilyonot_hilula_requests')
    .update({ status, handled_by: pending ? null : staff.userId, handled_at: pending ? null : now, updated_at: now })
    .eq('id', id).select('id')
  // 23505: החזרה להמתנה כשכבר יש בקשה ממתינה אחרת מאותו טלפון
  if (error?.code === '23505') return NextResponse.json({ error: 'יש כבר בקשה ממתינה מאותו טלפון' }, { status: 409 })
  if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_hilula_request', entityType: 'gilyonot_distributor', details: { id, status } })
  return NextResponse.json({ ok: true, status, handled_at: pending ? null : now })
}
