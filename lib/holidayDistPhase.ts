// שלבי החלוקה — קובץ טהור (בלי גישה לשרת) כדי שגם מסך הניהול יוכל לייבא.

/**
 * 🔴 שלב החלוקה — בורר אחד במקום מתגים נפרדים.
 * setup=הכנה (רק מספרי ניסיון נרשמים) · registration=רישום פתוח (בקו: רישום בלבד) ·
 * closed=הרישום נסגר (בקו: 'עדכון יישלח') · distribution=החלוקה פתוחה (בקו: פרטים + שיוך כרטיס).
 * null = חלוקה ישנה שמנוהלת בשערים הנפרדים (תשרי).
 */
export type DistPhase = 'setup' | 'registration' | 'closed' | 'distribution'
export const PHASES: DistPhase[] = ['setup', 'registration', 'closed', 'distribution']
export const PHASE_LABEL: Record<DistPhase, string> = {
  setup: 'הכנה', registration: 'רישום פתוח', closed: 'הרישום נסגר', distribution: 'החלוקה פתוחה',
}

/** השערים במסד שכל שלב קובע. ⚠️ כך כל הערוצים הישנים (אתר, נדרים) מתיישרים אוטומטית. */
export function phaseGates(phase: DistPhase): { registration_open: boolean; centers_open: boolean; pickup_open: boolean } {
  return {
    registration_open: phase === 'registration',
    centers_open: phase === 'registration',
    pickup_open: phase === 'distribution',
  }
}
