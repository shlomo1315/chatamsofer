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
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return isRealDate(v)
  // DDMMYYYY (8 ספרות רצופות) — הפורמט של נדרים
  let m = v.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (m) return isRealDate(`${m[3]}-${m[2]}-${m[1]}`)
  // DD/MM/YYYY או DD.MM.YYYY או DD-MM-YYYY
  m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (m) return isRealDate(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
  // YYYY/MM/DD
  m = v.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/)
  if (m) return isRealDate(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`)
  // 🔴 ערך שאינו תואם אף פורמט מוכר מוחזר null — ולא כמחרוזת גולמית.
  // קודם היה כאן `return v`, כלומר "לא ידוע" נכתב כמות שהוא לתוך JSONB
  // (שאין בו אכיפת טיפוס), חזר אחר כך לטופס, ו-new HDate(InvalidDate) זרק
  // RangeError בזמן render — מה שהפיל את *כל* הדף. ראה lib/safeDateValue.
  return null
}

// אימות שהתאריך קיים באמת ולא רק "נראה" תקין: 13/13/2026 עובר את ה-regex
// אבל אינו תאריך. Date "מגלגל" חודש 13 לינואר הבא, ולכן משווים חזרה.
function isRealDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return iso
}

export function validatePhone(p: string): boolean {
  const d = p.replace(/\D/g, '')
  return d.length === 10 && d.startsWith('05')
}

// ─────────────────────────────────────────────────────────────────────────────
// קו נייח ישראלי — 9 ספרות, קידומת אזורית שאינה 05.
//
// ⚠️ למה בנפרד מ-validatePhone ולא הרחבה שלה: הטלפון הראשי חייב להישאר נייד,
// כי דרכו יוצאים SMS וצינתוקים. שדה שמקבל נייח במקום נייד היה משתיק את שניהם
// בלי שהמשפחה תדע. לכן רק "טלפון נוסף" מקבל נייח, וההבחנה חייבת להיות מפורשת.
//
// הקידומות: 02 ירושלים · 03 תל אביב · 04 חיפה · 08 דרום · 09 שרון,
// ובנוסף 07 (מפעילים וירטואליים/VoIP, גם הם 9 ספרות). 05 מוחרג במפורש —
// נייד תקין הוא 10 ספרות, וכזה שנכתב ב-9 הוא הקלדה חסרה ולא קו נייח.
// ─────────────────────────────────────────────────────────────────────────────
export function validateLandline(p: string): boolean {
  const d = p.replace(/\D/g, '')
  return d.length === 9 && /^0[234789]$/.test(d.slice(0, 2))
}

/** נייד או נייח — לשדות שמקבלים את שניהם (כיום "טלפון נוסף" בלבד). */
export function validatePhoneOrLandline(p: string): boolean {
  return validatePhone(p) || validateLandline(p)
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
