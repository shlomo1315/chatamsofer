// ─────────────────────────────────────────────────────────────────────────────
// הסכום שמוצג בשדה "סכום לכרטיס" בלשונית טעינת הכרטיסים.
//
// 🔴 ברירת המחדל היא הסכום למשפחה של החלוקה עצמה. עד כה השדה נפתח תמיד
// על 500, גם בחלוקה של 250 — וכך הבדיקה והטעינה יצאו בסכום אחר מזה
// שבצפי התקציבי.
//
// ⚠️ קובץ נפרד מ-holidayCardLoad כי הוא נטען בדפדפן, וזה מייבא את נדרים.
// ─────────────────────────────────────────────────────────────────────────────

/** כשלחלוקה לא הוגדר סכום. זהה ל-DEFAULT_LOAD_AMOUNT בשרת. */
export const FALLBACK_LOAD_AMOUNT = 500

export function initialLoadAmount(amountPerFamily: number | null | undefined): number {
  const n = Number(amountPerFamily)
  return Number.isFinite(n) && n > 0 ? n : FALLBACK_LOAD_AMOUNT
}
