// צבע הקטגוריה בחנות היריד.
//
// 🔴 לכל קטגוריה גוון משלה, אבל כולם יושבים על אותה עומק ורוויה:
// הם נבדלים זה מזה בגוון בלבד, לא בבהירות. ככה העין קולטת "עברתי
// לקטגוריה אחרת" בלי שאף מדף ייראה צועק יותר מחברו.
//
// ⚠️ הקטגוריה מגיעה מהשדה description (כך הגיעה מהאקסל) ולא מעמודה
// משלה — ראו lib/bookFairCatalog. לכן ההתאמה כאן היא לפי שם מדויק,
// עם נפילה לגוון הבורדו של המותג כשהשם לא מוכר.

export type CategoryColor = {
  /** הגוון המלא — קו הכותרת, הנקודה, המק"ט, כפתור ההוספה. */
  main: string
  /** אותו גוון ברקע עדין מאוד — תגיות, הילה מאחורי הכריכה. */
  soft: string
}

/** ברירת המחדל: הבורדו של המותג. גם קטגוריה חדשה שתיווסף תיראה שייכת. */
export const DEFAULT_CATEGORY_COLOR: CategoryColor = { main: '#6B2737', soft: '#F6ECEC' }

const PALETTE: Record<string, CategoryColor> = {
  'שאלות ותשובות': { main: '#6B2737', soft: '#F6ECEC' },        // בורדו
  'דרוש ואגדה': { main: '#8A5A1E', soft: '#F8F0E4' },           // ענבר
  'על הש"ס': { main: '#2F5D50', soft: '#E8F1EE' },              // ירוק עמוק
  'סידור ותהילים': { main: '#2E4A7A', soft: '#E9EEF7' },        // תכלת כהה
  'ליקוטים על התורה': { main: '#6B4E8A', soft: '#F1ECF7' },     // סגול
  'שבת ומועדים': { main: '#A14B2A', soft: '#FAEEE8' },          // חימר
  'הלכה ומנהג': { main: '#3F5A2E', soft: '#ECF2E6' },           // זית
  'ליקוטים בעניינים שונים': { main: '#7A5230', soft: '#F5EDE5' }, // חום עץ
  'קורות חייו': { main: '#4A4A6A', soft: '#EDEDF4' },           // אפור־כחול
}

/**
 * נרמול שם קטגוריה לצורך התאמה.
 *
 * 🔴 גרש עברי (״) וגרשיים רגילים (") מתחלפים בנתונים — "על הש״ס" מול
 * "על הש"ס". בלי נרמול, קטגוריה שלמה היתה נופלת לברירת המחדל בשקט
 * ומאבדת את הגוון שלה.
 */
function normalize(name: string): string {
  return name
    .replace(/[״”“]/g, '"')
    .replace(/[׳’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** הצבע של קטגוריה לפי שמה. שם לא מוכר מקבל את גוון המותג. */
export function categoryColor(name: string | null | undefined): CategoryColor {
  if (!name) return DEFAULT_CATEGORY_COLOR
  return PALETTE[normalize(name)] ?? DEFAULT_CATEGORY_COLOR
}
