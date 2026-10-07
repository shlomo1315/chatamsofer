// ─────────────────────────────────────────────────────────────────────────────
// ספרים שסומנו "בעייתיים במלאי" (בקשת המשתמש 07.10).
//
// הצוות מגלה שספר חסר / פגום / מתעכב אצל המו״ל, ומסמן אותו. מסך ההזמנות
// מסנן אז את כל ההזמנות שהספר הזה נמצא בתוכן — כדי לטפל בהן יחד
// (לעכב, להודיע ללקוח, לזכות).
//
// ⚠️ נשמר ב-app_settings ולא בעמודה ב-book_fair_books: עמודה חדשה דורשת
// מיגרציה ידנית, ו-select של עמודה שעוד לא קיימת מרוקן את הקטלוג כולו.
//
// 🔴 app_settings.value היא עמודת text — חובה JSON.stringify. אובייקט גולמי
// נשמר כ-"[object Object]" בלי שום שגיאה.
// ─────────────────────────────────────────────────────────────────────────────

export const PROBLEM_BOOKS_KEY = 'book_fair_problem_books'

export interface ProblemBookMark {
  /** הסיבה שהוזנה בסימון (לא חובה). */
  note: string | null
  /** מתי סומן — ISO. */
  at: string
}

/** מזהה ספר ← הסימון. */
export type ProblemBooks = Record<string, ProblemBookMark>

/**
 * פענוח הערך השמור.
 *
 * ⚠️ לעולם אינו זורק: ערך פגום (או "[object Object]" מבאג ישן) מחזיר
 * רשימה ריקה. מסך ההזמנות שנופל בגלל הגדרה פגומה גרוע בהרבה מסינון חסר.
 */
export function parseProblemBooks(raw: unknown): ProblemBooks {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return {} }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const out: ProblemBooks = {}
  for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!id || !v || typeof v !== 'object') continue
    const m = v as Record<string, unknown>
    out[id] = {
      note: typeof m.note === 'string' && m.note.trim() ? m.note.trim() : null,
      at: typeof m.at === 'string' ? m.at : '',
    }
  }
  return out
}

/** סימון או הסרת סימון — מחזיר עותק חדש, אינו משנה את המקור. */
export function setProblemBook(
  current: ProblemBooks, bookId: string, problem: boolean, note: string | null, now: string,
): ProblemBooks {
  const next = { ...current }
  if (problem) next[bookId] = { note: note?.trim() || null, at: now }
  else delete next[bookId]
  return next
}

/**
 * אילו מההזמנות מכילות ספר בעייתי, ואילו ספרים בדיוק.
 *
 * @param orderBooks הזמנה ← מזהי הספרים שבה
 * @param problemIds מזהי הספרים הבעייתיים
 * @returns הזמנה ← מזהי הספרים הבעייתיים שבה (רק הזמנות שיש בהן לפחות אחד)
 */
export function ordersWithProblemBooks(
  orderBooks: Record<string, string[]>, problemIds: Iterable<string>,
): Record<string, string[]> {
  const ids = new Set(problemIds)
  const out: Record<string, string[]> = {}
  if (!ids.size) return out
  for (const [orderId, books] of Object.entries(orderBooks)) {
    const hit = [...new Set(books.filter(b => ids.has(b)))]
    if (hit.length) out[orderId] = hit
  }
  return out
}
