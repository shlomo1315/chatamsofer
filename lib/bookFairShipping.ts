// ─────────────────────────────────────────────────────────────────────────────
// יריד ספרים — תמחור משלוח.
//
// 🔴 התעריף נקבע לפי *כמות הספרים* בהזמנה, ולא לפי היעד ולא לפי הסכום.
// זו הכרעת המשתמש, והיא הסיבה שאין עמודת מחיר בטבלת הערים.
//
// המשלוח מוגבל לרשימה סגורה של ערים. הרשימה הסגורה היא גם אימות הכתובת:
// לקוח בוחר מתוכה במקום להקליד יעד שאיננו משלחים אליו.
// ─────────────────────────────────────────────────────────────────────────────

import type { BookFairShippingTier } from '@/types/bookFair'

/** מדרגה לצורך חישוב — תת-קבוצה של השדות שבמסד. */
export interface TierInput {
  min_books: number
  /** null = "ומעלה" (המדרגה העליונה). הגבולות כוללים משני הצדדים. */
  max_books: number | null
  price_agorot: number
}

/**
 * מחיר המשלוח למספר ספרים נתון.
 *
 * מחזיר `null` כשאין מדרגה מתאימה — ולא 0. 🔴 ההבחנה קריטית: 0 פירושו
 * "משלוח חינם" ו-null פירושו "לא יודע כמה לגבות". הצגת חינם על טבלת
 * מדרגות שגויה תגרום לעמותה לשלוח על חשבונה.
 *
 * ⚠️ המדרגה הראשונה שמתאימה זוכה, לאחר מיון לפי min_books. חפיפה בין
 * מדרגות אינה זורקת כאן — validateTiers תופס אותה במסך ההגדרות, לפני
 * שהיא מגיעה ללקוח.
 */
export function resolveShippingTier(bookCount: number, tiers: TierInput[]): number | null {
  if (!Number.isFinite(bookCount) || bookCount <= 0) return null
  if (!tiers.length) return null

  const sorted = [...tiers].sort((a, b) => a.min_books - b.min_books)
  for (const t of sorted) {
    const min = t.min_books
    const max = t.max_books
    if (bookCount >= min && (max === null || bookCount <= max)) {
      return Math.max(0, Math.round(t.price_agorot))
    }
  }
  return null
}

/**
 * מחיר המשלוח בפועל, לפי שיטת האיסוף.
 * ⚠️ איסוף עצמי תמיד 0 — בלי לגעת בטבלת המדרגות כלל.
 */
export function shippingCost(
  method: 'pickup' | 'shipping',
  bookCount: number,
  tiers: TierInput[]
): number | null {
  if (method === 'pickup') return 0
  return resolveShippingTier(bookCount, tiers)
}

// ─────────────────────────────────────────────────────────────────────────────
// ולידציה של טבלת המדרגות
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ הולידציה כאן ולא כ-constraint במסד: היא צריכה להניב הודעה בעברית
// במסך ההגדרות, *לפני* השמירה, ולהיבדק ביחידה בלי מסד.

export interface TierValidationResult {
  ok: boolean
  errors: string[]
}

/**
 * בודק שטבלת המדרגות שלמה ועקבית.
 *
 * 🔴 שלוש התקלות שנתפסות כאן, וכולן מתגלות אצל הלקוח אם לא:
 *   • **פער** — 5 ספרים לא נופלים בשום מדרגה ⇒ אי אפשר להזמין
 *   • **חפיפה** — שתי מדרגות מכסות 4 ספרים ⇒ המחיר תלוי בסדר המיון
 *   • **אין מדרגה עליונה** — 50 ספרים לא נופלים בשום מקום
 */
export function validateTiers(tiers: TierInput[]): TierValidationResult {
  const errors: string[] = []
  if (!tiers.length) {
    return { ok: false, errors: ['לא הוגדרה אף מדרגת משלוח'] }
  }

  for (const t of tiers) {
    if (!Number.isInteger(t.min_books) || t.min_books < 1) {
      errors.push(`מדרגה פסולה: "מ-" חייב להיות מספר שלם מ-1 ומעלה`)
    }
    if (t.max_books !== null && (!Number.isInteger(t.max_books) || t.max_books < t.min_books)) {
      errors.push(`מדרגה ${t.min_books}: "עד" חייב להיות גדול או שווה ל-"מ-"`)
    }
    if (!Number.isInteger(t.price_agorot) || t.price_agorot < 0) {
      errors.push(`מדרגה ${t.min_books}: מחיר פסול`)
    }
  }
  if (errors.length) return { ok: false, errors }

  const sorted = [...tiers].sort((a, b) => a.min_books - b.min_books)

  // חייבת להתחיל מספר אחד
  if (sorted[0].min_books !== 1) {
    errors.push(`המדרגה הראשונה חייבת להתחיל מספר אחד (מתחילה מ-${sorted[0].min_books})`)
  }

  // רצף בלי פערים ובלי חפיפות
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i]
    const next = sorted[i + 1]
    if (cur.max_books === null) {
      errors.push(`מדרגה "${cur.min_books} ומעלה" חייבת להיות האחרונה`)
      continue
    }
    if (next.min_books <= cur.max_books) {
      errors.push(`חפיפה: המדרגות ${cur.min_books}-${cur.max_books} ו-${next.min_books}-${next.max_books ?? 'ומעלה'} מכסות את אותה כמות`)
    } else if (next.min_books > cur.max_books + 1) {
      errors.push(`פער: אין מדרגה לכמות ${cur.max_books + 1}${next.min_books - 1 > cur.max_books + 1 ? `-${next.min_books - 1}` : ''} ספרים`)
    }
  }

  // 🔴 המדרגה האחרונה חייבת להיות פתוחה, אחרת הזמנה גדולה תיתקע
  const last = sorted[sorted.length - 1]
  if (last.max_books !== null) {
    errors.push(`המדרגה האחרונה חייבת להיות פתוחה ("${last.min_books} ומעלה"), אחרת הזמנה של ${last.max_books + 1} ספרים ומעלה לא תתאפשר`)
  }

  return { ok: errors.length === 0, errors }
}

/** תיאור מדרגה לתצוגה: "1-3 ספרים", "10 ומעלה". */
export function tierLabel(t: Pick<BookFairShippingTier, 'min_books' | 'max_books'>): string {
  if (t.max_books === null) return `${t.min_books} ומעלה`
  if (t.max_books === t.min_books) return `${t.min_books}`
  return `${t.min_books}-${t.max_books}`
}
