import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import PageHeader from '@/components/ui/PageHeader'
import type { BookFairOrder } from '@/types/bookFair'
import { PROBLEM_BOOKS_KEY, parseProblemBooks, ordersWithProblemBooks } from '@/lib/bookFairProblemBooks'
import { aggregateOrderItems, totalsToMaps, type OrderItemRow } from '@/lib/bookFairOrderItems'
import { ratesToTiers, DEFAULT_AGREED_RATES, type TierInput } from '@/lib/bookFairShipping'
import { loadAgreedRates } from '@/lib/bookFairAgreedRates'
import OrdersClient, { type ProblemBookInfo, type RecordingGap } from './OrdersClient'

// מסך ההזמנות — הלב של הניהול היומיומי ביריד.
//
// ⚠️ fetchAllRows ולא select רגיל: PostgREST קוטע ב-1,000 שורות בשקט.
// יריד גדול יחצה את הרף, והמסך היה מציג רשימה חלקית שנראית מלאה —
// כולל בספירות ובייצוא.

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ⚡ 14.10: לקוח השירות, אחרי guardPage.
//
// עם לקוח המשתמש, מדיניות ה-RLS (public.is_staff()) רצה על *כל שורה*: אלפי
// פריטים והזמנות = אלפי בדיקות הרשאה, וזה עיקר ה-6 שנ' שבלוג. ההרשאה כבר
// נבדקה פעם אחת בראש הדף, כמו במסך הלוח (app/admin/dashboard).
// ⚠️ כל השליפות כאן רצות רק אחרי guardPage — ראו BookFairOrdersPage.
// ─────────────────────────────────────────────────────────────────────────────
async function db() {
  return getServiceClient() ?? await createClient()
}

async function getOrders(): Promise<BookFairOrder[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await db()

  // ⚡ עמודות מפורשות: notes ו-tracking_token אינם מוצגים בטבלה ואין
  // סיבה למשוך אותם לכל שורה.
  //
  // ⚠️ ה-cast: טיפוסי המסד אינם מיוצרים בפרויקט, ולכן כל שדה חוזר
  // כ-any ואינו מתאים לטיפוסי האיחוד שלנו (status, channel). אותו
  // דפוס בדיוק כמו app/admin/widows/page.tsx.
  //
  // ⚠️ ההמרה כאן מגשרת על any בלבד — היא *אינה* מסתירה אי-התאמת צורה:
  // BookFairOrder.city מקבל במפורש גם אובייקט וגם מערך, כי כך Supabase
  // מטפס join של רבים-לאחד, והקוראים מנרמלים ב-oneOf().
  const { rows, error } = await fetchAllRows<BookFairOrder>((from, to) =>
    supabase
      .from('book_fair_orders')
      // ⚡ 08.10: רק מה שהטבלה מציגה, מסננת או מחפשת. ~1MB של שורות נשלח
      // לדפדפן בכל טעינה, וכתובת/סכומי ביניים/updated_at לא הוצגו כלל.
      // ⚠️ sold_by נוסף: עמודת הערוץ מציגה אותו, והוא פשוט לא נשלף.
      // 🔴 13.10: items_total/shipping/address_text/notes הוחזרו — הייצוא
      // לאקסל קורא אותם, ומאז הקיצוץ יצאו בו "סכום ספרים", "משלוח",
      // "כתובת" ו"הערות" ריקים או 0 בלי שום סימן. עמודת המשלוח צריכה אותם.
      .select('id, order_number, channel, status, customer_name, customer_phone, customer_email, delivery_method, address_confirmed, address_text, notes, items_total_agorot, shipping_agorot, total_agorot, refunded_agorot, payment_method, sold_by, picked_up_at, paid_at, created_at, city:book_fair_cities(id, name)')
      .order('created_at', { ascending: false })
      .range(from, to) as unknown as PromiseLike<{ data: BookFairOrder[] | null; error: { message: string } | null }>
  )

  // ⚠️ שגיאה נרשמת ואינה זורקת: מסך ריק עם הודעה עדיף על מסך שגיאה
  // אדום שנראה כתקלה כוללת במערכת.
  if (error) console.error('[book-fair/orders] fetch failed:', error)

  // ───────────────────────────────────────────────────────────────────────────
  // 🔴 שיחה שעדיין על הקו אינה הזמנה.
  //
  // המתקשר בוחר ספרים ומקיש פרטי אשראי — ובמסך כבר הופיעה שורה
  // "ממתין לתשלום" שנראית כהזמנה שנטושה. הצוות לא יכול להבדיל בינה
  // לבין מי שבאמת נטש, והמונה בכרטיסים ניפח את התמונה.
  //
  // ⚠️ TMP- היא העדות: המספר הרץ מוקצה רק בתשלום בפועל, ולכן כל שורה
  // שעדיין נושאת מספר זמני היא שיחה שלא הגיעה לתשלום.
  //
  // ⚠️ הישנות כן מוצגות: אחרי שעה השיחה בוודאות הסתיימה, ושורה
  // שנתקעה חייבת להיות גלויה כדי שאפשר יהיה לטפל בה.
  // ───────────────────────────────────────────────────────────────────────────
  const hourAgo = Date.now() - 60 * 60 * 1000
  return rows.filter(o =>
    !String(o.order_number ?? '').startsWith('TMP-') ||
    new Date(o.created_at).getTime() < hourAgo
  )
}

/**
 * ספירת הפריטים לכל הזמנה (לעמודה "ספרים") ומזהי הספרים שבה (לסינון
 * "ספר בעייתי").
 */
async function getItems(): Promise<{
  counts: Record<string, number>
  books: Record<string, string[]>
  volumes: Record<string, number>
}> {
  if (!isSupabaseConfigured()) return { counts: {}, books: {}, volumes: {} }
  const supabase = await db()

  // ⚡ 08.10: כל השורות, בדפים מקבילים (fetchAllRows) — ולא במנות לפי מזהי
  // הזמנות. קודם: 10 שאילתות in טוריות (~1.7 שנ'), ורק *אחרי* שההזמנות
  // נשלפו.
  // ⚡ 13.10: בלי join לקטלוג. book:book_fair_books(volumes) בכל שורה לקח
  // 7–16 שנ' לפי הלוג — רוב זמן הטעינה. הכרכים נשלפים מהקטלוג בנפרד,
  // במקביל, ומוצמדים בזיכרון (lib/bookFairOrderItems).
  // ⚠️ order('id'): דפדוף בלי סדר קבוע עלול לדלג על שורות או לכפול אותן.
  // ⚡ 14.10: קודם הסיכום מהמסד — שורה להזמנה (מיגרציה 20261014).
  type Total = { order_id: string; items: number; volumes: number; book_ids: string[] | null }
  const totals = await fetchAllRows<Total>((from, to) =>
    supabase.rpc('book_fair_order_item_totals')
      .order('order_id')
      .range(from, to) as unknown as PromiseLike<{ data: Total[] | null; error: { message: string } | null }>
  )
  if (!totals.error) return totalsToMaps(totals.rows)
  // ⚠️ הפונקציה עדיין לא קיימת (המיגרציה לא רצה) — נופלים לשליפה המלאה.
  console.warn('[book-fair/orders] item totals rpc unavailable, falling back:', totals.error)

  type Book = { id: string; volumes: number | null }
  const [items, catalog] = await Promise.all([
    fetchAllRows<OrderItemRow>((from, to) =>
      supabase.from('book_fair_order_items')
        .select('order_id, book_id, quantity, volumes_snapshot')
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: OrderItemRow[] | null; error: { message: string } | null }>
    ),
    fetchAllRows<Book>((from, to) =>
      supabase.from('book_fair_books')
        .select('id, volumes')
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: Book[] | null; error: { message: string } | null }>
    ),
  ])
  if (items.error) console.error('[book-fair/orders] items fetch failed:', items.error)
  if (catalog.error) console.error('[book-fair/orders] catalog fetch failed:', catalog.error)
  return aggregateOrderItems(items.rows, new Map(catalog.rows.map(b => [b.id, b.volumes])))
}

/**
 * אילו הזמנות טלפוניות חסרה בהן הקלטה שמורה — שם ו/או כתובת.
 *
 * 🔴 08.10: 23 הזמנות הציגו "ההקלטה לא נמצאה", והצוות ביקש לסנן אותן
 * ולעבוד רק עליהן. "חסרה" = אין עותק אצלנו (storage_path) — רק עותק כזה
 * באמת מתנגן בכרטיס ההזמנה.
 *
 * ⚠️ הזמנה טלפונית *בלי שום* שורת הקלטה נחשבת חסרה בשני הסוגים.
 */
/** הזמנה ← אילו הקלטות שמורות יש לה. נשלף במקביל להזמנות (ראו למטה). */
async function getSavedRecordings(): Promise<Record<string, { name: boolean; address: boolean }>> {
  const has: Record<string, { name: boolean; address: boolean }> = {}
  if (!isSupabaseConfigured()) return has
  const supabase = await db()
  type Row = { order_id: string | null; kind: string; storage_path: string | null }
  const { rows, error } = await fetchAllRows<Row>((from, to) =>
    supabase.from('book_fair_recordings')
      .select('order_id, kind, storage_path')
      .in('kind', ['name', 'address'])
      .not('storage_path', 'is', null)
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
  )
  if (error) console.error('[book-fair/orders] recordings fetch failed:', error)
  for (const row of rows) {
    if (!row.order_id) continue
    const h = (has[row.order_id] ??= { name: false, address: false })
    h[row.kind as 'name' | 'address'] = true
  }
  return has
}

function recordingGaps(
  orders: BookFairOrder[], saved: Record<string, { name: boolean; address: boolean }>,
): Record<string, RecordingGap> {
  const out: Record<string, RecordingGap> = {}
  for (const o of orders) {
    if (o.channel !== 'phone') continue
    const h = saved[o.id] ?? { name: false, address: false }
    out[o.id] = { name: !h.name, address: !h.address }
  }
  return out
}

/**
 * הספרים שסומנו בעייתיים, עם שמם מהקטלוג.
 *
 * ⚠️ ספר שנמחק מהקטלוג נשאר עם "ספר שנמחק" ולא נעלם: הסימון עדיין
 * תופס את ההזמנות שלו, ושורה בלי שם הייתה נראית כתקלה.
 */
async function getProblemBooks(): Promise<ProblemBookInfo[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await db()
  const { data } = await supabase.from('app_settings').select('value').eq('key', PROBLEM_BOOKS_KEY).maybeSingle()
  const marks = parseProblemBooks(data?.value)
  const ids = Object.keys(marks)
  if (!ids.length) return []
  const { data: books } = await supabase.from('book_fair_books').select('id, sku, title').in('id', ids)
  const byId = new Map((books ?? []).map(b => [b.id as string, b as { sku: string | null; title: string }]))
  return ids.map(id => ({
    id,
    sku: byId.get(id)?.sku ?? null,
    title: byId.get(id)?.title ?? 'ספר שנמחק מהקטלוג',
    note: marks[id].note,
  }))
}

/**
 * המדרגות לבקרת המשלוח בטבלה.
 * 🔴 14.10: התעריף המוסכם (30/30/40 ועוד 10 לכל 4 מעל 12) ולא הטבלה שבהגדרות,
 * שהועלתה זמנית ל-25/35/45 בסוף היריד. הסכומים נערכים במסך ההגדרות
 * (טבלת סכום לכל כרך), ובלי הגדרה שמורה חל התעריף ברירת המחדל.
 */
async function getTiers(): Promise<TierInput[]> {
  if (!isSupabaseConfigured()) return ratesToTiers(DEFAULT_AGREED_RATES)
  return ratesToTiers(await loadAgreedRates(await db() as never))
}

/** הזמנות עם תקלת משלוח שלא טופלה — לתגית "תקלה פתוחה" בשורה. */
async function getOpenIssueOrders(): Promise<string[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await db()
  const { data, error } = await supabase.from('book_fair_shipping_issues')
    .select('order_id').in('status', ['open', 'in_progress']).limit(1000)
  // ⚠️ שגיאה (למשל טבלה שטרם נוצרה) לא מפילה את מסך ההזמנות.
  if (error) { console.error('[book-fair/orders] תקלות משלוח:', error.message); return [] }
  return [...new Set((data ?? []).map(r => r.order_id as string))]
}

/** רגע הרינדור בשרת — כדי שהלקוח יזהה שהוא מציג עותק ישן מהמטמון. */
function serverNow(): number {
  return Date.now()
}

/** מדידת זמן לשלב — לאבחון האיטיות (08.10). */
async function timed<T>(marks: string[], label: string, p: Promise<T>): Promise<T> {
  const t0 = serverNow()
  const v = await p
  marks.push(`${label}=${serverNow() - t0}ms`)
  return v
}

export default async function BookFairOrdersPage() {
  const t0 = serverNow()
  const marks: string[] = []
  await timed(marks, 'guard', guardPage('book_fair'))
  // ⚡ 08.10: הכל במקביל — שום שליפה אינה ממתינה לשליפה אחרת. קודם הספרים
  // וההקלטות חיכו להזמנות ונשלפו במנות טוריות: 5–8 שנ' לטעינת הדף.
  const [orders, problemBooks, { counts, books, volumes }, saved, tiers, openIssues] = await Promise.all([
    timed(marks, 'orders', getOrders()),
    timed(marks, 'problem', getProblemBooks()),
    timed(marks, 'items', getItems()),
    timed(marks, 'recs', getSavedRecordings()),
    timed(marks, 'tiers', getTiers()),
    timed(marks, 'issues', getOpenIssueOrders()),
  ])
  const recGaps = recordingGaps(orders, saved)
  // ⚡ 13.10: רק ההזמנות שיש בהן ספר בעייתי, ולא מזהי הספרים של *כל*
  // הזמנה — אלה היו חלק גדול מהמטען לדפדפן, והלקוח השתמש בהם רק לזה.
  const problemByOrder = ordersWithProblemBooks(books, problemBooks.map(b => b.id))
  // 🔍 אבחון: איפה הולך הזמן ומה גודל הנתונים שנשלחים לדפדפן.
  console.log(
    `[book-fair/orders] ${marks.join(' ')} total=${serverNow() - t0}ms · ` +
    `rows=${orders.length} payloadKB≈${Math.round(JSON.stringify({ orders, counts, volumes, problemByOrder, recGaps }).length / 1024)}`,
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="הזמנות" subtitle="הזמנות מהאתר ומהמערכת הטלפונית" />
      <OrdersClient
        orders={orders}
        itemCounts={counts}
        orderVolumes={volumes}
        tiers={tiers}
        problemByOrder={problemByOrder}
        problemBooks={problemBooks}
        recGaps={recGaps}
        openIssueOrders={openIssues}
        renderedAt={serverNow()}
      />
    </div>
  )
}
