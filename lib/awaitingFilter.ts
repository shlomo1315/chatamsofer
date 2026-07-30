// ─────────────────────────────────────────────────────────────────────────────
// מי ממתינה לכרטיס מזון — מקור אמת יחיד.
//
// ⚠️ הסינון הזה שוכפל בשלושה מקומות שחייבים להיות זהים:
//   lib/maternityCards.ts             → processAwaitingStock (מי באמת מקבלת כרטיס)
//   app/api/admin/card-stock/route.ts → מונה "יולדות הממתינות למלאי"
//   app/api/admin/card-stock/diag/    → מסך האבחון
//
// בפועל הם נפרדו פעמיים. בפעם האחרונה רק התור ידע לדלג על מי שלא ביקשה
// כרטיס מזון (wants_food_card=false), והמונה ספר אותה — כך נוצרה "1 יולדת
// ממתינה" שלא ירדה לעולם, גם מול מלאי של מאות כרטיסים.
//
// לכן: פונקציה אחת, מיובאת בכל שלושת המקומות ובבדיקות. שינוי בכלל קורה
// במקום אחד בלבד, ואי אפשר שהמסך יראה מספר אחר ממה שהתור מטפל בו.
// ─────────────────────────────────────────────────────────────────────────────

export interface AwaitingAid {
  card_status?: string | null
  card_voucher_status?: string | null
  card_load_status?: string | null
  card_tlush_id?: string | null
  birth_type?: string | null
  /** undefined = בקשות ישנות שקדמו לשדה — נחשבות "ביקשה", לתאימות לאחור. */
  wants_food_card?: boolean | null
}

/**
 * האם הלידה ממתינה לכרטיס מזון.
 * מניח שהתיק כבר סונן ל-status='active' — התור לא נוגע בתיק במצב אחר.
 */
export function isAwaitingCard(a: AwaitingAid): boolean {
  return (
    a.card_load_status !== 'loaded' &&   // עוד לא נטענה
    !a.card_tlush_id &&                  // אין טלוש בנדרים
    a.card_status !== 'rejected' &&      // לא נדחתה ידנית
    a.birth_type !== 'silent' &&         // לידה שקטה — אין לה כרטיס
    a.wants_food_card !== false          // לא ביקשה כרטיס מזון → התור מדלג
  )
}

/** העמודות הדרושות ל-isAwaitingCard — כדי ש-select לא ישכח שדה ויְשַׁקֵּר. */
export const AWAITING_SELECT =
  'card_status, card_voucher_status, card_load_status, card_tlush_id, birth_type, wants_food_card'
