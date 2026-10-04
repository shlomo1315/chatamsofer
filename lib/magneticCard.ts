// ─────────────────────────────────────────────────────────────────────────────
// פענוח פס מגנטי של כרטיס אשראי (ISO/IEC 7813).
//
// 🔴 למה זה קיים: קורא הכרטיסים מתנהג כמקלדת ו"מקליד" את *כל* הפס
// ברצף אחד. שדה מספר הכרטיס באייפרם בולע את ההתחלה ומתעלם מהשאר,
// ולכן נראה כאילו "נוספו 3 ספרות מיותרות" והתוקף לא הוזן — בעוד
// שבפועל התוקף נדחף פנימה לתוך אותו שדה.
//
// מבנה הפס:
//   Track 1:  %B<PAN>^<שם>^<YYMM><שירות>...?
//   Track 2:  ;<PAN>=<YYMM><שירות>...?
//
// ⚠️ ה-CVV *אינו* על הפס המגנטי — הוא מודפס על הכרטיס בלבד. לכן אין
// דרך לקלוט אותו מסריקה, והוא תמיד יוזן ידנית. זו מגבלת התקן ולא
// חוסר במימוש.
// ─────────────────────────────────────────────────────────────────────────────

export interface MagneticCardData {
  /** מספר הכרטיס (PAN). */
  pan: string
  /** תוקף בפורמט MMYY — כפי שנדרים מצפה לקבל. */
  tokefMMYY: string
  /** שנה דו-ספרתית. */
  yy: string
  /** חודש דו-ספרתי. */
  mm: string
}

/** האם המחרוזת נראית כמו פס מגנטי ולא כהקלדה ידנית. */
export function looksLikeMagneticSwipe(raw: string): boolean {
  const s = String(raw ?? '')
  // ⚠️ סימני הפתיחה של התקן: %B / ; / או PAN ואחריו = או ^.
  return /^%?[A-Z]?\d{12,19}[=^]/.test(s.replace(/^;/, '')) || /^%B\d/.test(s) || /^;\d{12,19}=/.test(s)
}

/**
 * מפענח פס מגנטי.
 *
 * ⚠️ מחזיר null כשזו אינה סריקה תקינה — הקורא חייב ליפול חזרה
 * להקלדה ידנית ולא "לנחש" מספר כרטיס.
 */
export function parseMagneticCard(raw: string): MagneticCardData | null {
  const s = String(raw ?? '').trim()
  if (!s) return null

  // Track 2 — הנפוץ: ;PAN=YYMM...
  // גם בלי ';' מוביל, כי חלק מהקוראים משמיטים אותו.
  const t2 = s.match(/;?(\d{12,19})=(\d{4})/)
  if (t2) return build(t2[1], t2[2])

  // Track 1 — %B PAN ^ שם ^ YYMM
  const t1 = s.match(/%?[A-Z]?(\d{12,19})\^[^^]*\^(\d{4})/)
  if (t1) return build(t1[1], t1[2])

  return null
}

function build(pan: string, yymm: string): MagneticCardData | null {
  const yy = yymm.slice(0, 2)
  const mm = yymm.slice(2, 4)

  // 🔴 חודש לא תקין פירושו שהפענוח שגוי (למשל סדר הפוך), ועדיף
  // להיכשל מאשר לשלוח תוקף מומצא שייחסם בסליקה בלי הסבר.
  const m = Number(mm)
  if (!Number.isInteger(m) || m < 1 || m > 12) return null
  if (!/^\d{12,19}$/.test(pan)) return null

  // ⚠️ נדרים מצפה ל-MMYY, בעוד שהפס המגנטי הוא YYMM. היפוך סדר
  // כאן היה שולח תוקף שגוי שנראה תקין לחלוטין.
  return { pan, tokefMMYY: `${mm}${yy}`, yy, mm }
}
