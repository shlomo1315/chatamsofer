import { getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import FairStore from './FairStore'

// חנות יריד הספרים.
//
// ⚠️ הקטלוג נטען בשרת ולא בלקוח: הלקוח רואה ספרים מיד, בלי מסך טעינה
// ובלי סבב רשת נוסף. קהל היעד כולל מכשירים ישנים וחיבורים איטיים.

export const dynamic = 'force-dynamic'

export type PublicBook = {
  id: string; sku: string; title: string
  author: string | null; publisher: string | null
  volumes: number; price_agorot: number
  image_path: string | null; description: string | null
  in_stock: boolean
}

export type PublicCity = { id: string; name: string }
export type PublicTier = { min_books: number; max_books: number | null; price_agorot: number }

async function getData() {
  const db = getServiceClient()
  if (!db) return { books: [], cities: [], tiers: [], open: false }

  type Row = Omit<PublicBook, 'in_stock'> & { stock_web: number }

  const [{ rows }, { data: cities }, { data: tiers }, { data: gate }] = await Promise.all([
    // ⚠️ fetchAllRows: PostgREST קוטע ב-1,000 שורות בשקט, וקטלוג חתוך
    // נראה בדיוק כמו קטלוג מלא.
    fetchAllRows<Row>((from, to) =>
      db.from('book_fair_books')
        .select('id, sku, title, author, publisher, volumes, price_agorot, image_path, description, stock_web')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('title', { ascending: true })
        .range(from, to)
    ),
    db.from('book_fair_cities').select('id, name').eq('is_active', true).order('sort_order'),
    db.from('book_fair_shipping_tiers').select('min_books, max_books, price_agorot').order('min_books'),
    db.from('app_settings').select('value').eq('key', 'book_fair_open').maybeSingle(),
  ])

  return {
    // 🔴 הכמות המדויקת אינה נחשפת — רק זמין/אזל. היא מידע תפעולי
    // שמאפשר למפות את המלאי ואת קצב המכירות.
    books: rows.map(({ stock_web, ...b }) => ({ ...b, in_stock: stock_web > 0 })),
    cities: (cities ?? []) as PublicCity[],
    tiers: (tiers ?? []) as PublicTier[],
    // 🔴 ברירת המחדל היא *סגור*: מפתח חסר פירושו שאיש לא פתח את היריד
    // עדיין, ופתיחה מכללא הייתה חושפת קטלוג שטרם הוכן ומקבלת הזמנות
    // על מלאי שלא נבדק. חייב להיות זהה לבדיקה ב-api/fair/checkout,
    // אחרת המסך יציג "סגור" בעוד ההזמנות מתקבלות.
    open: String(gate?.value ?? '') === 'true',
  }
}

export default async function FairPage() {
  const { books, cities, tiers, open } = await getData()
  return <FairStore books={books} cities={cities} tiers={tiers} open={open} />
}
