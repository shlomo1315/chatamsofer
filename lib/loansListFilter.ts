// ─────────────────────────────────────────────────────────────────────────────
// קטגוריות רשימת ההלוואות — מקור אמת יחיד.
//
// 🔴 למה המודול הזה קיים: הקטגוריות ("ממתין לטיפול", "חזר מבירור", "נשלח
// לבירור") היו מוגדרות בתוך LoansTable.tsx בלבד. כשהרשימה עברה לדפדוף
// בצד השרת, אותה לוגיקה נדרשה גם ב-SQL — ושכפול היה יוצר בדיוק את התקלה
// שהקוד כבר הזהיר מפניה: המונה על הלשונית מציג מספר אחד, והרשימה מציגה
// אחר.
//
// כאן הכללים מוגדרים פעם אחת. ה-SQL (loans_list_counts) משכפל אותם
// בהכרח, ולכן יש טסט שמריץ את שני המימושים על אותם נתונים ומשווה.
//
// ⚠️ כל שינוי כאן מחייב שינוי תואם ב-supabase/migrations/*_loans_list_rpc.sql.
// ─────────────────────────────────────────────────────────────────────────────

export type LoanFilter = 'all' | 'todo' | 'sent' | 'approved' | 'rejected'
export type LoanTodoSub = 'all' | 'fresh' | 'returned'

/** המידע המינימלי שהקטגוריה נגזרת ממנו. */
export interface LoanCategoryInput {
  status: string
  /**
   * כיוון ההודעה האחרונה בשרשור הבירור ('applicant' = המבקש השיב).
   * ריק/undefined כשאין הודעות כלל.
   */
  lastDir?: string | null
}

/** הוגש וטרם טופל. */
export const isFreshTodo = (l: LoanCategoryInput) => l.status === 'pending'

/**
 * 🔴 נשלח בירור *והמבקש ענה*. הסטטוס נשאר 'inquiry' במכוון (ראו lib/loanInquiry),
 * ולכן בלי הבדיקה הזו הבקשה נראית כאילו ממתינים לו — בזמן שהיא ממתינה לנו.
 */
export const isReturned = (l: LoanCategoryInput) =>
  l.status === 'inquiry' && l.lastDir === 'applicant'

/** נשלח בירור והמבקש עדיין לא הגיב — הכדור אצלו. */
export const isSentPending = (l: LoanCategoryInput) =>
  l.status === 'inquiry' && l.lastDir !== 'applicant'

/** ממתין לטיפולנו = ראשוני או חזר מבירור. */
export const isTodo = (l: LoanCategoryInput) => isFreshTodo(l) || isReturned(l)

/**
 * ⚠️ "אושר" כולל גם active/completed — הלוואה שכבר בביצוע או שהסתיימה
 * אושרה בעבר, ולכן היא שייכת ללשונית הזו. בדיקת status='approved' בלבד
 * הייתה מעלימה אותן מהמונה ומהרשימה כאחד.
 */
export const APPROVED_STATUSES = ['approved', 'active', 'completed'] as const
/** ⚠️ "נדחה" כולל defaulted (הלוואה שלא נפרעה) — מאותו טעם. */
export const REJECTED_STATUSES = ['rejected', 'defaulted'] as const

export const isApproved = (l: LoanCategoryInput) =>
  (APPROVED_STATUSES as readonly string[]).includes(l.status)
export const isRejected = (l: LoanCategoryInput) =>
  (REJECTED_STATUSES as readonly string[]).includes(l.status)

export function matchesLoanFilter(l: LoanCategoryInput, f: LoanFilter): boolean {
  if (f === 'all') return true
  if (f === 'todo') return isTodo(l)
  if (f === 'sent') return isSentPending(l)
  if (f === 'approved') return isApproved(l)
  return isRejected(l)
}

export function matchesTodoSub(l: LoanCategoryInput, sub: LoanTodoSub): boolean {
  if (sub === 'fresh') return isFreshTodo(l)
  if (sub === 'returned') return isReturned(l)
  return true
}

export interface LoanCounts {
  all: number
  todo: number
  fresh: number
  returned: number
  sent: number
  approved: number
  rejected: number
}

/**
 * ספירת הקטגוריות מרשימה בזיכרון. משמש את הטסט להשוואה מול ה-RPC,
 * ואת מסלול הנפילה-לאחור כשה-RPC אינו זמין.
 */
export function countLoanCategories(rows: LoanCategoryInput[]): LoanCounts {
  const counts: LoanCounts = { all: 0, todo: 0, fresh: 0, returned: 0, sent: 0, approved: 0, rejected: 0 }
  for (const l of rows) {
    counts.all++
    if (isFreshTodo(l)) counts.fresh++
    if (isReturned(l)) counts.returned++
    if (isTodo(l)) counts.todo++
    if (isSentPending(l)) counts.sent++
    if (isApproved(l)) counts.approved++
    if (isRejected(l)) counts.rejected++
  }
  return counts
}
