import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// מחיקת הזמנות שנתקעו ב"ממתין לתשלום".
//
// 🔴 אלו אינן הזמנות: הלקוח פתח את דף הסליקה ולא השלים. עד לתיקון
// (05.10) הן גם שרפו מספר רץ, ולכן יש כאלה עם 121223-121226 שאיש
// לא שילם עליהן.
//
// ⚠️ המלאי משוחרר לפני המחיקה: העותקים ננעלו בשריון, ומחיקת השורה
// לבדה הייתה מותירה אותם נעולים עד הפקיעה — כלומר ספר שנראה "אזל"
// בלי שנמכר.
//
// ⚠️ רק pending_payment ורק ישנות מ-30 דקות: מתקשר שנמצא *כרגע*
// בדף הסליקה הוא במצב הזה בדיוק, ומחיקתו באמצע הייתה הורסת תשלום
// פעיל. מי שרוצה למחוק ספציפית שולח ids.
//
// ⚠️ מחיקה ולא ביטול: שורה "מבוטלת" היא עדות למשהו שקרה, ואלו
// רשומות ריקות שרק מרעישות את המסך. הכסף לא נגבה — אין מה לתעד.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'delete'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const body = await request.json().catch(() => ({})) as {
    ids?: string[]
    olderThanMinutes?: number
    dryRun?: boolean
  }

  const minutes = Number.isFinite(body.olderThanMinutes) ? Number(body.olderThanMinutes) : 30
  const cutoff = new Date(Date.now() - Math.max(0, minutes) * 60_000).toISOString()

  let q = db.from('book_fair_orders')
    .select('id, order_number, total_agorot, customer_name, created_at')
    .eq('status', 'pending_payment')

  // ⚠️ בחירה מפורשת עוקפת את מגבלת הזמן — המשתמש ראה את השורות ובחר בהן.
  if (body.ids?.length) q = q.in('id', body.ids)
  else q = q.lt('created_at', cutoff)

  const { data: rows, error } = await q
  if (error) {
    console.error('[fair/purge] שליפה נכשלה:', error)
    return NextResponse.json({ error: 'שליפת ההזמנות נכשלה' }, { status: 500 })
  }

  const found = rows ?? []
  if (body.dryRun) {
    return NextResponse.json({
      dryRun: true,
      count: found.length,
      orders: found.map(o => ({
        order_number: o.order_number,
        total: o.total_agorot,
        customer: o.customer_name,
      })),
    })
  }

  let deleted = 0
  for (const o of found) {
    // 🔴 שחרור השריון קודם: בלעדיו העותקים נשארים נעולים.
    const { data: res } = await db.from('book_fair_reservations')
      .select('cart_token').eq('order_id', o.id).eq('status', 'held')
    for (const r of res ?? []) {
      await db.rpc('book_fair_release', { p_cart_token: r.cart_token })
        .then(undefined, () => { /* best-effort — הפקיעה תתפוס ממילא */ })
    }

    // ⚠️ הפריטים נמחקים במפורש: אין ON DELETE CASCADE על כל הטבלאות,
    // ושורות יתומות נספרות ב"נמכר" של הקטלוג.
    await db.from('book_fair_order_items').delete().eq('order_id', o.id)
    await db.from('book_fair_payments').delete().eq('order_id', o.id)
    await db.from('book_fair_recordings').delete().eq('order_id', o.id)

    const { error: delErr } = await db.from('book_fair_orders').delete().eq('id', o.id)
    if (delErr) {
      console.error(`[fair/purge] מחיקת ${o.order_number} נכשלה:`, delErr)
      continue
    }
    deleted++
  }

  console.log(`[fair/purge] נמחקו ${deleted} הזמנות ממתינות לתשלום`)
  return NextResponse.json({ deleted, requested: found.length })
}
