// ─────────────────────────────────────────────────────────────────────────────
// הקטלוג הציבורי של יריד הספרים — מקור אמת אחד.
//
// 🔴 עד היום השליפה הזו הייתה משוכפלת מילה במילה בשני מקומות:
// app/yerid/page.tsx (SSR של החנות) ו-app/api/yerid/catalog/route.ts.
// כולל כלל הפרטיות "כמות → דגל בלבד". שכפול של כלל פרטיות הוא הזמנה
// לסטייה: תוספת סינון במקום אחד הייתה מותירה את השני חושף יותר.
//
// 🔴 מה *לא* נחשף: stock_web/stock_phone כמספר, phone_code, sort_order.
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
  stock_web: number
  unlimited_stock: boolean
}

const PUBLIC_COLUMNS =
  'id, sku, title, author, publisher, volumes, price_agorot, image_path, description, stock_web, unlimited_stock'

/**
 * האם הספר זמין להזמנה באתר.
 *
 * 🔴 הדגל נבדק *לפני* המספר: ספר "הזמנה מהמו״ל" מחזיק stock_web = 0
 * לצמיתות, ובדיקת המספר בלבד הייתה מציגה "אזל" על רוב הקטלוג.
 */
export function isAvailable(b: { unlimited_stock?: boolean; stock_web: number }): boolean {
  return b.unlimited_stock === true || b.stock_web > 0
}

/**
 * שולף את הקטלוג הציבורי.
 *
 * ⚠️ fetchAllRows: PostgREST קוטע ב-1,000 שורות בשקט, וקטלוג חתוך
 * נראה בדיוק כמו קטלוג מלא.
 */
export async function fetchPublicCatalog(
  db: SupabaseClient,
): Promise<{ books: PublicBook[]; error?: string }> {
  const { rows, error } = await fetchAllRows<Row>((from, to) =>
    db.from('book_fair_books')
      .select(PUBLIC_COLUMNS)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })
      .range(from, to)
  )

  if (error) return { books: [], error: typeof error === 'string' ? error : 'טעינת הקטלוג נכשלה' }

  return {
    books: rows.map(({ stock_web, unlimited_stock, ...b }) => ({
      ...b,
      in_stock: isAvailable({ stock_web, unlimited_stock }),
    })),
  }
}
