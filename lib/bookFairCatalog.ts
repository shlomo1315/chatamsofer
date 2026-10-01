// ─────────────────────────────────────────────────────────────────────────────
// הקטלוג הציבורי של יריד הספרים — מקור אמת אחד.
//
// 🔴 עד היום השליפה הזו הייתה משוכפלת מילה במילה בשני מקומות:
// app/yerid/page.tsx (SSR של החנות) ו-app/api/yerid/catalog/route.ts.
// כולל כלל הפרטיות "כמות → דגל בלבד". שכפול של כלל פרטיות הוא הזמנה
// לסטייה: תוספת סינון במקום אחד הייתה מותירה את השני חושף יותר.
//
// 🔴 מה *לא* נחשף: stock_total כמספר, phone_code, sort_order.
// הכמות המדויקת היא מידע תפעולי — היא מאפשרת למפות את גודל המלאי ואת
// קצב המכירות. הלקוח צריך לדעת "זמין" או "אזל", ותו לא.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetchAllRows'

/** ספר כפי שהוא נחשף לציבור. */
export interface PublicBook {
  id: string
  sku: string
  title: string
  author: string | null
  publisher: string | null
  volumes: number
  price_agorot: number
  image_path: string | null
  description: string | null
  /** 🔴 דגל ולא מספר — ראו ההערה בראש הקובץ. */
  in_stock: boolean
}

/** השדות הנשלפים מהמסד, לפני ההמרה לצורה הציבורית. */
type Row = Omit<PublicBook, 'in_stock'> & {
  stock_total: number
  unlimited_stock: boolean
}

const PUBLIC_COLUMNS =
  'id, sku, title, author, publisher, volumes, price_agorot, image_path, description, stock_total, unlimited_stock'

/**
 * סדר הקטגוריות בחנות.
 *
 * 🔴 נגזר מהמק"ט ולא מרשימה קבועה: הספרות הראשונות של המק"ט *הן*
 * הקטגוריה (01=שו"ת, 02=דרוש, 03=הש"ס וכו'), וזה הסדר שבו הקטלוג
 * המודפס בנוי. רשימה כתובה ביד הייתה נשארת מאחור בכל קטגוריה חדשה.
 *
 * ⚠️ ספר בלי קטגוריה נופל לסוף ולא לראש — אחרת שלושת ספרי הדמו
 * היו פותחים את החנות.
 */
export function categoryOrder(sku: string): number {
  const m = String(sku ?? '').match(/^(\d{2})/)
  return m ? Number(m[1]) : 9999
}

/**
 * האם הספר זמין להזמנה.
 *
 * 🔴 הדגל נבדק *לפני* המספר: ספר "הזמנה מהמו״ל" מחזיק stock_total = 0
 * לצמיתות, ובדיקת המספר בלבד הייתה מציגה "אזל" על רוב הקטלוג.
 *
 * ⚠️ אותה בדיקה בדיוק לאתר ולטלפון — המלאי משותף.
 */
export function isAvailable(b: { unlimited_stock?: boolean; stock_total: number }): boolean {
  return b.unlimited_stock === true || b.stock_total > 0
}

/**
 * שולף את הקטלוג הציבורי.
 *
 * ⚠️ fetchAllRows: PostgREST קוטע ב-1,000 שורות בשקט, וקטלוג חתוך
 * נראה בדיוק כמו קטלוג מלא.
 *
 * 🔴 ספרים מוסתרים (is_hidden) אינם נשלפים: ספר בדיקת סליקה חייב להיות
 * ניתן להזמנה במק"ט ישיר, אך אסור שלקוח יתקל בו בקטלוג או בחיפוש.
 *
 * 🔴 המיון לפי *קטגוריה* ולא לפי א"ב: הקטלוג המודפס בנוי בקטגוריות,
 * והחנות צריכה להיראות כמוהו. בתוך קטגוריה — לפי המק"ט, שהוא סדר
 * הקטלוג עצמו.
 *
 * ⚠️ המיון נעשה בצד שלנו ולא ב-order() של PostgREST: הקטגוריה נגזרת
 * מקידומת המק"ט (ראו categoryOrder), ואין עמודה שאפשר למיין לפיה.
 */
export async function fetchPublicCatalog(
  db: SupabaseClient,
): Promise<{ books: PublicBook[]; error?: string }> {
  const { rows, error } = await fetchAllRows<Row>((from, to) =>
    db.from('book_fair_books')
      .select(PUBLIC_COLUMNS)
      .eq('is_active', true)
      .eq('is_hidden', false)
      .order('sort_order', { ascending: true })
      .order('sku', { ascending: true })
      .range(from, to)
  )

  if (error) return { books: [], error: typeof error === 'string' ? error : 'טעינת הקטלוג נכשלה' }

  const books = rows.map(({ stock_total, unlimited_stock, ...b }) => ({
    ...b,
    in_stock: isAvailable({ stock_total, unlimited_stock }),
  }))

  books.sort((a, b) => {
    const ca = categoryOrder(a.sku), cb = categoryOrder(b.sku)
    if (ca !== cb) return ca - cb
    // ⚠️ localeCompare עם 'he': ה-collation של המסד אינו סדר האלפבית
    // העברי, ומיון טקסטואלי רגיל נותן סדר אקראי למראה.
    return a.sku.localeCompare(b.sku, 'he', { numeric: true })
  })

  return { books }
}

/**
 * שליפת ספר בודד לפי מק"ט — כולל מוסתרים.
 *
 * 🔴 הדרך היחידה להגיע לספר בדיקת הסליקה. אינו עובר דרך הקטלוג
 * ולכן אינו נחשף למי שלא יודע את המק"ט המדויק.
 */
export async function fetchBookBySku(
  db: SupabaseClient,
  sku: string,
): Promise<PublicBook | null> {
  // 🔴 תווי ה-wildcard של ilike (% ו-_) נזרקים: מק"ט "%" היה מחזיר
  // את הספר הראשון בטבלה, כולל ספר מוסתר, למי שסתם ניחש.
  const clean = String(sku ?? '').trim().replace(/[%_\\]/g, '')
  if (!clean) return null

  const { data } = await db.from('book_fair_books')
    .select(PUBLIC_COLUMNS)
    .eq('is_active', true)
    .ilike('sku', clean)
    .limit(1)
    .maybeSingle()

  if (!data) return null
  const { stock_total, unlimited_stock, ...b } = data as Row
  return { ...b, in_stock: isAvailable({ stock_total, unlimited_stock }) }
}
