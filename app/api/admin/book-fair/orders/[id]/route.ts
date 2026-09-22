import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import type { BookFairOrderStatus } from '@/types/bookFair'

// עדכון הזמנה: סטטוס, כתובת שאומתה מההקלטה, והערות.
//
// 🔴 הסכומים אינם ניתנים לעריכה כאן. הם נצרבו בעת ההזמנה וזה מה שנגבה
// בפועל; שינוי בדיעבד היה מנתק בין מה שהמערכת מציגה לבין מה שהלקוח
// חויב. זיכוי מתבצע בנתיב הזיכוי, ומתועד כתנועה נפרדת.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * מעברי סטטוס מותרים.
 *
 * ⚠️ הטבלה אינה קישוט: בלעדיה אפשר לסמן "נמסר" על הזמנה שטרם שולמה,
 * ואז היא נעלמת מכל תור עבודה בלי שאיש הכין אותה.
 */
const ALLOWED_NEXT: Partial<Record<BookFairOrderStatus, BookFairOrderStatus[]>> = {
  pending_payment:  ['cancelled', 'failed'],
  payment_mismatch: ['paid', 'cancelled'],
  paid:             ['picking', 'cancelled'],
  picking:          ['packed', 'paid', 'cancelled'],
  packed:           ['shipped', 'delivered', 'picking'],
  shipped:          ['delivered', 'packed'],
  delivered:        [],
  failed:           ['cancelled'],
}

/**
 * 🔴 סטטוסי הזיכוי אינם מעבר סטטוס — הם תוצאה של פעולה כספית.
 *
 * ⚠️ עד היום הם היו ברשימה למעלה, וזה היה באג כסף שקט: לחיצה על
 * "זוכה" שינתה את הסטטוס בלבד, refunded_agorot נשאר 0, וההכנסות
 * בלוח הבקרה (total - refunded) המשיכו לספור את הסכום המלא. ההזמנה
 * נראתה מזוכה ואיש לא ידע שהדוח שגוי.
 *
 * הדרך היחידה אליהם היא POST /refund, שמזכה אצל הספק, כותב את הסכום
 * ומחזיר מלאי — ומגיע לסטטוס הזה בעצמו.
 */
const REFUND_ONLY: BookFairOrderStatus[] = ['refunded', 'partially_refunded']

function clean(v: unknown): string {
  return String(v ?? '').replace(/[‎‏‪-‮⁦-⁩]/g, '').trim()
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { id } = await params
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const { data: order } = await db.from('book_fair_orders')
    .select('id, order_number, status, delivery_method').eq('id', id).maybeSingle()
  if (!order) return NextResponse.json({ error: 'ההזמנה לא נמצאה' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  const current = order.status as BookFairOrderStatus

  // ── שינוי סטטוס ──
  if (body.status !== undefined) {
    const next = String(body.status) as BookFairOrderStatus
    if (next !== current) {
      // ⚠️ הודעה נפרדת ומכוונת לזיכוי: "לא ניתן לעבור" היה נקרא כתקלה
      // ומסתיר את העובדה שיש מסלול תקין אחר.
      if (REFUND_ONLY.includes(next)) {
        return NextResponse.json({
          error: 'סימון זיכוי אינו שינוי סטטוס — השתמשו בפעולת הזיכוי, שמחזירה את הכסף ורושמת את הסכום.',
        }, { status: 400 })
      }
      const allowed = ALLOWED_NEXT[current] ?? []
      if (!allowed.includes(next)) {
        return NextResponse.json({
          error: `לא ניתן לעבור מ"${current}" ל"${next}"`,
        }, { status: 400 })
      }
      patch.status = next
    }
  }

  // ── כתובת שאומתה מההקלטה ──
  if (body.address_text !== undefined) {
    const addr = clean(body.address_text)
    if (order.delivery_method !== 'shipping') {
      return NextResponse.json({ error: 'הזמנה לאיסוף עצמי אינה כוללת כתובת' }, { status: 400 })
    }
    if (addr.length < 5) {
      return NextResponse.json({ error: 'כתובת קצרה מדי' }, { status: 400 })
    }
    patch.address_text = addr
  }

  if (body.city_id !== undefined) patch.city_id = body.city_id || null

  // 🔴 האימות הוא פעולה מפורשת ונפרדת מהעריכה: מי שמקליד כתובת
  // מההקלטה עשוי לשמור טיוטה ולחזור, ורק כשהוא בטוח מסמן "אומת".
  // סימון אוטומטי בשמירה היה מוציא מהתור הזמנות שטרם נבדקו.
  if (body.address_confirmed !== undefined) {
    patch.address_confirmed = body.address_confirmed === true
  }

  if (body.notes !== undefined) patch.notes = clean(body.notes) || null

  // 🔴 חסימה מפורשת: ניסיון לערוך סכום נדחה ואינו מתעלם בשקט.
  for (const k of ['total_agorot', 'items_total_agorot', 'shipping_agorot', 'refunded_agorot']) {
    if (body[k] !== undefined) {
      return NextResponse.json({
        error: 'סכומי ההזמנה נצרבו בעת הרכישה ואינם ניתנים לעריכה. לזיכוי השתמשו במסך הזיכוי.',
      }, { status: 400 })
    }
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
  }

  const { error } = await db.from('book_fair_orders').update(patch).eq('id', id)
  if (error) {
    console.error('[book-fair/orders] update failed:', error)
    return NextResponse.json({ error: 'עדכון ההזמנה נכשל' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'book_fair_order',
    entityId: id, details: { order: order.order_number, fields: Object.keys(patch) },
  })

  return NextResponse.json({ ok: true })
}
