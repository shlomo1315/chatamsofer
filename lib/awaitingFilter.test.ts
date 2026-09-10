import { describe, it, expect } from 'vitest'
import { isAwaitingCard } from './awaitingFilter'

// ⚠️ הבדיקה מייבאת את הפונקציה האמיתית ולא מחזיקה עותק משלה.
// קודם היה כאן שכפול של הכלל, הוא נשאר מאחור כשהקוד השתנה — והבדיקה
// עברה בירוק בדיוק על הבאג שהיא הייתה אמורה לתפוס.
//
// שלושת הצרכנים: processAwaitingStock (מי מקבלת כרטיס), מונה "ממתינות
// למלאי", ומסך האבחון. אם הבדיקה עוברת — שלושתם מסכימים, בהגדרה.

describe('מי ממתינה לכרטיס מזון', () => {
  it('יולדת שנתקעה ב-pending נספרת', () => {
    // המקרה שקרה בפועל: אושרה, אך card_status נשאר pending ולא
    // awaiting_stock — ולכן לא נכנסה לתור ולא קיבלה כרטיס ולא שובר.
    expect(isAwaitingCard({ card_status: 'pending', card_load_status: 'idle' })).toBe(true)
  })

  it('גם awaiting_stock ו-approved נספרות', () => {
    expect(isAwaitingCard({ card_status: 'awaiting_stock', card_load_status: 'idle' })).toBe(true)
    expect(isAwaitingCard({ card_status: 'approved', card_load_status: 'idle' })).toBe(true)
    expect(isAwaitingCard({ card_voucher_status: 'awaiting_stock', card_load_status: 'idle' })).toBe(true)
  })

  it('מי שכבר נטענה אינה נספרת', () => {
    expect(isAwaitingCard({ card_status: 'loaded', card_load_status: 'loaded' })).toBe(false)
    expect(isAwaitingCard({ card_status: 'pending', card_tlush_id: 'T123' })).toBe(false)
  })

  it('לידה שנדחתה ידנית אינה נספרת', () => {
    expect(isAwaitingCard({ card_status: 'rejected' })).toBe(false)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 🔴 לידה שקטה מקבלת כרטיס מזון.
  //
  // ⚠️ עד 10.09 התור החריג אותה, ושלוש מתוך ארבע הלידות השקטות הפעילות
  // כבר קיבלו 600 ₪ בפועל (הרצוג, פרנקל, זלקוביץ) — כלומר ההחרגה מעולם
  // לא שיקפה את המדיניות. דורמשקין נחסמה רק משום שהמלאי אזל ברגע האישור
  // ונדרשה ריצה חוזרת, ושם המסנן תפס אותה.
  //
  // ⚠️ הסתירה הייתה גלויה: maternityVoucher בונה שובר ייעודי ללידה שקטה,
  // כלומר המערכת הנפיקה לה שובר וסירבה לטעון אותו.
  // ───────────────────────────────────────────────────────────────────────────
  it('🔴 לידה שקטה כן ממתינה לכרטיס — ההחרגה חסמה זכאות אמיתית', () => {
    expect(isAwaitingCard({ card_status: 'pending', birth_type: 'silent' })).toBe(true)
  })

  it('🔴 לידה שקטה שכבר נטענה — אינה חוזרת לתור', () => {
    // ⚠️ הכלל שהוסר הוא ההחרגה בלבד; שאר התנאים חלים עליה ככל לידה,
    // ובלעדיהם היא הייתה נטענת שוב ושוב.
    expect(isAwaitingCard({ birth_type: 'silent', card_load_status: 'loaded' })).toBe(false)
    expect(isAwaitingCard({ birth_type: 'silent', card_tlush_id: '3629975' })).toBe(false)
  })

  it('לידה שקטה שלא ביקשה כרטיס מזון — עדיין מדולגת', () => {
    expect(isAwaitingCard({ birth_type: 'silent', wants_food_card: false })).toBe(false)
  })

  it('מי שלא ביקשה כרטיס מזון אינה נספרת', () => {
    // ⚠️ הבאג שגרם ל"1 יולדת ממתינה" מול מלאי של 272 כרטיסים: התור דילג
    // עליה (wants_food_card=false) אבל המונה ספר אותה — ולכן המספר לא ירד
    // לעולם, כמה מלאי שלא יתווסף.
    expect(isAwaitingCard({ card_status: 'pending', wants_food_card: false })).toBe(false)
  })

  it('בקשות ישנות ללא השדה נחשבות "ביקשה" (תאימות לאחור)', () => {
    expect(isAwaitingCard({ card_status: 'pending' })).toBe(true)
    expect(isAwaitingCard({ card_status: 'pending', wants_food_card: true })).toBe(true)
  })
})
