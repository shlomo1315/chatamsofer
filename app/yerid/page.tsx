import { getServiceClient } from '@/lib/apiAuth'
import { fetchPublicCatalog, type PublicBook } from '@/lib/bookFairCatalog'
import FairStore from './YeridStore'

// חנות יריד הספרים.
//
// ⚠️ הקטלוג נטען בשרת ולא בלקוח: הלקוח רואה ספרים מיד, בלי מסך טעינה
// ובלי סבב רשת נוסף. קהל היעד כולל מכשירים ישנים וחיבורים איטיים.
//
// ⚠️ השליפה עצמה יושבת ב-lib/bookFairCatalog, משותפת עם
// /api/yerid/catalog. עד היום היא הייתה משוכפלת בשני המקומות — כולל
// כלל הפרטיות "כמות → דגל בלבד" — ושכפול כזה סוטה עם הזמן.

export const dynamic = 'force-dynamic'

// מיוצא מחדש: YeridStore מייבא את הטיפוס מכאן.
export type { PublicBook }

export type PublicCity = { id: string; name: string }
export type PublicTier = {
  min_books: number; max_books: number | null; price_agorot: number
  step_volumes: number | null; step_agorot: number | null
}

async function getData() {
  const db = getServiceClient()
  if (!db) return { books: [] as PublicBook[], cities: [], tiers: [], open: false, openAt: null }

  // ── שלב א: האם היריד פתוח ──
  //
  // 🔴 נשלף לבדו ולפני הקטלוג, ולא במקביל אליו.
  //
  // ⚠️ שליפה מקבילה החזירה את הקטלוג המלא גם כשהיריד סגור, והוא נסע
  // ל-props של הקומפוננטה — כלומר ישב ב-HTML של הדף גם כשהמסך הציג
  // "ייפתח בקרוב". כל הכותרים והמחירים היו גלויים ב"הצג מקור" לפני
  // הפתיחה הרשמית (63 מופעי price_agorot נמדדו בפרודקשן).
  //
  // "לא מרונדר" אינו "לא נשלח". מה שאסור להיחשף — לא נשלף.
  const [{ data: gate }, { data: at }] = await Promise.all([
    db.from('app_settings').select('value').eq('key', 'book_fair_open').maybeSingle(),
    db.from('app_settings').select('value').eq('key', 'book_fair_open_at').maybeSingle(),
  ])
  const openAt = String((at as { value?: string } | null)?.value ?? '') || null

  // 🔴 ברירת המחדל היא *סגור*: מפתח חסר פירושו שאיש לא פתח את היריד
  // עדיין, ופתיחה מכללא הייתה חושפת קטלוג שטרם הוכן ומקבלת הזמנות
  // על מלאי שלא נבדק. חייב להיות זהה לבדיקה ב-api/yerid/checkout,
  // אחרת המסך יציג "סגור" בעוד ההזמנות מתקבלות.
  const open = String(gate?.value ?? '') === 'true'
  if (!open) return { books: [] as PublicBook[], cities: [], tiers: [], open: false, openAt }

  // ── שלב ב: הקטלוג — רק אחרי שהיריד פתוח ──
  const [{ books }, { data: cities }, { data: tiers }] = await Promise.all([
    fetchPublicCatalog(db),
    db.from('book_fair_cities').select('id, name').eq('is_active', true).order('sort_order'),
    // ⚠️ step_volumes/step_agorot נשלפים גם הם: בלעדיהם המדרגה הפתוחה
    // מוצגת ללקוח כמחיר קבוע, בעוד שהשרת גובה תוספת מדורגת.
    db.from('book_fair_shipping_tiers')
      .select('min_books, max_books, price_agorot, step_volumes, step_agorot')
      .order('min_books'),
  ])

  return {
    books,
    cities: (cities ?? []) as PublicCity[],
    tiers: (tiers ?? []) as PublicTier[],
    open: true,
    openAt,
  }
}

export default async function FairPage() {
  const { books, cities, tiers, open, openAt } = await getData()
  return <FairStore books={books} cities={cities} tiers={tiers} open={open} openAt={openAt} />
}
