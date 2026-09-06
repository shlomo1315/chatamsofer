// ─────────────────────────────────────────────────────────────────────────────
// סולם הדורות "קלף וחותם" — מקור אמת יחיד לכל תצוגות עץ הדורות.
//
// 🔴 למה זה קיים: הפלטה שוכפלה בכל רכיב עץ בנפרד (כרטסת הצאצא, העץ
// הציבורי, מסך הניהול, מסך ההגדרות). כשהעיצוב עודכן, חלק מהעותקים עודכנו
// וחלק לא — ולכן אותה מערכת הציגה שני עיצובים שונים, ומסכים שנשכחו נראו
// כרכיב ישן שאיש לא נגע בו. עותק אחד = כולם משתנים יחד.
//
// הסולם: זהב חם → נחושת → ארד → יין → חום עתיק. הוא נגזר מהעיטור המוזהב
// של הבלאנק ומהפלטה של המסמכים המודפסים, ולכן העץ נראה כחלק מאותו עולם.
// ─────────────────────────────────────────────────────────────────────────────

export interface GenTone {
  /** רקע הצומת — מדרג עדין ולא צבע שטוח. */
  bg: string
  /** מסגרת/טבעת. */
  ring: string
  /** צל רך בגוון הצומת עצמו. */
  shadow: string
  /** גוון בהיר לרקעים משניים (צ'יפים, תוויות). */
  light: string
  /** גוון כהה לטקסט על רקע בהיר. */
  text: string
}

export const LINEAGE_PALETTE: GenTone[] = [
  { bg: 'linear-gradient(160deg,#e0b94a,#c69e2d)', ring: '#c69e2d', shadow: 'rgba(198,158,45,0.34)', light: '#FBF3DA', text: '#8a6a1e' },
  { bg: 'linear-gradient(160deg,#d3a344,#bf8b34)', ring: '#bf8b34', shadow: 'rgba(191,139,52,0.32)', light: '#FAEFD6', text: '#7d5a1f' },
  { bg: 'linear-gradient(160deg,#c68a4e,#b3703a)', ring: '#b3703a', shadow: 'rgba(179,112,58,0.32)', light: '#F6E9D8', text: '#7a4a26' },
  { bg: 'linear-gradient(160deg,#b56f4f,#a15a3d)', ring: '#a15a3d', shadow: 'rgba(161,90,61,0.32)',  light: '#F3E2D8', text: '#6f3a2a' },
  { bg: 'linear-gradient(160deg,#a15a58,#8c4a44)', ring: '#8c4a44', shadow: 'rgba(140,74,68,0.32)',  light: '#F0DEDC', text: '#5f3230' },
  { bg: 'linear-gradient(160deg,#867059,#6f5a44)', ring: '#6f5a44', shadow: 'rgba(111,90,68,0.32)',  light: '#EBE4D8', text: '#4d3f30' },
]

/**
 * הגוון של דור מסוים.
 *
 * ⚠️ מחזורי (modulo): עץ החתם סופר עמוק מ-6 דורות, והמחזוריות שומרת על
 * הבחנה בין דורות סמוכים בלי להמציא צבעים חדשים שיישברו מהסולם.
 */
export function genTone(generation: number): GenTone {
  const g = Number.isFinite(generation) ? Math.max(0, Math.floor(generation)) : 0
  return LINEAGE_PALETTE[g % LINEAGE_PALETTE.length]
}

/**
 * סטטוס הצומת בעץ — צבע *סמנטי*, נפרד לחלוטין מסולם הדורות.
 *
 * ⚠️ אל תמזג אותו לפלטה: גוון הדור אומר "באיזה דור", והסטטוס אומר
 * "האם אומת". מיזוג היה מוחק את ההבחנה והופך אזהרה אמיתית לקישוט.
 */
// 🔴 צבעים *סמנטיים* ולא גווני זהב.
//
// עד כאן 'verified' ו-'pending' קיבלו שניהם גוונים מסולם הדורות (זהב מול
// נחושת) — שני צבעים חמים שנראים כמעט זהים במבט. יחד עם זה שגוף הצומת
// בעץ נצבע לפי *הדור*, התוצאה הייתה שצומת ממתין בדור 1 נראה זהוב-ירקרק,
// והמנהל קרא אותו כמאושר. 357 מתוך 10,505 הצמתים מאושרים (3.4%) — כלומר
// כמעט כל מה שנראה "מוכן" בעץ כלל לא אומת.
//
// עכשיו: ירוק = אומת · אפור = ממתין · אדום = נדחה. אפור נבחר במכוון
// ולא צהוב — הוא נקרא כ"לא גמור" ואינו מתחרה בירוק על תשומת הלב.
export const NODE_STATUS = {
  verified: { label: 'מאושר', dot: '#16A34A', bg: '#DCFCE7', border: '#22C55E', text: '#15803D' },
  pending:  { label: 'ממתין לאישור', dot: '#94A3B8', bg: '#F1F5F9', border: '#CBD5E1', text: '#64748B' },
  rejected: { label: 'נדחה', dot: '#DC2626', bg: '#FEE2E2', border: '#F87171', text: '#B91C1C' },
} as const

export type NodeStatus = keyof typeof NODE_STATUS

export function nodeStatusTone(status: string | null | undefined) {
  return NODE_STATUS[(status ?? 'pending') as NodeStatus] ?? NODE_STATUS.pending
}
