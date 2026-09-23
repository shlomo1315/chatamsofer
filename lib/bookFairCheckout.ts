// ─────────────────────────────────────────────────────────────────────────────
// יריד ספרים — ולידציית צ'קאאוט ובניית ההזמנה.
//
// טהור בכוונה: בלי מסד, בלי רשת, בלי תאריכים. כל כלל שקובע אם הזמנה
// תקינה נבדק כאן ביחידה, ולא מתגלה שבור בצ'קאאוט של לקוח אמיתי.
// ─────────────────────────────────────────────────────────────────────────────

import { cartTotals, type CartLineInput } from './bookFairPricing'
import { shippingCost, totalVolumes, type TierInput } from './bookFairShipping'
import type { BookFairDeliveryMethod } from '@/types/bookFair'

export interface CheckoutItem {
  book_id: string
  title: string
  sku: string
  volumes: number
  unit_price_agorot: number
  quantity: number
}

export interface CheckoutInput {
  items: CheckoutItem[]
  delivery_method: BookFairDeliveryMethod
  city_id?: string | null
  address_text?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
}

export interface CheckoutValidation {
  ok: boolean
  errors: string[]
  totals?: {
    items_total_agorot: number
    shipping_agorot: number
    total_agorot: number
    book_count: number
  }
}

/** ⚠️ מספר נייד או נייח ישראלי. הנייח מתקבל — הוא נפוץ אצל קהל היעד. */
const PHONE_RE = /^0(5\d|[2-4]|[8-9]|7\d)\d{7}$/
/** ⚠️ בדיקה מכוונת-רחבה: תפקידה לתפוס שגיאת הקלדה, לא לאמת קיום תיבה. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** ניקוי תווי כיווניות בלתי נראים — מגיעים מהדבקה ושוברים בדיקות תקינות. */
function clean(v: string | null | undefined): string {
  return String(v ?? '').replace(/[‎‏‪-‮⁦-⁩]/g, '').trim()
}

/** נרמול טלפון: מסיר מקפים ורווחים, וממיר קידומת בינלאומית. */
export function normalizePhone(raw: string | null | undefined): string {
  let s = clean(raw).replace(/[-\s()]/g, '')
  if (s.startsWith('+972')) s = '0' + s.slice(4)
  else if (s.startsWith('972')) s = '0' + s.slice(3)
  return s
}

/**
 * ולידציה מלאה של צ'קאאוט + חישוב הסכומים.
 *
 * 🔴 המחירים נלקחים מהפרמטר `items` שמגיע מהשרת אחרי שליפה מהמסד,
 * ולעולם לא מהלקוח. לקוח ששולח מחיר משלו היה קונה בכל סכום שירצה.
 * הפונקציה הזו אינה יודעת מאין הגיעו המספרים — האחריות על הקורא,
 * וזה מתועד בנתיב ה-API.
 */
export function validateCheckout(
  input: CheckoutInput,
  tiers: TierInput[],
  knownCityIds: string[]
): CheckoutValidation {
  const errors: string[] = []

  if (!input.items.length) {
    return { ok: false, errors: ['העגלה ריקה'] }
  }

  for (const it of input.items) {
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
      errors.push(`כמות לא תקינה עבור "${it.title}"`)
    }
    if (!Number.isInteger(it.unit_price_agorot) || it.unit_price_agorot < 0) {
      errors.push(`מחיר לא תקין עבור "${it.title}"`)
    }
  }

  const name = clean(input.customer_name)
  if (name.length < 2) errors.push('יש להזין שם מלא')

  const phone = normalizePhone(input.customer_phone)
  if (!PHONE_RE.test(phone)) errors.push('מספר טלפון לא תקין')

  // ⚠️ אימייל אינו חובה: לקוח שאין לו יקבל את מספר ההזמנה על המסך.
  // חסימה כאן הייתה מונעת רכישה ממי שפשוט אין לו כתובת.
  const email = clean(input.customer_email)
  if (email && !EMAIL_RE.test(email)) errors.push('כתובת אימייל לא תקינה')

  if (input.delivery_method === 'shipping') {
    const cityId = clean(input.city_id)
    if (!cityId) {
      errors.push('יש לבחור עיר למשלוח')
    } else if (!knownCityIds.includes(cityId)) {
      // 🔴 הרשימה סגורה: עיר שאינה בה היא יעד שאיננו משלחים אליו.
      // הבדיקה מול הרשימה ולא מול טקסט חופשי מונעת גם התחזות בשדה.
      errors.push('איננו משלחים לעיר שנבחרה')
    }
    if (clean(input.address_text).length < 5) {
      errors.push('יש להזין כתובת מלאה למשלוח')
    }
  }

  if (errors.length) return { ok: false, errors }

  // ── חישוב ──
  const lines: CartLineInput[] = input.items.map(i => ({
    unit_price_agorot: i.unit_price_agorot, quantity: i.quantity,
  }))
  // 🔴 כרכים ולא פריטים: "שו״ת חתם סופר" הוא פריט אחד בן 6 כרכים,
  // ומשלוחו עולה כמו 6 ספרים. ספירת פריטים תמחרה אותו כחוברת אחת.
  const volumeCount = totalVolumes(input.items)
  const shipping = shippingCost(input.delivery_method, volumeCount, tiers)

  // 🔴 null פירושו "אין מדרגת משלוח מתאימה" — ולא חינם. המשך בסכום 0
  // היה גורם לעמותה לשלוח על חשבונה בלי שאיש ידע.
  if (shipping === null) {
    return {
      ok: false,
      errors: [`לא הוגדר תעריף משלוח ל-${volumeCount} כרכים. אנא צרו קשר.`],
    }
  }

  const totals = cartTotals(lines, shipping)
  return {
    ok: true,
    errors: [],
    totals: {
      items_total_agorot: totals.items_total_agorot,
      shipping_agorot: totals.shipping_agorot,
      total_agorot: totals.total_agorot,
      book_count: totals.book_count,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// מספר הזמנה
// ─────────────────────────────────────────────────────────────────────────────

/**
 * מספר הזמנה קריא: `BF-26-4F7K2A`.
 *
 * ⚠️ לא רץ (1,2,3): מספר רץ חושף כמה הזמנות התקבלו, ומזמין ניחוש של
 * הזמנות אחרות. הסיומת אקראית ובסיס 36, כך שהיא קצרה מספיק להקראה
 * בטלפון וקשה לניחוש.
 *
 * ⚠️ בלי 0/O/1/I: הוא מוקרא בקול ומוקלד חזרה, ובלבול ביניהם מבטיח
 * שהלקוח יזין מספר שגוי.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function makeOrderNumber(year: number, rand: () => number = Math.random): string {
  const yy = String(year % 100).padStart(2, '0')
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    suffix += ALPHABET[Math.floor(rand() * ALPHABET.length)]
  }
  return `BF-${yy}-${suffix}`
}

/**
 * אסימון עגלה — מזהה את השריון עד לתשלום.
 * ⚠️ חייב להיות באורך 8 לפחות: פונקציית השריון במסד דוחה קצר מזה.
 */
export function makeCartToken(rand: () => number = Math.random): string {
  return 'c' + Array.from({ length: 24 }, () =>
    ALPHABET[Math.floor(rand() * ALPHABET.length)]
  ).join('').toLowerCase()
}
