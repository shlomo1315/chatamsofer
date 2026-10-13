// ─────────────────────────────────────────────────────────────────────────────
// צבירת שורות פריטי ההזמנות למסך ההזמנות: כמות, כרכים וספרים לכל הזמנה.
//
// ⚡ 13.10: הכרכים מגיעים ממפת קטלוג נפרדת ולא מ-join בכל שורה. ה-join
// (book:book_fair_books(volumes)) על אלפי שורות לקח 7–16 שנ' — רוב זמן
// הטעינה של הדף. הקטלוג קטן ונשלף פעם אחת.
//
// ⚠️ הכרכים מהקטלוג ולא מ-volumes_snapshot: בטלפון ה-snapshot נשמר 1 לכל
// סט עד 13.10. snapshot רק לספר שנמחק מהקטלוג (אין לו ערך במפה).
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderItemRow {
  order_id: string
  book_id: string | null
  quantity: number
  volumes_snapshot: number | null
}

export function aggregateOrderItems(
  rows: OrderItemRow[], bookVolumes: Map<string, number | null>,
): {
  counts: Record<string, number>
  books: Record<string, string[]>
  volumes: Record<string, number>
} {
  const counts: Record<string, number> = {}
  const books: Record<string, string[]> = {}
  const volumes: Record<string, number> = {}
  for (const row of rows) {
    counts[row.order_id] = (counts[row.order_id] ?? 0) + row.quantity
    if (row.book_id) (books[row.order_id] ??= []).push(row.book_id)
    const catalog = row.book_id ? bookVolumes.get(row.book_id) : null
    const v = Math.max(1, Number(catalog ?? row.volumes_snapshot) || 1)
    volumes[row.order_id] = (volumes[row.order_id] ?? 0) + v * row.quantity
  }
  return { counts, books, volumes }
}
