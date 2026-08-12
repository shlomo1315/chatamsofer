// ─────────────────────────────────────────────────────────────────────────────
// טיוטות — סנכרון דו-כיווני מול Gmail.
//
// 🔴 למה זה מודול נפרד: טיוטה ב-Gmail היא *ישות אחרת* מהודעה. יש לה מזהה
// משלה (draftId) שנשאר קבוע לאורך העריכות, ומזהה הודעה (messageId) שמתחלף
// בכל שמירה. מי שמזהה טיוטה לפי messageId מאבד אותה בעריכה הראשונה.
//
// ⚠️ 🔴 והבעיה שאין לה פתרון "נכון" אלא רק הכרעה: אותה טיוטה יכולה להיערך
// בשני מקומות בו-זמנית — בתוכנה ובטלפון. אין דרך למזג שני טקסטים שנכתבו
// במקביל, ולכן חייבים לבחור מי גובר, ולומר זאת למשתמש במקום להחליט בשקט.
//
// ההכרעה כאן: **המאוחר גובר, אבל לא בשקט.** אם הגרסה המרוחקת השתנתה מאז
// שהמשתמש התחיל לערוך — הוא מקבל אזהרה ובחירה, ולא דריסה שקטה של מה שכתב.
// ─────────────────────────────────────────────────────────────────────────────

/** טיוטה כפי שהיא נשמרת באינדקס. */
export interface DraftRow {
  draft_id: string
  message_id: string | null
  thread_id: string | null
  to_email: string | null
  subject: string | null
  /**
   * ⚠️ בטיוטות הגוף כן נשמר — בניגוד להודעות. טיוטה היא תוכן שהמשתמש כותב
   * *עכשיו* ועדיין לא שלח, וטעינה מחדש מ-Gmail בכל הקלדה הייתה הופכת את
   * העריכה לבלתי אפשרית. זה אינו עותק של דואר שהתקבל אלא מצב עבודה.
   */
  body: string | null
  updated_at: string
  /** חותמת הגרסה שממנה נגזרה העריכה הנוכחית — הבסיס לזיהוי התנגשות. */
  base_revision: string | null
}

/** מה Gmail מחזיר על טיוטה. */
export interface RemoteDraft {
  id: string
  message?: { id?: string | null; threadId?: string | null } | null
}

export type DraftConflict =
  | { kind: 'none' }
  /** הגרסה המרוחקת התקדמה מאז שהמשתמש התחיל לערוך. */
  | { kind: 'remote-changed'; remoteRevision: string }
  /** הטיוטה נמחקה בצד השני. */
  | { kind: 'remote-deleted' }

/**
 * האם בטוח לכתוב את העריכה המקומית ל-Gmail.
 *
 * ⚠️ ההשוואה היא מול הגרסה ש*ממנה נגזרה העריכה* (base_revision), ולא מול
 * הגרסה המקומית האחרונה. אחרת כל שמירה הייתה נראית כהתנגשות עם עצמה.
 *
 * @param base   מזהה הגרסה שהמשתמש התחיל לערוך ממנה. null = טיוטה חדשה.
 * @param remote מזהה ההודעה הנוכחי ב-Gmail. null = הטיוטה אינה שם.
 */
export function checkDraftConflict(base: string | null, remote: string | null): DraftConflict {
  // טיוטה חדשה שטרם נשמרה — אין עם מה להתנגש.
  if (!base) return { kind: 'none' }
  // ⚠️ נמחקה בצד השני. כתיבה עיוורת הייתה יוצרת אותה מחדש ומחזירה לחיים
  // טיוטה שהמשתמש מחק בכוונה במקום אחר.
  if (!remote) return { kind: 'remote-deleted' }
  if (base !== remote) return { kind: 'remote-changed', remoteRevision: remote }
  return { kind: 'none' }
}

/** הודעה למשתמש לכל סוג התנגשות. */
export const CONFLICT_MESSAGE: Record<Exclude<DraftConflict, { kind: 'none' }>['kind'], string> = {
  'remote-changed': 'הטיוטה הזו נערכה גם במקום אחר מאז שפתחתם אותה. שמירה תחליף את הגרסה השנייה.',
  'remote-deleted': 'הטיוטה נמחקה במקום אחר. שמירה תיצור אותה מחדש.',
}

/**
 * האם יש בכלל מה לשמור.
 *
 * ⚠️ טיוטה ריקה לגמרי אינה נשמרת: Gmail יוצר עבורה רשומה, והמשתמש מקבל
 * טיוטות ריקות שנוצרות בכל פעם שפתח חלון וסגר אותו.
 */
export function isDraftEmpty(d: { to_email?: string | null; subject?: string | null; body?: string | null }): boolean {
  const text = String(d.body ?? '').replace(/<[^>]*>/g, '').trim()
  return !String(d.to_email ?? '').trim() && !String(d.subject ?? '').trim() && !text
}

/**
 * ממזג רשימת טיוטות מרוחקת עם המקומית.
 *
 * מחזיר את מה שיש לכתוב, למחוק, ומה שנמצא בהתנגשות.
 *
 * ⚠️ טיוטה שנעלמה מ-Gmail מסומנת למחיקה מקומית ולא נשמרת "ליתר ביטחון":
 * טיוטות שנמחקו וחוזרות בכל סנכרון הן בדיוק ההתנהגות שגורמת למשתמש לאבד
 * אמון במערכת ולהפסיק להשתמש בה.
 */
export function reconcileDrafts(
  local: DraftRow[],
  remote: RemoteDraft[],
): { removedLocally: string[]; remoteIds: string[] } {
  const remoteIds = remote.map(r => r.id).filter(Boolean)
  const remoteSet = new Set(remoteIds)
  return {
    removedLocally: local.filter(l => !remoteSet.has(l.draft_id)).map(l => l.draft_id),
    remoteIds,
  }
}

/**
 * בונה את גוף ה-MIME לשליחה/שמירה ב-Gmail.
 *
 * ⚠️ base64url ולא base64 רגיל: Gmail דוחה את הרגיל, והשגיאה שהוא מחזיר
 * אינה מרמזת על הסיבה.
 */
export function encodeDraftMime(d: {
  to?: string | null; subject?: string | null; body?: string | null; from?: string | null
}): string {
  const lines = [
    d.from ? `From: ${d.from}` : null,
    `To: ${String(d.to ?? '')}`,
    // ⚠️ הנושא מקודד ב-base64 עם תו כיווניות: נושא בעברית ללא קידוד מגיע
    // כג'יבריש בחלק מהלקוחות.
    `Subject: =?UTF-8?B?${Buffer.from(String(d.subject ?? ''), 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    String(d.body ?? ''),
  ].filter(Boolean)

  return Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
