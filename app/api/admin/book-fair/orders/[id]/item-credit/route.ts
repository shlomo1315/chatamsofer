import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

// סימון ידני של ספר שזוכה בשורת הזמנה (POST) וביטולו (DELETE).
// ברמת מערכת ההזמנות בלבד: בלי כסף ובלי מלאי. ראו lib/bookFairItemCredits.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function parse(request: NextRequest): Promise<{ itemId: string; quantity: number } | NextResponse> {
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 }) }
  const itemId = String(body.itemId ?? '')
  if (!UUID_RE.test(itemId)) return NextResponse.json({ error: 'מזהה שורה לא תקין' }, { status: 400 })
  return { itemId, quantity: Number(body.quantity ?? 1) }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { id } = await params
  const p = await parse(request)
  if (p instanceof NextResponse) return p

  const [{ data: order }, { data: item }] = await Promise.all([
    db.from('book_fair_orders').select('id, order_number, status').eq('id', id).maybeSingle(),
    db.from('book_fair_order_items').select('id, order_id, book_id, quantity').eq('id', p.itemId).maybeSingle(),
  ])
  if (!order || !item || item.order_id !== order.id) return NextResponse.json({ error: 'השורה לא נמצאה בהזמנה' }, { status: 404 })
  if (!Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > item.quantity) {
    return NextResponse.json({ error: `הכמות חייבת להיות בין 1 ל-${item.quantity}` }, { status: 400 })
  }

  const { error } = await db.from('book_fair_item_credits').upsert({
    order_id: order.id, item_id: item.id, order_number: order.order_number, book_id: item.book_id,
    quantity: p.quantity, source: 'manual', created_by: staff.userId,
  }, { onConflict: 'item_id' })
  if (error) {
    console.error('[book-fair/item-credit] save failed', error.code)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 422 })
  }
  await logActivity(db, { userId: staff.userId, action: 'book_fair_item_credit_set', entityType: 'book_fair_orders', entityId: order.id, details: { itemId: item.id, quantity: p.quantity } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { id } = await params
  const p = await parse(request)
  if (p instanceof NextResponse) return p

  const { error } = await db.from('book_fair_item_credits').delete().eq('order_id', id).eq('item_id', p.itemId)
  if (error) {
    console.error('[book-fair/item-credit] delete failed', error.code)
    return NextResponse.json({ error: 'הביטול נכשל' }, { status: 422 })
  }
  await logActivity(db, { userId: staff.userId, action: 'book_fair_item_credit_removed', entityType: 'book_fair_orders', entityId: id, details: { itemId: p.itemId } })
  return NextResponse.json({ ok: true })
}
