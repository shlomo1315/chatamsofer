// ── הכרעת כוונת deep-link מקישורי המייל (?action=birth|loan|aid|docs|details|holiday) ──
//
// 🔴 למה זה קובץ נפרד ובדוק: הלוגיקה הזו הפילה לשוניות בייצור.
//
// ה-effect שקופץ לטופס תלוי ב-`step`, והפתיחה עצמה קוראת ל-setStep.
// כל עוד הכוונה לא נוקתה — ה-effect רץ שוב על אותם נתונים בדיוק, קורא
// שוב ל-setState, וזה מפעיל אותו מחדש: לולאת רינדור אינסופית שמחסלת את
// ה-renderer של הדפדפן ("This page couldn't load").
//
// הכלל שמונע את זה: **לא מנקים את הכוונה רק כשעוד מחכים לנתונים.**
// ברגע שהנתונים כאן — מנקים תמיד, גם (ובעיקר) כשהפתיחה נחסמה.

export type DeepLinkAction = 'birth' | 'loan' | 'aid' | 'docs' | 'details' | 'holiday'

export type DeepLinkState = {
  /** האם שערי המחלקות נטענו מהשרת */
  gatesLoaded: boolean
  /** האם נתוני חלוקת החגים נטענו */
  holidayLoaded: boolean
  /** האם המשפחה רשומה במצב נשואים */
  canRequestBirth: boolean
  /** האם המחלקה הרלוונטית פתוחה */
  gateOpen: boolean
  /** האם ממתינים להשלמת מסמכים */
  isDocsPending: boolean
}

export type DeepLinkResult = {
  /** מה לפתוח; null = לא נפתח דבר */
  open: 'birth-form' | 'loan-intro' | 'aid-modal' | 'docs-needed' | 'edit-details' | 'holiday' | 'docs-gate-modal' | null
  /**
   * האם לנקות את הכוונה. false *רק* כשממתינים לנתונים שטרם הגיעו —
   * אחרת ה-effect ינסה שוב לנצח וייצור לולאה אינסופית.
   */
  clearIntent: boolean
  /** הודעת שגיאה להצגה, אם יש */
  error?: string
}

export function resolveDeepLinkAction(action: DeepLinkAction, s: DeepLinkState): DeepLinkResult {
  // ── פעולות התלויות בשער מחלקה: ממתינים לטעינת השערים ──
  // זה המצב היחיד שבו *לא* מנקים — הנתונים באמת עוד בדרך.
  if ((action === 'birth' || action === 'loan' || action === 'aid') && !s.gatesLoaded) {
    return { open: null, clearIntent: false }
  }

  if (action === 'birth') {
    // מכאן והלאה: הנתונים כאן. כל תוצאה מנקה את הכוונה.
    // ⚠️ מחלקה סגורה — חסימה שקטה (בקשת המנהל: לא מזכירים מחלקה סגורה).
    if (!s.gateOpen) return { open: null, clearIntent: true }
    if (!s.canRequestBirth) {
      return { open: null, clearIntent: true, error: 'בקשת הבראה ליולדת זמינה לרשומים במצב נשואים בלבד.' }
    }
    if (s.isDocsPending) return { open: 'docs-gate-modal', clearIntent: true }
    return { open: 'birth-form', clearIntent: true }
  }

  if (action === 'loan') {
    if (!s.gateOpen) return { open: null, clearIntent: true }
    if (s.isDocsPending) return { open: 'docs-gate-modal', clearIntent: true }
    return { open: 'loan-intro', clearIntent: true }
  }

  if (action === 'aid') {
    if (!s.gateOpen) return { open: null, clearIntent: true }
    return { open: 'aid-modal', clearIntent: true }
  }

  if (action === 'docs') return { open: 'docs-needed', clearIntent: true }
  if (action === 'details') return { open: 'edit-details', clearIntent: true }

  // חלוקת חגים — ממתינים לנתוני החלוקה; משהגיעו, מנקים בכל מקרה.
  if (action === 'holiday') {
    if (!s.holidayLoaded) return { open: null, clearIntent: false }
    return { open: 'holiday', clearIntent: true }
  }

  return { open: null, clearIntent: true }
}
