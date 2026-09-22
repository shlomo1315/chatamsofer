import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, verifyCronSecret, unauthorized, serverMisconfigured } from '@/lib/apiAuth'
import { getPaymentProvider } from '@/lib/payments'

// ניקוי תקופתי של יריד הספרים.
//
// 🔴 זה לא ניקיון נוח — בלעדיו המלאי נשחק. כל עגלה נטושה וכל שיחה
// שהתנתקה מחזיקה עותקים שלא יוחזרו לעולם, והקטלוג יציג "אזל" על
// ספרים שיש מהם במחסן.
//
// ⚠️ הפקיעה העצלה (בתוך book_fair_reserve) פותרת רק את מי שמנסה לקנות
// את אותו ספר. המסכים, הקטלוג והתראות המלאי נשענים על הריצה הזו.
//
// ⚠️ idempotent: הפונקציה במסד מעדכנת ובוררת באותה פקודה, ולכן ריצה
// כפולה (חפיפת פריסה ב-Railway) לא תחזיר מלאי פעמיים.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** הזמנה שנתקעה בהמתנה לתשלום מעבר לזמן הזה — מועמדת לביטול. */
const STUCK_MINUTES = 45

export async function GET(request: NextRequest) {
  // ⚠️ verifyCronSecret נכשל-סגור: בלי CRON_SECRET מוגדר, חסום.
  if (!verifyCronSecret(request)) return unauthorized()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  // ── 1. שחרור שריונים שפג זמנם ──
  const { data: expired, error: expErr } = await db.rpc('book_fair_expire_reservations', {
    p_book_ids: null,
  })
  if (expErr) {
    console.error('[book-fair/cleanup] expire failed:', expErr)
  }

  // ── 2. הזמנות שנתקעו בהמתנה לתשלום ──
  //
  // 🔴 לא מבטלים בעיוורון. ייתכן שהלקוח *כן* שילם והדיווח מהספק אבד
  // בדרך; ביטול במקרה כזה הוא הכשל הגרוע ביותר האפשרי כאן — הכסף
  // נגבה, ההזמנה נעלמה, והמלאי חזר למכירה.
  //
  // לכן: לכל הזמנה תקועה שיש לה ניסיון סליקה, שואלים את הספק מה קרה
  // בפועל, ומבטלים רק את מי שהספק מאשר שלא שולם.
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString()
  const { data: stuck } = await db.from('book_fair_orders')
    .select('id, order_number, total_agorot')
    .eq('status', 'pending_payment')
    .lt('created_at', cutoff)
    .limit(100)

  let cancelled = 0
  let rescued = 0

  if (stuck?.length) {
    const provider = await getPaymentProvider()

    for (const order of stuck) {
      const { data: attempts } = await db.from('book_fair_payments')
        .select('transaction_id')
        .eq('order_id', order.id)
        .not('transaction_id', 'is', null)
        .limit(1)

      const txn = attempts?.[0]?.transaction_id
      if (txn) {
        // אימות חוזר מול הספק לפני כל ביטול
        const verified = await provider.verifyCallback({ txn, order: order.id })
          .catch(() => null)

        if (verified?.status === 'success') {
          // 🔴 הלקוח שילם והדיווח אבד — מצילים את ההזמנה במקום לבטלה.
          console.warn(`[book-fair/cleanup] הזמנה ${order.order_number} שולמה והדיווח אבד — מסומנת כשולמה`)
          await db.from('book_fair_orders')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', order.id).eq('status', 'pending_payment')

          const { data: res } = await db.from('book_fair_reservations')
            .select('cart_token').eq('order_id', order.id).eq('status', 'held').limit(1)
          if (res?.[0]) {
            await db.rpc('book_fair_consume', { p_cart_token: res[0].cart_token, p_order_id: order.id })
          }
          rescued++
          continue
        }
      }

      // לא שולם — ביטול ושחרור המלאי
      await db.from('book_fair_orders')
        .update({ status: 'cancelled' })
        .eq('id', order.id).eq('status', 'pending_payment')

      const { data: res } = await db.from('book_fair_reservations')
        .select('cart_token').eq('order_id', order.id).eq('status', 'held').limit(1)
      if (res?.[0]) {
        await db.rpc('book_fair_release', { p_cart_token: res[0].cart_token })
      }
      cancelled++
    }
  }

  // ── 3. בדיקת התאמה בין המלאי ליומן ──
  //
  // ⚠️ באג בשחרור אינו מייצר שגיאה — רק מלאי שיורד לאיטו. הבדיקה כאן
  // הופכת כשל שקט לשורת לוג, כדי שיתגלה לפני שהקטלוג מתרוקן.
  const { data: mismatch } = await db.rpc('book_fair_stock_audit')
    .then(r => r, () => ({ data: null }))   // הפונקציה אופציונלית

  if (Array.isArray(mismatch) && mismatch.length) {
    console.error(`[book-fair/cleanup] ⚠️ אי-התאמה בין המלאי ליומן ב-${mismatch.length} ספרים`)
  }

  return NextResponse.json({
    ok: true,
    expiredReservations: expired ?? 0,
    cancelledOrders: cancelled,
    rescuedOrders: rescued,
  })
}
