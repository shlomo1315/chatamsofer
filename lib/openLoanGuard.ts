// ─────────────────────────────────────────────────────────────────────────────
// חסימת בקשת הלוואה כפולה — מוטב עם בקשה פתוחה אינו רשאי להגיש בקשה נוספת.
//
// הבעיה שזה פותר: מוטב הגיש בקשה, לא קיבל תשובה מיד, והגיש שוב. שתי הבקשות
// נכנסו למערכת כשתי רשומות נפרדות — והמזכיר ראה שני תיקים פתוחים לאותו אדם
// בלי לדעת שזו אותה בקשה. במקרה הגרוע שתיהן היו מאושרות.
//
// ⚠️ הכלל נאכף בשלושה ערוצים (פורטל, מייל, וממשק הניהול) ולכן ההגדרה של
// "בקשה פתוחה" יושבת כאן ולא בכל ערוץ בנפרד. ערוץ שמגדיר את הרשימה בעצמו
// יסתור את האחרים ברגע שהסטטוסים ישתנו.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * הסטטוסים שבהם הבקשה עדיין "פתוחה" וחוסמת בקשה נוספת.
 *
 * 🔴 `approved` נכלל כאן במכוון: אישור אינו סוף התהליך. בין האישור לבין
 * מסירת הכסף בפועל יש שלב ביצוע, ובחלון הזה המבקש עדיין ממתין להלוואה
 * שכבר אושרה לו. אילו האישור היה משחרר את החסימה, אותו אדם היה יכול
 * להגיש בקשה שנייה בזמן שהראשונה עוד לא נמסרה — כלומר שתי הלוואות
 * פתוחות במקביל, וזה בדיוק מה שהמנגנון בא למנוע.
 *
 * החסימה משתחררת רק כשההלוואה מסומנת כבוצעה (active/completed) — כלומר
 * הכסף נמסר והתיק התקדם לשלב ההחזר.
 *
 * 🔴 `awaiting_rabbi_form` אינו כאן: זו טיוטה שטרם הוגשה, והיא שייכת
 * למבקש עצמו. אילו הייתה נחשבת "בקשה פתוחה", המבקש היה ננעל מחוץ
 * לטיוטה של עצמו — לא יכול להשלים אותה ולא יכול להתחיל חדשה.
 */
export const OPEN_LOAN_STATUSES = ['pending', 'inquiry', 'approved'] as const

/** טיוטה שממתינה לטופס אישור רב חתום — שייכת למבקש, לא למזכיר. */
export const AWAITING_RABBI_FORM = 'awaiting_rabbi_form'

export type OpenLoan = {
  id: string
  status: string
  amount: number | null
  created_at: string
  // ⚠️ נשלפים כדי שהפורטל יציג את פרטי הבקשה הפתוחה במלואם. בלעדיהם
  // המבקש רואה "יש לך בקשה פתוחה" בלי לדעת על מה מדובר — ופונה למשרד.
  installments?: number | null
  monthly_payment?: number | null
  approved_amount?: number | null
  purpose?: string | null
}

/** הודעת החסימה — נוסח אחיד לפורטל, למייל ולממשק. */
export const OPEN_LOAN_MESSAGE =
  'הנכם בתהליך בקשת הלוואה, ואין להגיש שוב עד לקבלת החלטה על ההלוואה הנמצאת בתהליך בירור'

/**
 * נוסח לבקשה שכבר אושרה אך טרם בוצעה.
 *
 * ⚠️ נפרד מ-OPEN_LOAN_MESSAGE: "עד לקבלת החלטה" הוא ניסוח שגוי כאן —
 * ההחלטה כבר התקבלה, והמבקש ממתין לביצוע. הודעה שאומרת לו שממתינים
 * להחלטה הייתה סותרת את מכתב האישור שהוא כבר קיבל.
 */
export const APPROVED_LOAN_MESSAGE =
  'שימו לב, קיימת במערכת בקשת הלוואה קודמת באמצע תהליך, לא ניתן להגיש כעת בקשה נוספת'

/**
 * הודעת החסימה המתאימה לסטטוס הבקשה הפתוחה.
 *
 * ⚠️ בקשה מאושרת שטרם הופקדה מקבלת נוסח נפרד: "עד לקבלת החלטה" שגוי
 * כאן — ההחלטה כבר התקבלה, והמבקש ממתין לביצוע ההפקדה.
 */
export function openLoanMessageFor(loan: OpenLoan): string {
  return loan.status === 'approved' ? APPROVED_LOAN_MESSAGE : OPEN_LOAN_MESSAGE
}

/**
 * מאתר בקשת הלוואה פתוחה של המוטב. מחזיר את הבקשה הפתוחה הוותיקה ביותר,
 * או null אם אין.
 *
 * ⚠️ בכשל שאילתה מוחזר null — כלומר *לא* חוסמים. חסימה על סמך שגיאת רשת
 * הייתה מונעת ממוטב לגיטימי להגיש בלי שום דרך להבין למה. הסיכון ההפוך
 * (בקשה כפולה נדירה) נראה למזכיר ומטופל ידנית.
 */
export async function findOpenLoan(
  db: SupabaseClient,
  beneficiaryId: string,
): Promise<OpenLoan | null> {
  const { data, error } = await db
    .from('loans')
    .select('id, status, amount, created_at, installments, monthly_payment, approved_amount, purpose')
    .eq('beneficiary_id', beneficiaryId)
    .in('status', OPEN_LOAN_STATUSES as unknown as string[])
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) {
    console.error('[openLoanGuard] query failed:', error.message)
    return null
  }
  return (data?.[0] as OpenLoan | undefined) ?? null
}

/**
 * מאתר טיוטה שממתינה לטופס אישור רב.
 *
 * ⚠️ נפרד מ-findOpenLoan בכוונה: זו אינה בקשה שחוסמת, אלא בקשה שהמבקש
 * צריך *להמשיך*. ערבוב בין השניים היה נועל אותו מחוץ לטיוטה שלו.
 */
export async function findDraftAwaitingRabbiForm(
  db: SupabaseClient,
  beneficiaryId: string,
): Promise<OpenLoan | null> {
  const { data, error } = await db
    .from('loans')
    .select('id, status, amount, created_at, installments, monthly_payment, approved_amount, purpose')
    .eq('beneficiary_id', beneficiaryId)
    .eq('status', AWAITING_RABBI_FORM)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('[openLoanGuard] draft query failed:', error.message)
    return null
  }
  return (data?.[0] as OpenLoan | undefined) ?? null
}

/** נוסח מפורט לתשובת המייל — כולל מתי הוגשה הבקשה הקודמת ובאיזה סכום. */
export function openLoanEmailReason(loan: OpenLoan): string {
  const when = (() => {
    try {
      return new Date(loan.created_at).toLocaleDateString('he-IL')
    } catch {
      return ''
    }
  })()
  const amount =
    loan.amount != null ? ` על סך ${Math.round(Number(loan.amount)).toLocaleString('en-US')}$` : ''
  const submitted = when ? ` שהוגשה בתאריך ${when}` : ''

  // ⚠️ הבחנה בין "ממתינה להחלטה" ל"אושרה וממתינה לביצוע": שליחת
  // "עדיין בתהליך בירור" למי שכבר קיבל מכתב אישור סותרת את מה שאמרנו לו.
  if (loan.status === 'approved') {
    return `הלוואתכם${submitted}${amount} אושרה וממתינה לביצוע, ולא ניתן להגיש בקשה נוספת עד להשלמת הביצוע.`
  }

  return `הבקשה הקודמת שלכם${submitted}${amount} עדיין בתהליך בירור, ולא ניתן להגיש בקשה נוספת כעת. עם קבלת ההחלטה תישלח אליכם הודעה.`
}
