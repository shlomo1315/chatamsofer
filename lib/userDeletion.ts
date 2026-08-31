// ─────────────────────────────────────────────────────────────────────────────
// מחיקת משתמש — זיהוי הכשלים שנצפו בפרודקשן.
//
// 🔴 "Database error deleting user" מגיע מ-GoTrue כשלמשתמש יש יותר
// מזהות אחת: נרשם עם מייל ואז התחבר עם Google, אותה כתובת בדיוק ושתי
// שורות ב-auth.identities. ההודעה הגולמית אינה אומרת דבר על כך, והמנהל
// נשאר מול "שגיאה במחיקה" בלי שום כיוון.
//
// ⚠️ הזהויות נמחקות לפני המשתמש (ראו app/api/admin/users) — וזה מה
// שפותר את הכשל בשורש.
// ─────────────────────────────────────────────────────────────────────────────

/** האם השגיאה פירושה שהמשתמש כבר אינו קיים — כלומר המחיקה הצליחה בפועל. */
export function isAlreadyGone(message: string | null | undefined): boolean {
  const s = String(message ?? '')
  if (!s) return false
  return /not found|does not exist/i.test(s)
}

/**
 * הודעה שאפשר לפעול לפיה.
 *
 * ⚠️ ההודעה המקורית *נשמרת* ולא מוחלפת: בלעדיה אי אפשר לאבחן כשל אחר
 * שבמקרה נראה דומה.
 */
export function describeDeleteFailure(message: string): string {
  const s = String(message ?? '')
  if (/database error deleting user/i.test(s)) {
    return `שגיאה במחיקה: למשתמש יש כמה זהויות התחברות (מייל וגם Google). ` +
           `נסו שוב — הזהויות ינוקו תחילה. (${s})`
  }
  return `שגיאה במחיקה: ${s}`
}
