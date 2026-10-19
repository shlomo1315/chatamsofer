import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

// סימון "הועבר בפועל בבנק" לזיכוי אחד (או ביטול הסימון). עריכה ביריד.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const body = await request.json().catch(() => null) as { transferred?: unknown } | null
  if (typeof body?.transferred !== 'boolean') return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const now = new Date().toISOString()
  const { data, error } = await db.from('book_fair_credits').update(body.transferred
    ? { transferred_at: now, transferred_by: staff.userId, updated_at: now }
    : { transferred_at: null, transferred_by: null, updated_at: now },
  ).eq('id', id).select('transferred_at').maybeSingle()
  if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 422 })
  if (!data) return NextResponse.json({ error: 'הזיכוי לא נמצא' }, { status: 404 })

  await logActivity(db, {
    userId: staff.userId, action: body.transferred ? 'book_fair_credits_transferred' : 'book_fair_credits_untransferred',
    entityType: 'book_fair_credits', entityId: id,
  })
  return NextResponse.json({ transferredAt: data.transferred_at })
}
