import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { bookFairStatusUpdateEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
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

  // ── מייל עדכון סטטוס ללקוח ──
  //
  // 🔴 עד כה הלקוח קיבל אישור תשלום ואז שתיקה מוחלטת עד שהחבילה
  // הגיעה. כל שינוי משמעותי נשלח אליו עכשיו.
  //
  // ⚠️ רק סטטוסים שיש בהם מה לבשר: 'paid' כבר מכוסה במייל האישור,
  // וכישלון/ביטול/זיכוי דורשים שיחה ולא מייל אוטומטי.
  //
  // ⚠️ אינו חוסם את התשובה: המשרד לא אמור להמתין לשרת מייל, וכשל
  // בשליחה אינו הופך עדכון סטטוס שבוצע לכישלון.
  const MAILED: BookFairOrderStatus[] = ['picking', 'packed', 'shipped', 'delivered']
  if (patch.status && MAILED.includes(patch.status as BookFairOrderStatus)) {
    void (async () => {
      try {
        const { data: full } = await db.from('book_fair_orders')
          .select('order_number, customer_name, customer_email, delivery_method, tracking_token')
          .eq('id', id).maybeSingle()
        if (!full?.customer_email) return

        await ensureEmailTexts()
        const mail = bookFairStatusUpdateEmail({
          orderNumber: full.order_number as string,
          customerName: full.customer_name as string | null,
          status: patch.status as BookFairOrderStatus,
          deliveryMethod: full.delivery_method === 'pickup' ? 'pickup' : 'shipping',
          trackingToken: full.tracking_token as string | null,
        })
        const sent = await deliverMail(
          full.customer_email as string, mail.subject, mail.html, undefined,
          { ...mailFor('yerid'), transactional: true },
        )
        if (!sent.ok) {
          console.error(`[book-fair/orders] מייל סטטוס ל-${full.order_number} נכשל:`, sent.error)
        }
      } catch (e) {
        console.error('[book-fair/orders] מייל סטטוס נכשל:', e)
      }
    })()
  }

  return NextResponse.json({ ok: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מחיקת הזמנה — להסרת הזמנות בדיקה שגזלו מהמלאי האמיתי.
//
// ⚠️ המלאי מוחזר *לפני* המחיקה: אחרי שהשורות נמחקו אין עוד דרך לדעת
// אילו ספרים ובאיזו כמות, והעותקים היו נשארים חסרים לנצח.
//
// ⚠️ מוחזר רק לספר מוגבל-מלאי: ל"ללא הגבלה" אין מונה, והגדלתו הייתה
// יוצרת מספר שאינו אומר דבר.
//
// ⚠️ מחיקה ולא ביטול: שורה "מבוטלת" היא עדות למשהו שקרה, ואלו הזמנות
// בדיקה שלא היו אמורות להתקיים כלל.
//
// 🔴 הרשאת delete נדרשת, והפעולה מתועדת ב-activity log עם כל הפרטים —
// זו מחיקה בלתי הפיכה של רשומה כספית.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('book_fair', 'delete')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { id } = await params

  const { data: order } = await db.from('book_fair_orders')
    .select('id, order_number, status, channel, total_agorot, customer_name')
    .eq('id', id).maybeSingle()

  if (!order) return NextResponse.json({ error: 'ההזמנה לא נמצאה' }, { status: 404 })

  // ── 1. החזרת המלאי ──
  const { data: items } = await db.from('book_fair_order_items')
    .select('book_id, quantity, title_snapshot').eq('order_id', id)

  const restored: string[] = []
  const channel = order.channel === 'phone' ? 'phone' : 'web'

  for (const it of items ?? []) {
    if (!it.book_id) continue   // ספר שנמחק מהקטלוג — אין למה להחזיר

    // ⚠️ נבדק שהספר מוגבל-מלאי לפני ההחזרה.
    const { data: book } = await db.from('book_fair_books')
      .select('unlimited_stock, title').eq('id', it.book_id).maybeSingle()
    if (!book || book.unlimited_stock) continue

    const { error } = await db.rpc('book_fair_adjust_stock', {
      p_book_id: it.book_id,
      p_channel: channel,
      p_delta: it.quantity,
      p_reason: 'refund',
      p_note: `מחיקת הזמנה ${order.order_number}`,
      p_by: staff.userId,
    })
    // ⚠️ best-effort: כישלון החזרה אינו עוצר את המחיקה, אבל נרשם.
    if (error) console.error(`[book-fair/delete] החזרת מלאי נכשלה (${it.title_snapshot}):`, error.message)
    else restored.push(`${book.title} ×${it.quantity}`)
  }

  // ── 2. שחרור שריונים פתוחים ──
  const { data: res } = await db.from('book_fair_reservations')
    .select('cart_token').eq('order_id', id).eq('status', 'held')
  for (const r of res ?? []) {
    await db.rpc('book_fair_release', { p_cart_token: r.cart_token })
      .then(undefined, () => { /* best-effort — הפקיעה תתפוס ממילא */ })
  }

  // ── 3. מחיקת השורות התלויות ──
  // ⚠️ במפורש: אין ON DELETE CASCADE על כל הטבלאות, ושורות יתומות
  // נספרות ב"נמכר" של הקטלוג.
  await db.from('book_fair_order_items').delete().eq('order_id', id)
  await db.from('book_fair_payments').delete().eq('order_id', id)
  await db.from('book_fair_recordings').delete().eq('order_id', id)
  await db.from('book_fair_call_recordings').update({ order_id: null }).eq('order_id', id)

  const { error: delErr } = await db.from('book_fair_orders').delete().eq('id', id)
  if (delErr) {
    console.error('[book-fair/delete] המחיקה נכשלה:', delErr)
    return NextResponse.json({ error: 'מחיקת ההזמנה נכשלה' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'delete', entityType: 'book_fair_order',
    entityId: id,
    details: {
      order: order.order_number,
      status: order.status,
      total_agorot: order.total_agorot,
      customer: order.customer_name,
      restored_to_stock: restored,
    },
  })

  return NextResponse.json({ ok: true, restored })
}
