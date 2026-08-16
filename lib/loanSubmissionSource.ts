// ─────────────────────────────────────────────────────────────────────────────
// מקור הגשת בקשת ההלוואה — אתר או מייל.
//
// ⚠️ נשמר כדי לענות על שאלה תפעולית: כמה בקשות מגיעות בכל מסלול. שני
// המסלולים אינם שקולים — בהגשה דרך האתר טופס אישור הרב מגיע מלא מהמערכת
// (שם, ת"ז וסדר הדורות מודפסים), ובמייל הפונה ממלא הכול ביד ועלול לטעות.
// הפילוח הוא שמראה אם ההעדפה לאתר אכן עובדת.
//
// ⚠️ עוקב אחר התבנית של registration_source בצאצאים ושל DistributionSource
// בחלוקות, ולא ממציא מנגנון חדש.
// ─────────────────────────────────────────────────────────────────────────────

export const LOAN_SOURCES = ['portal', 'email'] as const
export type LoanSubmissionSource = (typeof LOAN_SOURCES)[number]

const LABELS: Record<LoanSubmissionSource, string> = {
  portal: 'אתר',
  email: 'מייל',
}

/**
 * מנרמל ערך שהגיע מגוף הבקשה.
 *
 * ⚠️ נופל ל-'portal' ולא כותב ערך לא מוכר כפי שהוא: הערך מגיע מהלקוח,
 * וזיהום השדה היה הופך את הפילוח לחסר ערך בדיוק כשמסתכלים עליו.
 */
export function normalizeLoanSource(value: unknown): LoanSubmissionSource {
  const v = String(value ?? '').trim().toLowerCase()
  return (LOAN_SOURCES as readonly string[]).includes(v) ? (v as LoanSubmissionSource) : 'portal'
}

/**
 * תווית בעברית לתצוגה בכרטסת ובדוחות.
 *
 * ⚠️ מחזיר תווית גם ל-null: בקשות שקדמו לשדה אין להן מקור, והצגת ריק
 * במקום ההסבר נראית כתקלה בכרטסת.
 */
export function loanSourceLabel(value: string | null | undefined): string {
  const v = String(value ?? '').trim().toLowerCase()
  if (!v) return 'לא ידוע'
  return LABELS[v as LoanSubmissionSource] ?? 'לא ידוע'
}
