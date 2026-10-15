import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

// טיפול בפניות המפיצים: סימון כטופל או כנדחה. אישור תוספת/הפחתה מעדכן את הכמות.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PATCH { id, status: 'done' | 'rejected' }
export async function PATCH(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' && UUID_RE.test(body.id) ? body.id : null
  const status = body?.status === 'done' || body?.status === 'rejected' ? body.status : null
  if (!id || !status) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const now = new Date().toISOString()
  // ⚠️ מותנה ב-status=open: לחיצה כפולה לא תאשר פעמיים
  const { data, error } = await db.from('gilyonot_distributor_events')
    .update({ status, handled_by: staff.userId, handled_at: now })
    .eq('id', id).eq('status', 'open').select('distributor_id, kind, quantity')
  if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  const ev = data?.[0]
  if (!ev) return NextResponse.json({ error: 'הפנייה כבר טופלה' }, { status: 409 })

  let quantity: number | null = null
  if (status === 'done' && (ev.kind === 'increase' || ev.kind === 'decrease') && ev.quantity !== null) {
    const { error: qErr } = await db.from('gilyonot_distributors').update({ quantity: ev.quantity, updated_at: now }).eq('id', ev.distributor_id)
    if (qErr) {
      await db.from('gilyonot_distributor_events').update({ status: 'open', handled_by: null, handled_at: null }).eq('id', id)
      return NextResponse.json({ error: 'עדכון הכמות נכשל' }, { status: 500 })
    }
    quantity = ev.quantity
  }
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_distributor_event', entityType: 'gilyonot_distributor', details: { id, kind: ev.kind, status, quantity } })
  return NextResponse.json({ ok: true, distributorId: ev.distributor_id, quantity })
}
