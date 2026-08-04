// ─────────────────────────────────────────────────────────────────────────────
// גִרסאות של מספר תעודת זהות לחיפוש במסד.
//
// ⚠️ הבעיה: ת"ז ישראלית היא 9 ספרות *כולל אפסים מובילים*, אבל בפועל היא נשמרה
// במאגר בכמה צורות — 9 ספרות מלאות, בלי האפס המוביל (8 ספרות), ולעיתים עם מקף
// או רווח. מי שמקיש בטלפון מקיש תמיד 9 ספרות, ולכן השוואה מדויקת אחת הייתה
// מחזירה "לא נמצא" למשפחה שכן רשומה — וחוסמת אותה מהרישום בלי שתדע למה.
//
// לכן מחפשים בכמה גרסאות מנורמלות במקום להסתמך על צורה אחת.
// ─────────────────────────────────────────────────────────────────────────────

/** ספרות בלבד. */
export function digitsOnly(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

/**
 * הגרסאות שכדאי לחפש לפיהן — ממוינות מהמדויקת לרחבה, בלי כפילויות.
 *
 * לדוגמה עבור "012345678": ["012345678", "12345678"]
 * ועבור "12345678": ["12345678", "012345678"]
 */
export function idVariants(raw: unknown): string[] {
  const d = digitsOnly(raw)
  if (!d) return []
  const stripped = d.replace(/^0+/, '')
  const out = [d]
  if (stripped && stripped !== d) out.push(stripped)
  // ⚠️ ריפוד ל-9 רק כשזה לא מאריך את המספר מעבר לאורך תקין: מספר בן 10 ספרות
  // הוא ממילא שגוי, וריפוד שלו היה יוצר חיפוש חסר משמעות.
  if (stripped.length > 0 && stripped.length < 9) {
    const padded = stripped.padStart(9, '0')
    if (!out.includes(padded)) out.push(padded)
  }
  return out
}

/**
 * תנאי or של PostgREST לחיפוש ת"ז בעמודות נתונות.
 *
 * ⚠️ הערכים הם ספרות בלבד (digitsOnly), ולכן אין בהם תו שדורש בריחה בתחביר
 * ה-or של PostgREST. חשוב לשמור על כך אם מוסיפים כאן פורמטים בעתיד.
 */
export function idOrFilter(raw: unknown, columns: string[]): string {
  const variants = idVariants(raw)
  if (!variants.length || !columns.length) return ''
  const parts: string[] = []
  for (const col of columns) for (const v of variants) parts.push(`${col}.eq.${v}`)
  return parts.join(',')
}

/** האם שני מספרי ת"ז הם אותו מספר, בהתעלם מאפסים מובילים ומתווים שאינם ספרות. */
export function sameId(a: unknown, b: unknown): boolean {
  const na = digitsOnly(a).replace(/^0+/, '')
  const nb = digitsOnly(b).replace(/^0+/, '')
  return !!na && na === nb
}
