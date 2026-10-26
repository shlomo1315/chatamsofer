// שליפה לפי רשימת מזהים בקבוצות.
//
// ⚠️ .in('id', ids) עם מאות מזהים בונה כתובת ארוכה מדי, והבקשה נכשלת
// (TypeError: fetch failed). בכרטסת המלאי זה גרם להצגת כל הכרטיסים כ"תלויים".
// לכן השליפה מפוצלת לקבוצות קטנות, ושגיאה בכל קבוצה מוחזרת במפורש.

export const IDS_CHUNK_SIZE = 100

export async function fetchByIds<T>(
  ids: string[],
  query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  chunkSize = IDS_CHUNK_SIZE,
): Promise<{ rows: T[]; error: string | null }> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize))
  const results = await Promise.all(chunks.map(c => query(c).then(
    r => r,
    (e: unknown) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } }),
  )))
  const rows: T[] = []
  let error: string | null = null
  for (const r of results) {
    if (r.error) error = error ?? r.error.message
    else rows.push(...(r.data ?? []))
  }
  return { rows, error }
}
