import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// הלוואות מהמערכת הקודמת — נרמול, שליפה וסיכום.
//
// 🔴 מקור אמת יחיד לנרמול ת"ז ולפירוש הסכומים. שני אלה מופיעים גם בייבוא
// וגם בשליפה, ופער ביניהם היה מייצר את המצב הגרוע: הייבוא שומר בצורה אחת
// והחיפוש מחפש בצורה אחרת, ואף הלוואה לא מתחברת — בלי שום שגיאה.
// ─────────────────────────────────────────────────────────────────────────────

export interface LegacyLoan {
  id: string
  file_number: string | null
  fund: string | null
  id_number: string | null
  borrower_name: string | null
  address: string | null
  city: string | null
  phone: string | null
  email: string | null
  approved_amount: number | null
  taken_amount: number | null
  installments: number | null
  source_row: number | null
  manually_edited: boolean
}

/**
 * נרמול ת"ז לספרות בלבד.
 *
 * ⚠️ בלי padStart ל-9: באקסל יש ת"ז בת 10 ספרות (שגויה, נשמרת לתיקון ידני),
 * וריפוד היה משנה אותה. במקום זה ההשוואה מנסה כמה צורות — ראה idVariants.
 */
export const normalizeId = (v: unknown): string =>
  String(v ?? '').replace(/\D/g, '')

/**
 * כל הצורות שבהן אותה ת"ז עשויה להיות שמורה, לצורך התאמה.
 *
 * 🔴 זו הנקודה שבה שיוך נכשל בשקט: ת"ז נשמרת במסד לעיתים עם אפס מוביל
 * ולעיתים בלעדיו ("012345678" מול "12345678"), והשוואה ישירה מחמיצה התאמה
 * אמיתית. אותו טיפול קיים כבר ב-beneficiary-search, ומכאן הוא נגזר.
 */
export function idVariants(v: unknown): string[] {
  const d = normalizeId(v)
  if (!d) return []
  const set = new Set<string>([d])
  set.add(d.padStart(9, '0'))
  const stripped = d.replace(/^0+/, '')
  if (stripped) set.add(stripped)
  return [...set]
}

/**
 * פירוש סכום מתא אקסל.
 *
 * ⚠️ מחזיר ערך מוחלט: באקסל הסכום שבוצע רשום שלילי (-9000) כי כך נראה חיוב
 * בהנהלת חשבונות. המסך מציג סכום הלוואה, לא רשומה חשבונאית.
 *
 * ⚠️ מנקה תווי כיווניות ומטבע: התאים הגיעו כמחרוזות בצורת "‪$ 9,000.00‬"
 * (כולל תווי bidi בלתי נראים), ו-Number() עליהן מחזיר NaN.
 */
export function parseAmount(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const raw = typeof v === 'object'
    ? String((v as { result?: unknown; text?: unknown }).result
        ?? (v as { text?: unknown }).text ?? '')
    : String(v)
  const cleaned = raw.replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.abs(n) : null
}

/** האם ההלוואה נלקחה בפועל. ⚠️ null = אושר ולא נלקח; אפס = בוצע בסכום אפס. */
export const wasTaken = (l: Pick<LegacyLoan, 'taken_amount'>): boolean =>
  l.taken_amount !== null && l.taken_amount !== undefined

/**
 * ת"ז שאינה ניתנת לשיוך — מוצגת בלשונית לתיקון ידני.
 *
 * ת"ז ישראלית היא עד 9 ספרות. באקסל יש שורה בת 10 ספרות ושורה ריקה לגמרי;
 * שתיהן נשמרות (שום נתון לא נזרק) אך לא יתחברו לאף משפחה עד שיתוקנו.
 */
export const isUnlinkableId = (v: unknown): boolean => {
  const d = normalizeId(v)
  return d.length < 5 || d.length > 9
}

export interface LegacySummary {
  loans: LegacyLoan[]
  /** סך ההלוואות ההיסטוריות של המשפחה. */
  count: number
  /** מהן — כמה נלקחו בפועל. */
  takenCount: number
  /** סך מה שאושר (כולל מה שלא נלקח). */
  totalApproved: number
  /** סך מה שנלקח בפועל. */
  totalTaken: number
}

/**
 * היסטוריית ההלוואות הקודמות של משפחה, לפי ת"ז הבעל *וגם* ת"ז האישה.
 *
 * ⚠️ שתי הת"ז ולא רק הבעל: במערכת הקודמת ההלוואה נרשמה לפעמים על שם האישה
 * (למשל "גפנר הינדל רחל" באקסל), וחיפוש לפי הבעל בלבד היה מחמיץ אותה.
 *
 * ⚠️ מיזוג לפי id ולא שרשור: אם שתי הת"ז מובילות לאותה שורה (זוג שרשום
 * בשתיהן) היא הייתה נספרת פעמיים והסיכום היה מוכפל.
 */
export async function getLegacyLoansFor(
  db: SupabaseClient,
  idNumbers: (string | null | undefined)[],
): Promise<LegacySummary> {
  const empty: LegacySummary = { loans: [], count: 0, takenCount: 0, totalApproved: 0, totalTaken: 0 }

  const variants = [...new Set(idNumbers.flatMap(idVariants))]
  if (!variants.length) return empty

  const { data, error } = await db
    .from('legacy_loans')
    .select('id, file_number, fund, id_number, borrower_name, address, city, phone, email, approved_amount, taken_amount, installments, source_row, manually_edited')
    .in('id_number', variants)
  if (error || !data) return empty

  // מיזוג לפי מזהה — ראה הערה למעלה.
  const byId = new Map<string, LegacyLoan>()
  for (const r of data as LegacyLoan[]) byId.set(String(r.id), r)
  const loans = [...byId.values()]

  return {
    loans,
    count: loans.length,
    takenCount: loans.filter(wasTaken).length,
    totalApproved: loans.reduce((s, l) => s + Number(l.approved_amount ?? 0), 0),
    totalTaken: loans.reduce((s, l) => s + (wasTaken(l) ? Number(l.taken_amount ?? 0) : 0), 0),
  }
}
