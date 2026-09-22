// ─────────────────────────────────────────────────────────────────────────────
// יריד ספרים — כסף. מקור אמת יחיד לכל חישוב סכום במחלקה.
//
// 🔴 כל סכום פנימי הוא *אגורות כמספר שלם*. שקלים קיימים רק בשני מקומות:
// בגבול הקלט (אקסל, טופס) ובגבול הפלט (תצוגה, שליחה לסליקה).
//
// ⚠️ למה זה קריטי דווקא כאן, ולא בשאר המערכת: עגלת קניות מחברת
// מחיר × כמות על כמה פריטים, מוסיפה משלוח, ואז משווה את התוצאה *לאגורה*
// מול מה שחברת הסליקה חייבה בפועל. השוואת מספרים שלמים ודאית;
// השוואת שברים עשרוניים מייצרת אי-התאמה מדומה על הזמנה תקינה.
//
// 🔴 parseFloat('45.90') * 100 אינו 4590 אלא 4589.999999999999 —
// ולכן Math.round בכל המרה אינו קישוט אלא תנאי לנכונות.
// ─────────────────────────────────────────────────────────────────────────────

/** שגיאת המרה — מובחנת מ-0, שהוא סכום חוקי. */
export const INVALID_AMOUNT = null

/**
 * שקלים (מחרוזת או מספר) → אגורות.
 *
 * מקבל: `"45.90"`, `45.9`, `"45.90 ₪"`, `"1,250"`, `"₪45"`.
 * מחזיר `null` על קלט שאינו מספר — ולא 0, שהוא מחיר חוקי (ספר חינם).
 *
 * ⚠️ מסיר פסיקים ותווי מטבע לפני הפענוח: קובץ אקסל אמיתי מכיל
 * "₪1,250.00" לא פחות משהוא מכיל "1250".
 */
export function shekelsToAgorot(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return INVALID_AMOUNT
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return INVALID_AMOUNT
    return Math.round(input * 100)
  }

  // ⚠️ מנקה פסיקים, סימני מטבע, רווחים (כולל רווח קשיח) ותווי כיווניות.
  // תווי כיווניות מגיעים מהדבקה מ-Word ומאקסל בעברית, והם בלתי נראים —
  // מספר שנראה תקין לחלוטין נכשל בלעדיהם.
  const cleaned = input
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/[₪$]/g, '')
    .replace(/[,\s ]/g, '')
    .trim()

  if (!cleaned) return INVALID_AMOUNT
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return INVALID_AMOUNT

  const n = parseFloat(cleaned)
  if (!Number.isFinite(n) || n < 0) return INVALID_AMOUNT
  return Math.round(n * 100)
}

/** אגורות → שקלים כמספר. לשימוש בגבול היציאה בלבד (סליקה). */
export function agorotToShekels(agorot: number): number {
  return Math.round(agorot) / 100
}

/**
 * אגורות → מחרוזת לסליקה: `"45.90"`.
 * ⚠️ תמיד שתי ספרות אחרי הנקודה, בלי סימן מטבע ובלי מפריד אלפים.
 */
export function agorotToPaymentString(agorot: number): string {
  return (Math.round(agorot) / 100).toFixed(2)
}

/**
 * אגורות → תצוגה בעברית: `₪45.90`, `₪120`.
 *
 * ⚠️ מפריד אלפים ב-en-US ולא ב-he-IL: he-IL מוסיף תווי כיווניות שנשברים
 * במייל ובאקסל והמספר נראה הפוך. אותו שיקול בדיוק כמו ב-lib/loanCurrency.
 * ⚠️ אגורות עגולות מוצגות בלי ".00" — "₪120" ולא "₪120.00".
 */
export function fmtAgorot(agorot: number | null | undefined): string {
  if (agorot === null || agorot === undefined || !Number.isFinite(agorot)) return '—'
  const shekels = Math.round(agorot) / 100
  const hasFraction = Math.round(agorot) % 100 !== 0
  const formatted = shekels.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })
  return `₪${formatted}`
}

/**
 * אגורות → מספר שלם להקראה בטלפון.
 *
 * 🔴 מודול הטלפוניה מקריא `{"number": "120"}` כ"מאה עשרים". אגורות שבורות
 * אינן ניתנות להקראה טבעית, ולכן המחיר מעוגל *כלפי מעלה* לשקל השלם —
 * לעולם לא כלפי מטה, כדי שלא נקריא ללקוח סכום נמוך ממה שייגבה.
 *
 * ⚠️ מחזיר מחרוזת ולא מספר: זה מה שנכנס ישירות לשדה `number` ב-JSON.
 */
export function agorotToSpokenShekels(agorot: number): string {
  return String(Math.ceil(Math.round(agorot) / 100))
}

// ─────────────────────────────────────────────────────────────────────────────
// חישוב עגלה
// ─────────────────────────────────────────────────────────────────────────────

export interface CartLineInput {
  unit_price_agorot: number
  quantity: number
}

export interface CartTotals {
  /** סך כל הפריטים, לפני משלוח. */
  items_total_agorot: number
  /** מספר הספרים (סכום הכמויות) — הבסיס לתמחור המשלוח. */
  book_count: number
  shipping_agorot: number
  total_agorot: number
}

/**
 * סכום שורה בודדת: מחיר יחידה × כמות.
 * ⚠️ שני שלמים — אין כאן שום מקום לאי-דיוק.
 */
export function lineTotal(line: CartLineInput): number {
  return Math.round(line.unit_price_agorot) * Math.round(line.quantity)
}

/**
 * סיכום עגלה שלם.
 *
 * ⚠️ `shipping_agorot` נמסר מבחוץ ואינו מחושב כאן — חישוב המדרגה יושב
 * ב-lib/bookFairShipping.ts, כדי שחישוב הכסף וחישוב המשלוח ייבדקו בנפרד.
 */
export function cartTotals(lines: CartLineInput[], shippingAgorot: number): CartTotals {
  let items = 0
  let count = 0
  for (const l of lines) {
    items += lineTotal(l)
    count += Math.round(l.quantity)
  }
  const shipping = Math.max(0, Math.round(shippingAgorot))
  return {
    items_total_agorot: items,
    book_count: count,
    shipping_agorot: shipping,
    total_agorot: items + shipping,
  }
}

/**
 * האם הסכום שנגבה תואם להזמנה.
 *
 * 🔴 השוואה מדויקת בין שלמים, בלי סובלנות. הזמנה שאינה תואמת נכנסת
 * ל-'payment_mismatch' ועולה להכרעת אנוש — לעולם לא מסומנת כשולמה.
 * ⚠️ אי-שוויון בשני הכיוונים חשוד: חיוב יתר פוגע בלקוח, חיוב חסר פוגע
 * בעמותה, ושניהם מעידים שמשהו בזרימה אינו כשורה.
 */
export function amountMatches(chargedAgorot: number, orderTotalAgorot: number): boolean {
  return Math.round(chargedAgorot) === Math.round(orderTotalAgorot)
}

// ─────────────────────────────────────────────────────────────────────────────
// תמונת כריכה
// ─────────────────────────────────────────────────────────────────────────────

/**
 * כתובת ציבורית לתמונת כריכה, או null כשאין תמונה.
 *
 * ⚠️ נבנית מכתובת Supabase ולא נשמרת במסד: כתובת מלאה שנשמרת בשורה
 * הופכת שגויה ברגע שהפרויקט עובר או שהדומיין משתנה, והתמונות נשברות
 * בשקט בכל הקטלוג.
 */
export function bookImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  return `${base}/storage/v1/object/public/book-fair-images/${imagePath}`
}
