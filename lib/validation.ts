// אימות תעודת זהות ישראלית כולל ספרת ביקורת (אלגוריתם לוהן)
export function validateIsraeliId(raw: string): boolean {
  const id = raw.replace(/\D/g, '').padStart(9, '0')
  if (id.length !== 9) return false
  // ⚠️ ת"ז של כולה אפסים (000000000) עוברת לוהן (sum=0) אך אינה תקינה —
  // וזו בדיוק הצורה שנשמרה כשהשדה הושאר ריק ועבר padStart. חוסמים במפורש.
  if (/^0+$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let d = parseInt(id[i]) * (i % 2 === 0 ? 1 : 2)
    if (d > 9) d -= 9
    sum += d
  }
  return sum % 10 === 0
}

// נרמול תאריך ל-ISO (YYYY-MM-DD) לפני כתיבה לעמודת date ב-DB.
//
// ⚠️ למה: ה-endpoint public-register משותף לפורטל ולטופס החיצוני של נדרים/matara.pro.
// הפורטל שולח תמיד ISO (HebrewDatePicker), אבל טופס נדרים שולח DDMMYYYY (למשל
// "04102006"). ערך כזה שנכתב ישירות לעמודת date הפיל את ה-INSERT עם
// PostgreSQL 22008 "date/time field value out of range" — הרישום נכשל לגמרי.
// מזהים את הפורמטים הנפוצים וממירים ל-ISO; ערך שכבר ISO נשאר, וערך לא-מזוהה
// מוחזר כפי שהוא (כדי לא להסתיר נתון פגום באמת).
export function normalizeDateToISO(raw?: string | null): string | null {
  const v = String(raw ?? '').trim()
  if (!v) return null
  // כבר ISO תקין (YYYY-MM-DD) — משאירים
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  // DDMMYYYY (8 ספרות רצופות) — הפורמט של נדרים
  let m = v.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  // DD/MM/YYYY או DD.MM.YYYY או DD-MM-YYYY
  m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  // YYYY/MM/DD
  m = v.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return v
}

export function validatePhone(p: string): boolean {
  const d = p.replace(/\D/g, '')
  return d.length === 10 && d.startsWith('05')
}

// הצגת תעודת זהות ב-9 ספרות מלאות, עם אפסים מובילים.
// ⚠️ במסד נשמרות ת"ז גם בלי האפסים המובילים (למשל "1486819"), ואז התצוגה
// הראתה 7 ספרות — מספר שנראה שגוי ואי אפשר להשוות אותו למסמך. דרכון או ערך
// שאינו ספרתי בלבד מוחזר כפי שהוא.
export function formatIsraeliId(raw?: string | null): string {
  const v = String(raw ?? '').trim()
  if (!v) return ''
  if (!/^\d+$/.test(v)) return v          // דרכון / ערך לא ספרתי
  return v.length >= 9 ? v : v.padStart(9, '0')
}
