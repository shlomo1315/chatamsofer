import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { getPaymentProvider, sanitizeProviderResponse } from '@/lib/payments'
import {
  planRefund, refundAmountForLines,
  type RefundableItem, type RefundableOrder, type RefundLine,
} from '@/lib/bookFairRefund'

// ─────────────────────────────────────────────────────────────────────────────
// זיכוי הזמנה.
//
// 🔴 זה הנתיב שהודעת השגיאה ב-PATCH הפנתה אליו מהיום הראשון ("לזיכוי
// השתמשו במסך הזיכוי") — ולא היה קיים. בינתיים אפשר היה לסמן "זוכה"
// דרך כפתור הסטטוס, וההזמנה נראתה מזוכה בזמן ש-refunded_agorot נשאר 0
// וההכנסות בלוח הבקרה ספרו את הסכום המלא.
//
// ⚠️ סדר הפעולות כאן אינו שרירותי. הכסף קודם, המסד אחריו:
//   1. מאמתים את התוכנית (חישוב טהור, ב-lib)
//   2. מבקשים זיכוי מהספק
//   3. רק אם הספק אישר — כותבים למסד ומחזירים מלאי
//
// כישלון אחרי שלב 2 משאיר זיכוי אצל הספק שאינו רשום אצלנו — רע, אך
// הפיך בזיהוי ידני. הסדר ההפוך היה משאיר הזמנה שרשומה כמזוכה ללא
// שהכסף חזר ללקוח, וזה כשל שאיש לא מגלה.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Body {
  /** סכום לזיכוי באגורות. אם חסר — היתרה המלאה, או סכום השורות. */
  amount_agorot?: number
  /** שורות להחזרה פיזית. משמש גם לחישוב הסכום כשלא נמסר amount_agorot. */
  lines?: RefundLine[]
  /** האם להחזיר את דמי המשלוח (רלוונטי רק עם lines). */
  include_shipping?: boolean
  /** האם להחזיר את העותקים למלאי. */
  restock?: boolean
  reason?: string
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // ⚠️ הרשאת edit ולא view: זו פעולה כספית.
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { id } = await params
  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  // ── ההזמנה ──
  const { data: orderRow, error: oErr } = await db.from('book_fair_orders')
    .select('id, order_number, status, channel, total_agorot, shipping_agorot, refunded_agorot')
    .eq('id', id).maybeSingle()

  if (oErr || !orderRow) return NextResponse.json({ error: 'ההזמנה לא נמצאה' }, { status: 404 })
  const order = orderRow as RefundableOrder & { id: string; order_number: string; channel: string }

  // ── השורות ──
  const { data: itemRows } = await db.from('book_fair_order_items')
    .select('id, book_id, title_snapshot, quantity, unit_price_agorot, line_total_agorot')
    .eq('order_id', id)
  const items = (itemRows ?? []) as RefundableItem[]

  // ── הסכום ──
  //
  // ⚠️ שני מסלולים: סכום מפורש, או חישוב מהשורות שנבחרו. כששניהם
  // נמסרים, המפורש גובר — אבל השורות עדיין קובעות מה חוזר למלאי.
  let amount = body.amount_agorot
  const lines = Array.isArray(body.lines) ? body.lines : []

  if (amount === undefined && lines.length) {
    const calc = refundAmountForLines(items, lines, {
      includeShipping: body.include_shipping === true,
      shippingAgorot: order.shipping_agorot,
    })
    if (!calc.ok) return NextResponse.json({ error: calc.error }, { status: 400 })
    amount = calc.amountAgorot
  }

  const plan = planRefund(order, amount)
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 })

  // ⚠️ מאמתים את השורות גם כשהסכום נמסר מפורשות — החזרה למלאי של
  // יותר ממה שנקנה הייתה מייצרת מלאי יש-מאין.
  if (lines.length) {
    const check = refundAmountForLines(items, lines)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
  }

  // ── הזיכוי אצל הספק ──
  //
  // ⚠️ מחפשים את העסקה המוצלחת. בלי transaction_id אין למי לפנות —
  // אז מתעדים זיכוי ידני ומסמנים זאת במפורש, במקום להיכשל ולהשאיר
  // את ההזמנה במצב שגוי.
  const { data: payRows } = await db.from('book_fair_payments')
    .select('transaction_id, provider')
    .eq('order_id', id).eq('status', 'success')
    .not('transaction_id', 'is', null)
    .order('created_at', { ascending: false }).limit(1)

  const pay = (payRows as { transaction_id: string; provider: string }[] | null)?.[0]
  let refundId: string | null = null
  let manual = false

  if (pay?.transaction_id) {
    const provider = await getPaymentProvider()
    const res = await provider.refund({
      orderId: id,
      transactionId: pay.transaction_id,
      amountAgorot: plan.amountAgorot,
      reason: body.reason,
    }).catch((e: unknown) => ({
      ok: false, error: e instanceof Error ? e.message : 'שגיאת תקשורת מול הספק',
    }))

    if (!res.ok && !('manualRequired' in res && res.manualRequired)) {
      // 🔴 נעצרים לפני כל כתיבה: ההזמנה נשארת כפי שהייתה.
      return NextResponse.json({
        error: `הזיכוי נדחה אצל ספק הסליקה: ${res.error ?? 'סיבה לא ידועה'}`,
      }, { status: 502 })
    }
    manual = 'manualRequired' in res ? res.manualRequired === true : false
    refundId = ('refundId' in res ? res.refundId : null) ?? null
  } else {
    // אין עסקה מזוהה — זיכוי שבוצע מחוץ למערכת ורק נרשם כאן.
    manual = true
  }

  // ── כתיבה למסד ──
  const { error: upErr } = await db.from('book_fair_orders').update({
    refunded_agorot: plan.totalRefundedAgorot,
    status: plan.nextStatus,
  }).eq('id', id)

  if (upErr) {
    // 🔴 הכסף כבר הוחזר אצל הספק. שורת הלוג הזו היא הדרך היחידה לאתר
    // את הפער, ולכן היא מפורשת ומכילה את כל מה שצריך לתיקון ידני.
    console.error(
      `[book-fair/refund] 🔴 הזיכוי בוצע אצל הספק אך לא נרשם במסד! ` +
      `הזמנה=${order.order_number} סכום=${plan.amountAgorot} refundId=${refundId ?? '-'}`,
      upErr,
    )
    return NextResponse.json({
      error: 'הזיכוי בוצע אצל ספק הסליקה אך רישומו במערכת נכשל. פנו לתמיכה — אין לחזור על הפעולה.',
    }, { status: 500 })
  }

  // ── תיעוד הזיכוי בטבלת הסליקה ──
  // ⚠️ סכום שלילי: זו תנועה הפוכה, וסכום חיובי היה נספר כגבייה נוספת.
  await db.from('book_fair_payments').insert({
    order_id: id,
    provider: pay?.provider ?? 'manual',
    amount_agorot: -plan.amountAgorot,
    status: 'refunded',
    transaction_id: refundId,
    provider_response: sanitizeProviderResponse({
      refund_of: pay?.transaction_id ?? null,
      manual,
      reason: body.reason ?? null,
    }),
  })

  // ── החזרת המלאי ──
  //
  // ⚠️ best-effort ובנפרד מהכסף: כישלון כאן אינו מבטל זיכוי שכבר בוצע.
  // ביקורת המלאי (book_fair_stock_audit) תתפוס פער אם נוצר.
  const restocked: string[] = []
  // 🔴 מכירת דוכן אינה חוזרת אוטומטית (ביקורת אבטחה 05.10): היא נלקחה
  // ממלאי הדוכן (stock_fair), ו-book_fair_adjust_stock מוסיף רק למלאי
  // האתר/הטלפון — כל זיכוי דוכן יצר מלאי מקוון שלא היה קיים.
  const standOrder = order.channel === 'fair'
  if (body.restock !== false && lines.length && !standOrder) {
    const channel = order.channel === 'phone' ? 'phone' : 'web'
    const note = `זיכוי הזמנה ${order.order_number}`
    // 🔴 כמה כבר הוחזר מההזמנה הזו, לכל ספר. בלי זה זיכוי חלקי של 1 אגורה
    // עם כל השורות, שוב ושוב, החזיר את אותם עותקים למלאי בכל פעם.
    const { data: prev } = await db.from('book_fair_stock_ledger')
      .select('book_id, delta').eq('reason', 'refund').eq('note', note)
    const returned = new Map<string, number>()
    for (const r of (prev ?? []) as { book_id: string; delta: number }[]) {
      returned.set(r.book_id, (returned.get(r.book_id) ?? 0) + r.delta)
    }
    for (const line of lines) {
      const item = items.find(i => i.id === line.itemId)
      if (!item?.book_id) continue      // ספר שנמחק מהקטלוג — אין למה להחזיר
      const bought = items.filter(i => i.book_id === item.book_id).reduce((n, i) => n + i.quantity, 0)
      const already = returned.get(item.book_id) ?? 0
      const qty = Math.min(line.quantity, bought - already)
      if (qty <= 0) continue            // כבר הוחזר במלואו בזיכוי קודם
      returned.set(item.book_id, already + qty)
      const { error } = await db.rpc('book_fair_adjust_stock', {
        p_book_id: item.book_id,
        p_channel: channel,
        p_delta: qty,
        p_reason: 'refund',
        p_note: `זיכוי הזמנה ${order.order_number}`,
        p_by: staff.userId,
      })
      if (error) console.error(`[book-fair/refund] החזרת מלאי נכשלה (${item.title_snapshot}):`, error.message)
      else restocked.push(item.title_snapshot)
    }
  }

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'book_fair_order',
    entityId: id,
    details: {
      order: order.order_number,
      refund_agorot: plan.amountAgorot,
      total_refunded: plan.totalRefundedAgorot,
      status: plan.nextStatus,
      manual, restocked: restocked.length,
      reason: body.reason ?? null,
    },
  })

  return NextResponse.json({
    ok: true,
    amountAgorot: plan.amountAgorot,
    totalRefundedAgorot: plan.totalRefundedAgorot,
    status: plan.nextStatus,
    /** ⚠️ true = הכסף לא הוחזר אוטומטית ויש לבצע העברה ידנית. */
    manualRequired: manual,
    /** מכירת דוכן — הספרים לא הוחזרו אוטומטית; להחזיר למלאי הדוכן ידנית. */
    standRestockManual: standOrder && lines.length > 0 && body.restock !== false,
    restocked,
  })
}
