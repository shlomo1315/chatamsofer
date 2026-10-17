import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { nextOrderNumber } from '@/lib/bookFairCheckout'
import { signPublicToken } from '@/lib/publicToken'
import { parseOfficeOrder, type OfficeOrderInput } from '@/lib/bookFairOfficeOrder'
import { logActivity } from '@/lib/activityLog'

// ─────────────────────────────────────────────────────────────────────────────
// הזמנת משרד — משלוח בלי תשלום (בקשת המשתמש 13.10).
//
// 🔴 חבילות שכבר נארזו ידנית צריכות מספר הזמנה כדי לצאת למשלוח: תעודה,
// רשימת כתובות למשלוחן ודף מעקב. ההזמנה נפתחת ישר בסטטוס "נארז".
//
// ⚠️ בלי שורות ספרים ובלי שריון מלאי: הספרים כבר ארוזים פיזית, ותוכן
// החבילה נרשם בהערות. ⚠️ סכום 0 ו-paid_at ריק — לא נגבה כסף, וההזמנה
// אינה נכנסת להכנסות או לסטטיסטיקת המכירות (ערוץ 'office').
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const body = await request.json().catch(() => ({})) as OfficeOrderInput
  const parsed = parseOfficeOrder(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { name, phone, email, cityId, address, notes } = parsed.value

  // ⚠️ העיר מהרשימה הסגורה — אותה רשימה שהמשלוחן עובד לפיה.
  const { data: city } = await db.from('book_fair_cities').select('id').eq('id', cityId).maybeSingle()
  if (!city) return NextResponse.json({ error: 'העיר אינה ברשימת המשלוחים' }, { status: 400 })

  // ⚠️ מאותו רצף כמו אתר/טלפון/דוכן — מספר אחד שהמשרד מחפש בו.
  const orderNumber = await nextOrderNumber(db)

  const { data: order, error } = await db.from('book_fair_orders').insert({
    order_number: orderNumber,
    channel: 'office',
    status: 'packed',
    customer_name: name,
    customer_phone: phone,
    customer_email: email,
    delivery_method: 'shipping',
    city_id: cityId,
    address_text: address,
    // ⚠️ הוזנה ביד על ידי הצוות — אין מה לאמת מול הקלטה.
    address_confirmed: true,
    items_total_agorot: 0,
    shipping_agorot: 0,
    total_agorot: 0,
    notes,
    created_by: staff.userId,
  }).select('id, order_number').single()

  if (error || !order) {
    console.error('[book-fair/office-order] insert failed:', error)
    return NextResponse.json({ error: 'יצירת ההזמנה נכשלה' }, { status: 500 })
  }

  // ⚠️ אסימון חתום ולא מזהה גולמי — ראו lib/publicToken.
  await db.from('book_fair_orders')
    .update({ tracking_token: signPublicToken('f', order.id) })
    .eq('id', order.id)

  await logActivity(db, {
    userId: staff.userId, action: 'book_fair_office_order', entityType: 'book_fair_order',
    entityId: order.id, details: { order_number: order.order_number },
  })

  return NextResponse.json({ id: order.id, order_number: order.order_number })
}
