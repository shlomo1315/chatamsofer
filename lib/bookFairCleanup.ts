// ─────────────────────────────────────────────────────────────────────────────
// ניקוי תקופתי של יריד הספרים.
//
// 🔴 זה לא ניקיון נוח — בלעדיו המלאי נשחק. כל עגלה נטושה וכל שיחה
// שהתנתקה מחזיקה עותקים שלא יוחזרו לעולם, והקטלוג יציג "אזל" על
// ספרים שיש מהם במחסן.
//
// ⚠️ הפקיעה העצלה (בתוך book_fair_reserve) פותרת רק את מי שמנסה לקנות
// את אותו ספר. המסכים, הקטלוג והתראות המלאי נשענים על הריצה הזו.
//
// ⚠️ הלוגיקה יושבת כאן ולא בראוט, כי שני צרכנים קוראים לה: המתזמן
// הפנימי (instrumentation.ts) והראוט הידני (/api/cron/book-fair-cleanup).
// המתזמן מייבא ישירות ואינו פונה לעצמו ב-HTTP — זו התבנית של כל שאר
// המשימות בפרויקט, והיא גם חוסכת את הצורך שהשרת יכיר את הסוד של עצמו.
//
// ⚠️ idempotent: הפונקציה במסד מעדכנת ובוררת באותה פקודה, ולכן ריצה
// כפולה (חפיפת פריסה ב-Railway) לא תחזיר מלאי פעמיים.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPaymentProvider } from '@/lib/payments'

/** הזמנה שנתקעה בהמתנה לתשלום מעבר לזמן הזה — מועמדת לביטול. */
const STUCK_MINUTES = 45

export interface BookFairCleanupResult {
  ok: boolean
  expiredReservations: number
  cancelledOrders: number
  rescuedOrders: number
  /** ספרים שבהם המלאי אינו תואם ליומן. null = הבדיקה לא הצליחה לרוץ. */
  stockDrift: number | null
  error?: string
}

/**
 * מריץ מחזור ניקוי אחד.
 *
 * ⚠️ אינו זורק: כל שלב נכשל בנפרד ונרשם, כדי ששגיאה בשלב אחד לא תמנע
 * את השאר. המתזמן קורא לזה כל רבע שעה ואין מי שיתפוס חריגה.
 */
export async function runBookFairCleanup(
  db: SupabaseClient,
): Promise<BookFairCleanupResult> {
  const out: BookFairCleanupResult = {
    ok: true, expiredReservations: 0, cancelledOrders: 0,
    rescuedOrders: 0, stockDrift: null,
  }

  // ── 1. שחרור שריונים שפג זמנם ──
  const { data: expired, error: expErr } = await db.rpc('book_fair_expire_reservations', {
    p_book_ids: null,
  })
  if (expErr) {
    console.error('[book-fair/cleanup] expire failed:', expErr)
    out.ok = false
    out.error = expErr.message
  } else {
    out.expiredReservations = typeof expired === 'number' ? expired : 0
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

  if (stuck?.length) {
    const provider = await getPaymentProvider()

    for (const order of stuck as { id: string; order_number: string }[]) {
      const { data: attempts } = await db.from('book_fair_payments')
        .select('transaction_id')
        .eq('order_id', order.id)
        .not('transaction_id', 'is', null)
        .limit(1)

      const txn = (attempts as { transaction_id: string }[] | null)?.[0]?.transaction_id
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
          const tok = (res as { cart_token: string }[] | null)?.[0]?.cart_token
          if (tok) {
            await db.rpc('book_fair_consume', { p_cart_token: tok, p_order_id: order.id })
          }
          out.rescuedOrders++
          continue
        }
      }

      // לא שולם — ביטול ושחרור המלאי
      await db.from('book_fair_orders')
        .update({ status: 'cancelled' })
        .eq('id', order.id).eq('status', 'pending_payment')

      const { data: res } = await db.from('book_fair_reservations')
        .select('cart_token').eq('order_id', order.id).eq('status', 'held').limit(1)
      const tok = (res as { cart_token: string }[] | null)?.[0]?.cart_token
      if (tok) {
        await db.rpc('book_fair_release', { p_cart_token: tok })
      }
      out.cancelledOrders++
    }
  }

  // ── 3. בדיקת התאמה בין המלאי ליומן ──
  //
  // ⚠️ באג בשחרור אינו מייצר שגיאה — רק מלאי שיורד לאיטו. הבדיקה כאן
  // הופכת כשל שקט לשורת לוג, כדי שיתגלה לפני שהקטלוג מתרוקן.
  //
  // ⚠️ שגיאה כאן אינה מפילה את הניקוי: זו בדיקה משנית, והשלבים שקדמו
  // לה כבר החזירו מלאי. stockDrift נשאר null כדי שהקורא יבחין בין
  // "אין פער" ל"לא ידוע".
  const { data: mismatch, error: auditErr } = await db.rpc('book_fair_stock_audit')
  if (auditErr) {
    console.error('[book-fair/cleanup] stock audit failed:', auditErr.message)
  } else if (Array.isArray(mismatch)) {
    out.stockDrift = mismatch.length
    if (mismatch.length) {
      const worst = (mismatch as { title?: string; channel?: string; drift?: number }[])
        .slice(0, 5)
        .map(m => `${m.title ?? '?'} (${m.channel}: ${m.drift})`)
        .join(', ')
      console.error(
        `[book-fair/cleanup] ⚠️ אי-התאמה בין המלאי ליומן ב-${mismatch.length} ספרים · ${worst}`,
      )
    }
  }

  return out
}
