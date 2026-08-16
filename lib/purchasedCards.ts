// ─────────────────────────────────────────────────────────────────────────────
// "סך הכרטיסים שנקנו" — נגזר מיומן התנועות.
//
// ⚠️ פונקציה טהורה בכוונה, והחילוץ הזה הוא עיקר התיקון: כל עוד החישוב ישב
// בתוך ה-route הוא לא היה מכוסה בטסט, וכך "תוקן" פעמיים בלי שאיש ידע
// שהתקלה חוזרת.
//
// ⚠️ אינו balance + issuedCards. שני המספרים סופרים תחומים שונים: balance
// הוא כל היומן מאז ומעולם, ו-issuedCards סופר רק לידות *פעילות* שמחזיקות
// כרטיס. תיק שנטען ואחר כך הושלם או בוטל נעלם מהצד השני של המשוואה,
// והמספר יצא קטן מהאמת (המנהל הכניס 300 וראה 295).
//
// ⚠️ ההבחנה בין רכישה להחזרה היא לפי aid_id ולא לפי reason: adjust חיובי
// *עם* שיוך ללידה הוא החזרת כרטיס שנוכה ונכשל — לא קנייה. adjust חיובי
// בלי שיוך הוא הוספת מלאי לכל דבר. תנועות ותיקות נשמרו לפני שהיה reason
// מפורש, ושורה בלי reason מנורמלת ל-adjust — ולכן אי אפשר לסנן ל-restock
// בלבד בלי לאבד את הכניסה המקורית.
//
// 🔴 חובה להריץ על היומן *המלא*. הרצה על היומן המקוצר (50 השורות
// האחרונות שמוצגות במסך) דוחקת את הרכישה המקורית מחוץ לטווח, התוצאה
// יוצאת 0, והמסך מציג '—' גם ב"נקנו" וגם ב"נמסרו" שנגזר ממנו.
// ─────────────────────────────────────────────────────────────────────────────

export interface PurchaseLedgerRow {
  delta?: number | null
  reason?: string | null
  aid_id?: string | null
}

export function sumPurchasedCards(ledger: readonly PurchaseLedgerRow[]): number {
  return ledger.reduce((sum, row) => {
    const delta = Number(row.delta)
    if (!Number.isFinite(delta) || delta <= 0) return sum
    const reason = row.reason ?? 'adjust'
    if (reason === 'restock') return sum + delta
    if (reason === 'adjust' && !row.aid_id) return sum + delta
    return sum
  }, 0)
}
