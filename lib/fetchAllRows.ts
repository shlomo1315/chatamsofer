// ─────────────────────────────────────────────────────────────────────────────
// שליפת *כל* השורות משאילתת Supabase, בדפים.
//
// ⚠️ למה זה נחוץ: PostgREST אוכף תקרת שורות בצד השרת (db-max-rows), ותקרה
// כזו אינה ניתנת לעקיפה באמצעות .limit() מהלקוח — הבקשה פשוט נחתכת. התוצאה
// היא הגרועה מכולן: אין שגיאה, אין אזהרה, והדף מציג מספר חלקי כאילו הוא מלא.
// בפועל דף השיתוף "נתקע על 1000" בדיוק מהסיבה הזו, וגם .limit(100000) לא עזר.
//
// הדרך היחידה שעובדת היא לשלוף בדפים עם range() ולעצור כשדף חוזר חלקי.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000
// גבול ביטחון מפני לולאה אינסופית (למשל אם השרת יחזיר תמיד דף מלא).
const MAX_PAGES = 500

export interface PageResult<T> { data: T[] | null; error: { message: string } | null }

/**
 * @param page פונקציה שמקבלת טווח ומחזירה את השורות בו.
 *             לדוגמה: (from, to) => admin.from('x').select('*').range(from, to)
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_SIZE
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) return { rows, error: error.message }
    const batch = data ?? []
    rows.push(...batch)
    // דף חלקי (או ריק) = הגענו לסוף.
    if (batch.length < PAGE_SIZE) return { rows, error: null }
  }
  // ⚠️ נעצרנו בגבול הביטחון ולא בסוף הנתונים. מדווחים בלוג במקום להחזיר
  // בשקט רשימה חלקית — זו בדיוק התקלה שהמנגנון הזה נועד למנוע.
  console.error(`[fetchAllRows] נעצר ב-${MAX_PAGES} דפים (${rows.length} שורות) — ייתכן שהרשימה חלקית`)
  return { rows, error: null }
}
