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
 * הסטטוסים שבהם הבקשה עדיין "על השולחן" — טרם התקבלה בה החלטה.
 *
 * ⚠️ `approved` אינו כאן במכוון: הלוואה מאושרת היא החלטה שהתקבלה, וייתכן
 * מצב לגיטימי שבו משפחה שסיימה להחזיר מגישה בקשה חדשה. החסימה היא על
 * בקשה *ממתינה להחלטה*, לא על היסטוריה.
 *
 * 🔴 `awaiting_rabbi_form` אינו כאן: זו טיוטה שטרם הוגשה, והיא שייכת
 * למבקש עצמו. אילו הייתה נחשבת "בקשה פתוחה", המבקש היה ננעל מחוץ
 * לטיוטה של עצמו — לא יכול להשלים אותה ולא יכול להתחיל חדשה.
 */
export const OPEN_LOAN_STATUSES = ['pending', 'inquiry'] as const

/** טיוטה שממתינה לטופס חתימת רב חתום — שייכת למבקש, לא למזכיר. */
export const AWAITING_RABBI_FORM = 'awaiting_rabbi_form'

export type OpenLoan = {
  id: string
  status: string
  amount: number | null
  created_at: string
}

/** הודעת החסימה — נוסח אחיד לפורטל, למייל ולממשק. */
export const OPEN_LOAN_MESSAGE =
  'הנכם בתהליך בקשת הלוואה, ואין להגיש שוב עד לקבלת החלטה על ההלוואה הנמצאת בתהליך בירור'

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
    .select('id, status, amount, created_at')
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
 * מאתר טיוטה שממתינה לטופס חתימת רב.
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
    .select('id, status, amount, created_at')
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

  return `הבקשה הקודמת שלכם${submitted}${amount} עדיין בתהליך בירור, ולא ניתן להגיש בקשה נוספת כעת. עם קבלת ההחלטה תישלח אליכם הודעה.`
}
