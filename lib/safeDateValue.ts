// ─────────────────────────────────────────────────────────────────────────────
// שמירת ערכי תאריך לפני שהם מגיעים לרכיבי תצוגה.
//
// 🔴 הבאג שנולד מכאן: ערך תאריך פגום שהוזרם מהמאגר ישירות לטופס הפיל את הדף
// כולו במסך לבן ("אירעה תקלה זמנית"). @hebcal זורק RangeError: Invalid Date על
// `new HDate(d)` כשה-Date אינו תקין — ומכיוון שזה קורה בזמן render, שגיאה אחת
// מפילה את כל העץ. זה גם ההסבר לכך שאצל חלק מהמשפחות זה עבד ואצל אחרות לא:
// הקריסה תלויה בנתונים, לא בדפדפן — רק רשומות עם תאריך פגום מפילות.
//
// הכלל: אף ערך תאריך אינו נכנס לרכיב תצוגה בלי לעבור כאן קודם.
// ─────────────────────────────────────────────────────────────────────────────

/** האם המחרוזת היא תאריך שניתן להמיר ל-Date תקין. ריק/null → false. */
export function isValidDateValue(v?: string | null): boolean {
  if (!v) return false
  return !Number.isNaN(new Date(v).getTime())
}

/**
 * מנרמל ערך תאריך לפורמט YYYY-MM-DD. ערך פגום/ריק → מחרוזת ריקה (ולא זריקה).
 *
 * ⚠️ הנרמול נעשה מרכיבי התאריך ה*מקומיים* ולא דרך toISOString(): בישראל
 * (UTC+2/3) המרה ל-UTC מזיזה תאריך שנבחר בחצות ליום הקודם — באג "יום לפני".
 */
export function toSafeDateValue(v?: string | null): string {
  if (!v) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (m) return v
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
