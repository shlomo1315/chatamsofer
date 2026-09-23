// ─────────────────────────────────────────────────────────────────────────────
// טיפוסי מחלקת "יריד ספרים".
//
// ⚠️ SectionKey ('book_fair') נשאר ב-types/index.ts ואינו עובר לכאן — הוא
// מקור אמת יחיד לכל מטריצת ההרשאות, ופיצולו היה מזמין מחלקה שנולדת דולפת.
//
// 🔴 כל סכום כאן הוא *אגורות כמספר שלם*, וכל שדה נושא סיומת _agorot מפורשת.
// ראו הנימוק המלא ב-supabase/migrations/20260922_book_fair.sql. בקצרה:
// עגלה מחברת פריטים ומשווה את הסכום לאגורה מול מה שהסליקה חייבה — השוואת
// שלמים ודאית, השוואת שברים עשרוניים אינה.
// ─────────────────────────────────────────────────────────────────────────────

/** ערוץ המכירה. המלאי מופרד קשיחות בין השניים — אין גלישה. */
export type BookFairChannel = 'web' | 'phone'

export type BookFairOrderStatus =
  | 'pending_payment'     // נוצרה, טרם שולמה
  | 'payment_mismatch'    // נגבה סכום שאינו תואם — לבדיקת אנוש
  | 'paid'                // שולם ואומת
  | 'picking'             // בליקוט
  | 'packed'              // נארז
  | 'shipped'             // נשלח
  | 'delivered'           // נמסר
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'

export type BookFairDeliveryMethod = 'pickup' | 'shipping'

export type BookFairReservationStatus = 'held' | 'consumed' | 'released' | 'expired'

export type BookFairStockReason =
  | 'import' | 'restock' | 'reserve' | 'release' | 'consume'
  | 'move_in' | 'move_out' | 'adjust' | 'refund'

export type BookFairPaymentStatus = 'initiated' | 'success' | 'failed' | 'refunded'

// ─────────────────────────────────────────────────────────────────────────────
// רשומות
// ─────────────────────────────────────────────────────────────────────────────

export interface BookFairBook {
  id: string
  sku: string                    // מק"ט — ייחודי ללא תלות ברישיות
  title: string
  author?: string | null
  publisher?: string | null
  volumes: number                // מספר כרכים (לאריזה ולוגיסטיקה)
  price_agorot: number
  image_path?: string | null     // נתיב ב-storage, לא URL
  description?: string | null
  /** 🔴 מכסת האתר. נפרדת לחלוטין מ-stock_phone — נגמרה, הטלפון ממשיך. */
  stock_web: number
  /** 🔴 מכסת הטלפון. העברה בין השתיים ידנית בלבד. */
  stock_phone: number
  /**
   * 🔴 ספר שאינו מוגבל במלאי (הזמנה מהמו״ל) — תמיד זמין.
   *
   * ⚠️ כשtrue, stock_web/stock_phone חסרי משמעות: אין שריון, אין ניכוי
   * ואין רישום ביומן. כל בדיקת זמינות חייבת לבדוק את הדגל *לפני*
   * המספר, אחרת ספר כזה עם מלאי 0 יוצג כ"אזל" בזמן שאפשר להזמינו.
   */
  unlimited_stock: boolean
  phone_code?: number | null     // קוד להקשה בשלוחה
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface BookFairCity {
  id: string
  name: string
  phone_code?: number | null
  is_active: boolean
  sort_order: number
  created_at: string
}

/**
 * מדרגת משלוח לפי *כמות ספרים*.
 * ⚠️ max_books = null פירושו "ומעלה" (המדרגה העליונה). הגבולות כוללים.
 */
export interface BookFairShippingTier {
  id: string
  /** ⚠️ כרכים ולא ספרים — השם היסטורי. ראו מיגרציה 20260923. */
  min_books: number
  max_books: number | null
  price_agorot: number
  /** מדרגה פתוחה: כל step_volumes כרכים מעל המינימום מוסיפים step_agorot. */
  step_volumes: number | null
  step_agorot: number | null
  created_at: string
}

export interface BookFairOrderItem {
  id: string
  order_id: string
  book_id?: string | null        // null אם הספר נמחק מהקטלוג
  /** 🔴 צילום מצב: השם והמחיר כפי שהיו ברגע הרכישה, לא כפי שהם היום. */
  title_snapshot: string
  sku_snapshot?: string | null
  volumes_snapshot: number
  unit_price_agorot: number
  quantity: number
  line_total_agorot: number
  created_at: string
}

export interface BookFairOrder {
  id: string
  order_number: string           // BF-26-0417
  channel: BookFairChannel
  status: BookFairOrderStatus
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  delivery_method: BookFairDeliveryMethod
  city_id?: string | null
  address_text?: string | null
  /** אומת מול ההקלטה במסך הניהול (רלוונטי למשלוח מהטלפון). */
  address_confirmed: boolean
  items_total_agorot: number
  shipping_agorot: number
  /** 🔴 נצרב בעת ההזמנה ואינו מחושב מחדש — זה הסכום שנגבה בפועל. */
  total_agorot: number
  refunded_agorot: number
  tracking_token?: string | null
  notes?: string | null
  created_by?: string | null
  paid_at?: string | null
  created_at: string
  updated_at: string
  // joins אופציונליים
  items?: BookFairOrderItem[]
  /**
   * 🔴 שתי הצורות במכוון: join של Supabase מוטפס כמערך גם ביחס
   * רבים-לאחד, ומגיע בפועל פעם כאובייקט ופעם כמערך, תלוי בהקשר.
   *
   * ⚠️ הרחבת הטיפוס ולא `as unknown as` בצרכן: ההמרה הכפויה מסתירה
   * את אי-ההתאמה במקום לטפל בה, וכבר הפילה במערכת פעולה אחת בשקט.
   * מי שקורא בשדה חייב לנרמל: `Array.isArray(x) ? x[0] : x`.
   */
  city?: BookFairCity | BookFairCity[] | null
}

/** נרמול join שעשוי להגיע כמערך או כאובייקט יחיד. */
export function oneOf<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export interface BookFairReservation {
  id: string
  book_id: string
  channel: BookFairChannel
  quantity: number
  cart_token: string
  order_id?: string | null
  status: BookFairReservationStatus
  expires_at: string
  created_at: string
}

export interface BookFairStockEntry {
  id: string
  book_id?: string | null
  channel: BookFairChannel
  delta: number
  reason: BookFairStockReason
  order_id?: string | null
  note?: string | null
  created_by?: string | null
  created_at: string
}

export interface BookFairRecording {
  id: string
  order_id?: string | null
  call_id?: string | null
  kind: 'address' | 'name' | 'note'
  provider_path?: string | null
  storage_path?: string | null
  /** ⚠️ ניסיון בלבד — יכול להישאר null. האישור מול הלקוח על ההקלטה. */
  transcript?: string | null
  transcript_source?: string | null
  duration_sec?: number | null
  created_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// תוויות וצבעים
// ─────────────────────────────────────────────────────────────────────────────

export const BOOK_FAIR_STATUS_LABELS: Record<BookFairOrderStatus, string> = {
  pending_payment:    'ממתין לתשלום',
  payment_mismatch:   'אי-התאמה בסכום',
  paid:               'שולם',
  picking:            'בליקוט',
  packed:             'נארז',
  shipped:            'נשלח',
  delivered:          'נמסר',
  failed:             'תשלום נכשל',
  cancelled:          'בוטל',
  refunded:           'זוכה',
  partially_refunded: 'זוכה חלקית',
}

export const BOOK_FAIR_STATUS_COLORS: Record<BookFairOrderStatus, string> = {
  pending_payment:    'bg-amber-50 text-amber-700 border-amber-200',
  // ⚠️ אדום ובולט בכוונה: הכסף נגבה אך אינו תואם להזמנה, ונדרשת הכרעת אנוש.
  payment_mismatch:   'bg-red-50 text-red-700 border-red-200',
  paid:               'bg-emerald-50 text-emerald-700 border-emerald-200',
  picking:            'bg-sky-50 text-sky-700 border-sky-200',
  packed:             'bg-indigo-50 text-indigo-700 border-indigo-200',
  shipped:            'bg-violet-50 text-violet-700 border-violet-200',
  delivered:          'bg-teal-50 text-teal-700 border-teal-200',
  failed:             'bg-rose-50 text-rose-700 border-rose-200',
  cancelled:          'bg-slate-100 text-slate-600 border-slate-200',
  refunded:           'bg-orange-50 text-orange-700 border-orange-200',
  partially_refunded: 'bg-orange-50 text-orange-700 border-orange-200',
}

export const BOOK_FAIR_CHANNEL_LABELS: Record<BookFairChannel, string> = {
  web:   'אתר',
  phone: 'טלפון',
}

export const BOOK_FAIR_DELIVERY_LABELS: Record<BookFairDeliveryMethod, string> = {
  pickup:   'איסוף עצמי',
  shipping: 'משלוח',
}

export const BOOK_FAIR_STOCK_REASON_LABELS: Record<BookFairStockReason, string> = {
  import:   'ייבוא מאקסל',
  restock:  'קבלת סחורה',
  reserve:  'שריון',
  release:  'שחרור שריון',
  consume:  'מימוש הזמנה',
  move_in:  'העברה פנימה',
  move_out: 'העברה החוצה',
  adjust:   'תיקון ידני',
  refund:   'החזרה מזיכוי',
}
