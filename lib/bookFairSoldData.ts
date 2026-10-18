import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { PAID } from '@/lib/bookFairStats'
import { creditsAsReturns } from '@/lib/bookFairItemCredits'
import { computeSold, type BookSold, type RefundReturn, type SoldAdjustmentInput, type SoldItem, type SoldOrder } from '@/lib/bookFairSold'

// שליפת הנתונים ל"נמכר" לפי ספר (צד שרת). החישוב: lib/bookFairSold.ts.
//
// ⚠️ לקוח שירות בלבד, ורק אחרי guardPage: יומן המלאי וההתאמות פתוחים
// ל-service_role. ⚡ בלי join: הזמנות ופריטים נשלפים בנפרד ומוצמדים בזיכרון
// (ה-join עם RLS על כל שורה היה האיטי במסך ההזמנות).

type Res<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** שורות יומן ההחזרות בזיכוי — גם ללוח הבקרה. */
export async function loadRefundReturns(db: SupabaseClient): Promise<RefundReturn[]> {
  const { rows, error } = await fetchAllRows<RefundReturn>((from, to) =>
    db.from('book_fair_stock_ledger').select('book_id, delta, note')
      .eq('reason', 'refund').order('id').range(from, to) as unknown as Res<RefundReturn>)
  if (error) console.error('[book-fair/sold] refund ledger:', error)
  // סימוני "זוכה" ידניים / מאקסל (book_fair_item_credits) נחשבים כמו זיכוי חלקי.
  // ⚠️ אם המיגרציה עוד לא רצה, השגיאה נרשמת והחישוב ממשיך בלעדיהם.
  type Mark = { order_number: string; book_id: string | null; quantity: number }
  const marks = await fetchAllRows<Mark>((from, to) =>
    db.from('book_fair_item_credits').select('order_number, book_id, quantity')
      .order('id').range(from, to) as unknown as Res<Mark>)
  if (marks.error) console.error('[book-fair/sold] item credits:', marks.error)
  return [...rows, ...creditsAsReturns(marks.rows)]
}

/**
 * ⚠️ withAdjustments=false לדוח ההתחשבנות, שמוסיף את ההתאמות בעצמו
 * (buildBookRows) ומציג אותן בנפרד.
 */
export async function loadSold(db: SupabaseClient, { withAdjustments = true } = {}): Promise<{ sold: Record<string, BookSold>; error: string | null }> {
  const [orders, items, returns, adj] = await Promise.all([
    fetchAllRows<SoldOrder>((from, to) =>
      db.from('book_fair_orders').select('id, status, channel, order_number')
        .in('status', [...PAID]).order('id').range(from, to) as unknown as Res<SoldOrder>),
    fetchAllRows<SoldItem>((from, to) =>
      db.from('book_fair_order_items').select('order_id, book_id, quantity, line_total_agorot')
        .order('id').range(from, to) as unknown as Res<SoldItem>),
    loadRefundReturns(db),
    fetchAllRows<SoldAdjustmentInput>((from, to) =>
      db.from('book_fair_sold_adjustments').select('book_id, delta, amount_agorot')
        .order('id').range(from, to) as unknown as Res<SoldAdjustmentInput>),
  ])
  // ⚠️ התאמות שלא נטענו (המיגרציה עוד לא רצה) אינן מפילות את החישוב.
  if (adj.error) console.error('[book-fair/sold] adjustments:', adj.error)
  const error = orders.error ?? items.error
  return { sold: error ? {} : computeSold(orders.rows, items.rows, returns, withAdjustments ? adj.rows : []), error }
}
