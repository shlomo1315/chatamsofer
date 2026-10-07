import { getServiceClient } from '@/lib/apiAuth'
import { fetchPublicCatalog, type PublicBook } from '@/lib/bookFairCatalog'
import { PICKUP_CONFIG_KEY, mergePickupConfig, pickupStatus, type PickupConfig } from '@/lib/bookFairPickup'

export type { PublicBook }
export type PublicCity = { id: string; name: string }
export type PublicTier = {
  min_books: number; max_books: number | null; price_agorot: number
  step_volumes: number | null; step_agorot: number | null
}

/**
 * ⚠️ preview: true עוקף את בדיקת book_fair_open ומציג את החנות המלאה.
 * משמש רק ע"י /yerid101315 — נתיב נסתר (לא מקושר משום עמוד באתר, לא
 * ב-sitemap) לתצוגה מקדימה של הצוות לפני הפתיחה הרשמית. אינו כותב
 * open=true במסד: /api/yerid/checkout ממשיך לדחות הזמנות אמיתיות כל
 * עוד היריד סגור בפועל — זו תצוגה בלבד, לא פתיחה.
 */
export async function getData(preview = false) {
  const db = getServiceClient()
  if (!db) return { books: [] as PublicBook[], cities: [], tiers: [], open: false, openAt: null, pickup: null, seasonClosed: false }

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
  const [{ data: gate }, { data: at }, { data: season }] = await Promise.all([
    db.from('app_settings').select('value').eq('key', 'book_fair_open').maybeSingle(),
    db.from('app_settings').select('value').eq('key', 'book_fair_open_at').maybeSingle(),
    db.from('app_settings').select('value').eq('key', 'book_fair_season_closed').maybeSingle(),
  ])
  const openAt = String((at as { value?: string } | null)?.value ?? '') || null

  // 🔴 "היריד נסגר לשנה זו" גובר על הכול (lib/bookFairOpening SEASON_CLOSED_KEY).
  // ⚠️ preview (הנתיב הנסתר) עוקף גם אותו — לבדיקות לקראת השנה הבאה.
  if (!preview && String((season as { value?: string } | null)?.value ?? '') === 'true') {
    return { books: [] as PublicBook[], cities: [], tiers: [], open: false, openAt, pickup: null, seasonClosed: true }
  }

  // 🔴 ברירת המחדל היא *סגור*: מפתח חסר פירושו שאיש לא פתח את היריד
  // עדיין, ופתיחה מכללא הייתה חושפת קטלוג שטרם הוכן ומקבלת הזמנות
  // על מלאי שלא נבדק. חייב להיות זהה לבדיקה ב-api/yerid/checkout,
  // אחרת המסך יציג "סגור" בעוד ההזמנות מתקבלות.
  const open = String(gate?.value ?? '') === 'true' || preview
  if (!open) return { books: [] as PublicBook[], cities: [], tiers: [], open: false, openAt, pickup: null, seasonClosed: false }

  // ── שלב ב: הקטלוג — רק אחרי שהיריד פתוח ──
  const [{ books }, { data: cities }, { data: tiers }, { data: pickupRow }] = await Promise.all([
    fetchPublicCatalog(db),
    db.from('book_fair_cities').select('id, name').eq('is_active', true).order('sort_order'),
    // ⚠️ step_volumes/step_agorot נשלפים גם הם: בלעדיהם המדרגה הפתוחה
    // מוצגת ללקוח כמחיר קבוע, בעוד שהשרת גובה תוספת מדורגת.
    db.from('book_fair_shipping_tiers')
      .select('min_books, max_books, price_agorot, step_volumes, step_agorot')
      .order('min_books'),
    db.from('app_settings').select('value').eq('key', PICKUP_CONFIG_KEY).maybeSingle(),
  ])

  // ── חלון האיסוף העצמי ──
  //
  // 🔴 מחושב בשרת ולא בלקוח: שעון הדפדפן נתון לשינוי, ולקוח עם שעון
  // מוטה היה רואה "איסוף זמין" אחרי הסגירה (או להפך). ראו lib/bookFairPickup.
  let pickupCfg: PickupConfig
  try {
    pickupCfg = mergePickupConfig(pickupRow?.value ? JSON.parse(String(pickupRow.value)) : null)
  } catch {
    pickupCfg = mergePickupConfig(null)
  }
  const pickup = { ...pickupStatus(pickupCfg, new Date()), ready_hours: pickupCfg.ready_hours }

  return {
    books,
    cities: (cities ?? []) as PublicCity[],
    tiers: (tiers ?? []) as PublicTier[],
    open: true,
    openAt,
    pickup,
    seasonClosed: false,
  }
}
