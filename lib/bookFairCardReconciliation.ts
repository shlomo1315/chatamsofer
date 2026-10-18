// סנכרון חיובי אשראי מול אקסל נדרים (18.10.2026).
//
// הטבלה book_fair_card_reconciliation מחזיקה שורה לכל חיוב באקסל עם ההזמנה
// שהותאמה אליו. "מבוטלות שחויבו" ו"ספרות לא עקביות" מחושבות ממנה ומהסטטוס
// החי של ההזמנה. שתי הקבוצות האחרות הן תמונת מצב מיום הסנכרון: את
// ההזמנות שתוקנו כבר אי אפשר לזהות בסטטוס, ו"שולם בלי חיוב" תלוי בטווח
// התאריכים של האקסל.

export interface ReconciliationRow {
  order_number: string
  charged_at: string
  amount_agorot: number
  card_last4: string
  transaction_id: string
  match_type: 'transaction' | 'amount_time'
  deviation_minutes: number | string | null
  system_last4: string | null
}

/** הזמנות שסומנו "נכשל" אבל החיוב עבר באקסל, ותוקנו ל"שולם". */
export const FIXED_FAILED_TO_PAID = [
  'TMP-cp9unkfkza37', 'TMP-cdj34ljqzpqs', 'TMP-cah38u83rcfu',
  'TMP-c75exmrt9ez7', 'TMP-7b2001ee708a', 'TMP-cr6nby8qsqfh',
]

/** שולמו אצלנו ואין להן חיוב באקסל. */
export const PAID_WITHOUT_CHARGE = [
  'BF-26-WHARTP', '121294', '121593', '121630', '121931',
  '121995', '122632', '122708', '122733',
]

/** גם בלי חיוב באקסל, אבל יש עליהן החזר ידני ולכן כנראה תקינות. */
export const MANUAL_REFUND_NO_CHARGE = ['BF-26-4QD8EC', 'BF-26-8LX8V3', 'BF-26-FL8AD5']

export function summarize(rows: ReconciliationRow[]) {
  let transaction = 0
  let amountTime = 0
  let total = 0
  for (const r of rows) {
    total += r.amount_agorot
    if (r.match_type === 'transaction') transaction++
    else amountTime++
  }
  return { count: rows.length, total, transaction, amountTime }
}

/** הזמנות בסטטוס מבוטל שיש להן חיוב באקסל. */
export function cancelledCharged(rows: ReconciliationRow[], statusByNumber: Map<string, string>) {
  return rows.filter(r => statusByNumber.get(r.order_number) === 'cancelled')
}

/** חיובים שבהם הספרות באקסל שונות מהספרות ששמורות בתשלום במערכת. */
export function inconsistentDigits(rows: ReconciliationRow[]) {
  return rows.filter(r => !!r.system_last4 && r.system_last4 !== r.card_last4)
}
