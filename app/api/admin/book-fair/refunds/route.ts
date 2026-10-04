import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

// ─────────────────────────────────────────────────────────────────────────────
// רשימת הזיכויים — מי צריך לקבל כסף בחזרה, ומי כבר קיבל.
//
// 🔴 זיכוי כאן הוא *דיווח* ולא פעולה כספית: נדרים אינה מחזירה כסף
// דרך ה-API שלנו, וההחזר נעשה ידנית במשרד. בלי הרשימה הזו המידע
// חי בראש של מישהו — וזה בדיוק מה שקרה: הזמנות סומנו "זוכה"
// והכסף מעולם לא הוחזר.
//
// ⚠️ settled_at מפריד בין "נרשם" ל"בוצע". זו ההבחנה שכל המסך קיים
// בשבילה.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET — הרשימה. ?pending=1 להצגת הממתינים בלבד. */
export async function GET(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let q = db.from('book_fair_refunds')
    .select(`
      id, amount_agorot, reason, note, created_at, settled_at, settled_note,
      order:book_fair_orders(
        id, order_number, customer_name, customer_phone, customer_email,
        total_agorot, channel
      )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (request.nextUrl.searchParams.get('pending') === '1') {
    q = q.is('settled_at', null)
  }

  const { data, error } = await q
  if (error) {
    console.error('[book-fair/refunds] שליפה נכשלה:', error)
    return NextResponse.json({ error: 'טעינת הרשימה נכשלה' }, { status: 500 })
  }

  // ⚠️ Supabase מחזיר join של רבים-לאחד כאובייקט *או* כמערך.
  const rows = (data ?? []).map(r => ({
    ...r,
    order: Array.isArray(r.order) ? r.order[0] : r.order,
  }))

  const pendingAgorot = rows
    .filter(r => !r.settled_at)
    .reduce((s, r) => s + (r.amount_agorot ?? 0), 0)

  return NextResponse.json({
    refunds: rows,
    pendingCount: rows.filter(r => !r.settled_at).length,
    pendingAgorot,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/** POST — דיווח על זיכוי שצריך לבצע. */
export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const body = await request.json().catch(() => ({})) as {
    orderId?: string
    amountAgorot?: number
    reason?: string
    note?: string
  }

  const orderId = String(body.orderId ?? '').trim()
  if (!orderId) return NextResponse.json({ error: 'חסר מזהה הזמנה' }, { status: 400 })

  const { data: order } = await db.from('book_fair_orders')
    .select('id, order_number, total_agorot, refunded_agorot, customer_name')
    .eq('id', orderId).maybeSingle()
  if (!order) return NextResponse.json({ error: 'ההזמנה לא נמצאה' }, { status: 404 })

  // ⚠️ בלי סכום — היתרה המלאה. חסר מתפרש כ"הכול", ו-0 כשגיאה.
  const remaining = (order.total_agorot ?? 0) - (order.refunded_agorot ?? 0)
  const amount = Number.isFinite(body.amountAgorot) && Number(body.amountAgorot) > 0
    ? Math.round(Number(body.amountAgorot))
    : remaining

  if (amount <= 0) {
    return NextResponse.json({ error: 'אין יתרה לזיכוי בהזמנה זו' }, { status: 400 })
  }
  // 🔴 אין לזכות יותר ממה שנגבה.
  if (amount > remaining) {
    return NextResponse.json({
      error: `הסכום גבוה מהיתרה (${(remaining / 100).toFixed(2)} ₪)`,
    }, { status: 400 })
  }

  const { data: ref, error } = await db.from('book_fair_refunds').insert({
    order_id: orderId,
    amount_agorot: amount,
    reason: String(body.reason ?? '').trim() || null,
    note: String(body.note ?? '').trim() || null,
    reported_by: staff.userId,
  }).select('id').single()

  if (error || !ref) {
    console.error('[book-fair/refunds] רישום נכשל:', error)
    return NextResponse.json({ error: 'רישום הזיכוי נכשל' }, { status: 500 })
  }

  // ⚠️ refunded_agorot מתעדכן מיד: הוא מה שמונע זיכוי כפול על אותה
  // הזמנה, גם לפני שהכסף הוחזר בפועל.
  const newRefunded = (order.refunded_agorot ?? 0) + amount
  await db.from('book_fair_orders').update({
    refunded_agorot: newRefunded,
    // ⚠️ "זוכה חלקית" כשנותרה יתרה — הבחנה שחשובה בדוחות.
    status: newRefunded >= (order.total_agorot ?? 0) ? 'refunded' : 'partially_refunded',
  }).eq('id', orderId)

  await logActivity(db, {
    userId: staff.userId, action: 'create', entityType: 'book_fair_refund',
    entityId: ref.id,
    details: { order: order.order_number, amount_agorot: amount, reason: body.reason },
  })

  return NextResponse.json({ ok: true, id: ref.id, amountAgorot: amount })
}

/** PATCH — סימון שהכסף הוחזר בפועל. */
export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const body = await request.json().catch(() => ({})) as {
    id?: string
    note?: string
    undo?: boolean
  }
  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'חסר מזהה זיכוי' }, { status: 400 })

  // ⚠️ undo מחזיר ל"ממתין": סימון בטעות חייב להיות הפיך, אחרת
  // הרשימה תאבד פריט והכסף לא יוחזר לעולם.
  const patch = body.undo
    ? { settled_at: null, settled_by: null, settled_note: null }
    : {
        settled_at: new Date().toISOString(),
        settled_by: staff.userId,
        settled_note: String(body.note ?? '').trim() || null,
      }

  const { error } = await db.from('book_fair_refunds').update(patch).eq('id', id)
  if (error) {
    console.error('[book-fair/refunds] עדכון נכשל:', error)
    return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'book_fair_refund',
    entityId: id, details: { settled: !body.undo },
  })

  return NextResponse.json({ ok: true })
}
