// ─────────────────────────────────────────────────────────────────────────────
// יריד ספרים — תמחור משלוח.
//
// 🔴 התעריף נקבע לפי *כמות הכרכים* בהזמנה, ולא לפי היעד ולא לפי הסכום.
// זו הכרעת המשתמש, והיא הסיבה שאין עמודת מחיר בטבלת הערים.
//
// ⚠️ כרכים ולא ספרים: "שו״ת חתם סופר" הוא פריט אחד בן 6 כרכים, והוא
// תופס בארגז מקום של 6. ספירת פריטים הייתה מתמחרת אותו כמו חוברת אחת.
// הכמות נגזרת מ-volumes × quantity על כל שורה בעגלה.
//
// ⚠️ שמות העמודות במסד נשארו min_books/max_books מסיבות היסטוריות,
// ומשמעותם כרכים. ראו התיעוד במיגרציה 20260923.
//
// המשלוח מוגבל לרשימה סגורה של ערים. הרשימה הסגורה היא גם אימות הכתובת:
// לקוח בוחר מתוכה במקום להקליד יעד שאיננו משלחים אליו.
// ─────────────────────────────────────────────────────────────────────────────

import type { BookFairShippingTier } from '@/types/bookFair'

/** מדרגה לצורך חישוב — תת-קבוצה של השדות שבמסד. */
export interface TierInput {
  /** מספר הכרכים המינימלי במדרגה. */
  min_books: number
  /** null = "ומעלה" (המדרגה העליונה). הגבולות כוללים משני הצדדים. */
  max_books: number | null
  price_agorot: number
  /**
   * מדרגה פתוחה מתמשכת: כל step_volumes כרכים מעל min_books מוסיפים
   * step_agorot. שתיהן חסרות = מחיר קבוע לכל הכמויות מעל המינימום.
   *
   * 🔴 בלי זה, הזמנה של 90 כרכים עולה כמו הזמנה של 14 — הפסד ודאי
   * לעמותה בסדרות גדולות.
   */
  step_volumes?: number | null
  step_agorot?: number | null
}

/** שורת עגלה לצורך ספירת כרכים. */
export interface VolumeLine {
  volumes: number
  quantity: number
}

/**
 * סך הכרכים בעגלה.
 *
 * ⚠️ volumes כפול quantity: שני עותקים של סדרה בת 6 כרכים הם 12 כרכים
 * בארגז, לא 6.
 */
export function totalVolumes(lines: VolumeLine[]): number {
  return lines.reduce((sum, l) => {
    const v = Number.isFinite(l.volumes) && l.volumes > 0 ? Math.floor(l.volumes) : 1
    const q = Number.isFinite(l.quantity) && l.quantity > 0 ? Math.floor(l.quantity) : 0
    return sum + v * q
  }, 0)
}

/**
 * מחיר המשלוח למספר כרכים נתון.
 *
 * מחזיר `null` כשאין מדרגה מתאימה — ולא 0. 🔴 ההבחנה קריטית: 0 פירושו
 * "משלוח חינם" ו-null פירושו "לא יודע כמה לגבות". הצגת חינם על טבלת
 * מדרגות שגויה תגרום לעמותה לשלוח על חשבונה.
 *
 * ⚠️ המדרגה הראשונה שמתאימה זוכה, לאחר מיון לפי min_books. חפיפה בין
 * מדרגות אינה זורקת כאן — validateTiers תופס אותה במסך ההגדרות, לפני
 * שהיא מגיעה ללקוח.
 */
export function resolveShippingTier(volumeCount: number, tiers: TierInput[]): number | null {
  if (!Number.isFinite(volumeCount) || volumeCount <= 0) return null
  if (!tiers.length) return null

  const sorted = [...tiers].sort((a, b) => a.min_books - b.min_books)
  for (const t of sorted) {
    const min = t.min_books
    const max = t.max_books
    if (volumeCount >= min && (max === null || volumeCount <= max)) {
      const base = Math.max(0, Math.round(t.price_agorot))

      // ── מדרגה פתוחה מתמשכת ──
      //
      // ⚠️ הקפיצה נמדדת מ-min_books ולא מאפס: המחיר הבסיסי כבר מכסה
      // את הכרכים שעד תחילת המדרגה. הכמות שמעבר מעוגלת *כלפי מעלה*
      // לקפיצה שלמה — כרך אחד מעל הסף הוא כבר ארגז נוסף.
      const step = t.step_volumes
      const add = t.step_agorot
      if (max === null && step && step > 0 && add != null && add >= 0) {
        const over = volumeCount - min + 1          // כמה כרכים בתוך המדרגה
        const extraSteps = Math.ceil(over / step) - 1
        if (extraSteps > 0) return base + extraSteps * Math.round(add)
      }

      return base
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
  volumeCount: number,
  tiers: TierInput[]
): number | null {
  if (method === 'pickup') return 0
  return resolveShippingTier(volumeCount, tiers)
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
 *   • **פער** — 5 כרכים לא נופלים בשום מדרגה ⇒ אי אפשר להזמין
 *   • **חפיפה** — שתי מדרגות מכסות 4 כרכים ⇒ המחיר תלוי בסדר המיון
 *   • **אין מדרגה עליונה** — 50 כרכים לא נופלים בשום מקום
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

    // ── שדות המדרגה הפתוחה ──
    // ⚠️ זוג: אחד בלי השני נבלע בשקט כמחיר קבוע, והלקוח משלם על 90
    // כרכים כמו על 14.
    const hasStep = t.step_volumes != null || t.step_agorot != null
    if (hasStep) {
      if (t.max_books !== null) {
        errors.push(`מדרגה ${t.min_books}: תוספת מדורגת אפשרית רק במדרגה הפתוחה ("ומעלה")`)
      }
      if (t.step_volumes == null || t.step_agorot == null) {
        errors.push(`מדרגה ${t.min_books}: יש להזין גם את גודל הקפיצה וגם את התוספת`)
      } else {
        if (!Number.isInteger(t.step_volumes) || t.step_volumes < 1) {
          errors.push(`מדרגה ${t.min_books}: גודל הקפיצה חייב להיות מספר שלם מ-1 ומעלה`)
        }
        if (!Number.isInteger(t.step_agorot) || t.step_agorot < 0) {
          errors.push(`מדרגה ${t.min_books}: תוספת פסולה`)
        }
      }
    }
  }
  if (errors.length) return { ok: false, errors }

  const sorted = [...tiers].sort((a, b) => a.min_books - b.min_books)

  // חייבת להתחיל מספר אחד
  if (sorted[0].min_books !== 1) {
    errors.push(`המדרגה הראשונה חייבת להתחיל מכרך אחד (מתחילה מ-${sorted[0].min_books})`)
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
      errors.push(`פער: אין מדרגה לכמות ${cur.max_books + 1}${next.min_books - 1 > cur.max_books + 1 ? `-${next.min_books - 1}` : ''} כרכים`)
    }
  }

  // 🔴 המדרגה האחרונה חייבת להיות פתוחה, אחרת הזמנה גדולה תיתקע
  const last = sorted[sorted.length - 1]
  if (last.max_books !== null) {
    errors.push(`המדרגה האחרונה חייבת להיות פתוחה ("${last.min_books} ומעלה"), אחרת הזמנה של ${last.max_books + 1} כרכים ומעלה לא תתאפשר`)
  }

  return { ok: errors.length === 0, errors }
}

/** תיאור מדרגה לתצוגה: "1-3 כרכים", "14 ומעלה". */
export function tierLabel(t: Pick<BookFairShippingTier, 'min_books' | 'max_books'>): string {
  if (t.max_books === null) return `${t.min_books} ומעלה`
  if (t.max_books === t.min_books) return `${t.min_books}`
  return `${t.min_books}-${t.max_books}`
}
