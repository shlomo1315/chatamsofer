// ─────────────────────────────────────────────────────────────────────────────
// שלבי ההלוואה בפורטל הביצוע.
//
// 🔴 שלושה שלבים בחיי ההלוואה, ולא שניים: טרם נשלח שטר → נשלח שטר וממתין
// לחתימה → בוצעה.
//
// ⚠️ עד כה היו "ממתינות לביצוע" ו"בוצעו" בלבד, ושלב הביניים נבלע
// ב"ממתינות". הגורם המבצע לא יכול היה לדעת למי כבר נשלח שטר — ולכן שלח
// שוב לאותם אנשים, או פספס מי שממתין לחתימה כבר שבוע.
//
// ⚠️ מקור אמת יחיד ומקביל ל-lib/loansListFilter (מסך הניהול): הגדרת
// הקטגוריות בשני מקומות הייתה מייצרת שתי תשובות לאותה שאלה.
// ─────────────────────────────────────────────────────────────────────────────

export type LoanStage = 'all' | 'pending' | 'no_note' | 'note_sent' | 'done'

export interface StageRow {
  /** מועד שליחת השטר לחתימה. */
  note_sent_at?: string | null
  /** מועד ההפקדה בפועל. */
  disbursed_at?: string | null
}

/**
 * השלבים לתצוגה בבורר, לפי סדר חיי ההלוואה.
 *
 * ⚠️ "ממתינות לביצוע" נשאר ראשון אחרי "הכל" — זו ברירת המחדל הקיימת,
 * והיא הרשימה שהגורם המבצע עובד ממנה בפועל.
 */
export const LOAN_STAGES: { key: LoanStage; label: string }[] = [
  { key: 'all', label: 'כל ההלוואות' },
  { key: 'pending', label: 'ממתינות לביצוע' },
  { key: 'no_note', label: 'טרם נשלח שטר' },
  { key: 'note_sent', label: 'נשלח שטר — ממתין' },
  { key: 'done', label: 'בוצעו' },
]

/** ⚠️ מחרוזת ריקה אינה תאריך — היא מגיעה מהמסד כערך ריק ולא כ-null. */
const has = (v: string | null | undefined): boolean => !!String(v ?? '').trim()

/**
 * האם ההלוואה שייכת לשלב המבוקש.
 *
 * 🔴 disbursed_at גובר תמיד: הלוואה שבוצעה אינה "ממתינה לחתימה" גם אם יש
 * לה note_sent_at, אחרת היא נספרת בשתי קטגוריות.
 */
export function matchesLoanStage(row: StageRow, stage: LoanStage): boolean {
  const done = has(row.disbursed_at)
  const noted = has(row.note_sent_at)
  switch (stage) {
    case 'all': return true
    case 'done': return done
    case 'pending': return !done
    case 'no_note': return !done && !noted
    case 'note_sent': return !done && noted
    default: return true
  }
}
