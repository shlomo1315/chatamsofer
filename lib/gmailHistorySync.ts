// ─────────────────────────────────────────────────────────────────────────────
// סנכרון מצטבר מול Gmail — הלוגיקה הטהורה.
//
// 🔴 ההחלטה הארכיטקטונית שהמודול הזה משרת: **Gmail הוא מקור האמת, והמערכת
// מחזיקה אינדקס ולא עותק.** כל עוד אין במערכת עותק שני של ההודעה, כפילות
// אינה יכולה להיווצר — וזו בדיוק הכפילות שהמערכת סובלת ממנה היום, כשדואר
// נכנס יושב גם ב-inbound_emails וגם בתיבת Gmail.
//
// מה המערכת כן שומרת: מצביע (gmail_message_id) + מה ש*היא* מוסיפה — שיוך
// לכרטסת, ניתוב מחלקה, סטטוס בקשה. גוף ההודעה נקרא מ-Gmail לפי דרישה.
//
// ─── למה History ולא סריקה ───────────────────────────────────────────────────
// היום המסך עושה polling כל 4 שניות וקורא את התיבה מחדש. זה לא מסנכרן "נקרא/
// לא נקרא", לא תופס מחיקות, ולא יודע מה השתנה — הוא רק מצייר מחדש.
//
// Gmail מספק היסטוריית שינויים מצטברת: מכל historyId ואילך, בדיוק מה שקרה.
// זה מה שמאפשר סנכרון דו-כיווני אמיתי — קריאה בטלפון מגיעה לכאן כשינוי תווית,
// ולא כניחוש מתוך סריקה.
//
// ⚠️ 🔴 והמלכודת שחייבת להיבנות מהיום הראשון: Gmail שומר היסטוריה לזמן מוגבל
// (בפועל כשבוע). historyId ישן מדי מוחזר כ-404, ואז *אי אפשר* להשלים ממנו —
// כל מה שקרה בינתיים אבד. מערכת שלא מטפלת בזה נראית עובדת חודשים ואז מפספסת
// הודעות בשקט אחרי כל שבתון או תקלת רשת ארוכה. לכן המודול הזה אינו מחזיר
// "רשימת שינויים" בלבד אלא *החלטה*: להמשיך מצטבר, או ליפול להתאמה מלאה.
// ─────────────────────────────────────────────────────────────────────────────

/** תווית שמסמנת הודעה שלא נקראה — הציר המרכזי בסנכרון הדו-כיווני. */
export const UNREAD_LABEL = 'UNREAD'

/** רשומת היסטוריה כפי ש-Gmail מחזיר (החלקים שאנחנו צורכים בלבד). */
export interface GmailHistoryRecord {
  id?: string | null
  messagesAdded?: { message?: { id?: string | null; threadId?: string | null } | null }[] | null
  messagesDeleted?: { message?: { id?: string | null; threadId?: string | null } | null }[] | null
  labelsAdded?: { message?: { id?: string | null; threadId?: string | null } | null; labelIds?: string[] | null }[] | null
  labelsRemoved?: { message?: { id?: string | null; threadId?: string | null } | null; labelIds?: string[] | null }[] | null
}

export interface GmailHistoryPage {
  history?: GmailHistoryRecord[] | null
  historyId?: string | null
}

/** שינוי אחד שיש להחיל על האינדקס. */
export interface MessageChange {
  messageId: string
  threadId: string | null
  /** added — למשוך מטא-דאטה מ-Gmail · deleted — לסמן כמוסר · labels — לעדכן בלבד. */
  kind: 'added' | 'deleted' | 'labels'
  /** התוויות שנוספו/הוסרו, לעדכון מצב הנקרא ותיוג המחלקה. */
  labelsAdded: string[]
  labelsRemoved: string[]
}

export type SyncPlan =
  | { mode: 'incremental'; changes: MessageChange[]; nextHistoryId: string | null }
  /**
   * ⚠️ התאמה מלאה. מגיעה כשאין ממה להמשיך — סנכרון ראשון, או historyId שפג.
   * זו אינה שגיאה אלא מסלול תקין שחייב להיות ממומש, אחרת המערכת מפספסת
   * הודעות בשקט בדיוק אחרי ההפסקה הארוכה שבה הכי חשוב שלא תפספס.
   */
  | { mode: 'full'; reason: 'no-cursor' | 'history-expired' }

/**
 * האם שגיאת Gmail אומרת ש-historyId שנשלח כבר אינו זמין.
 *
 * ⚠️ 404 הוא הסימן הרשמי. נבדק גם לפי הודעת השגיאה, כי הלקוחות עוטפים את
 * הסטטוס בצורות שונות ונפילה בשקט כאן היא בדיוק הכשל שאי אפשר לראות.
 */
export function isHistoryExpired(err: unknown): boolean {
  const e = err as { code?: unknown; status?: unknown; response?: { status?: unknown }; message?: unknown }
  const code = Number(e?.code ?? e?.status ?? e?.response?.status ?? 0)
  if (code === 404) return true
  return /startHistoryId|history.*(not found|too old|expired)/i.test(String(e?.message ?? ''))
}

const idOf = (m?: { id?: string | null } | null) => (m?.id ? String(m.id) : '')
const threadOf = (m?: { threadId?: string | null } | null) => (m?.threadId ? String(m.threadId) : null)

/**
 * מכווץ דפי היסטוריה לשינוי אחד לכל הודעה.
 *
 * ⚠️ הכיווץ אינו נוחות: אותה הודעה מופיעה בכמה רשומות היסטוריה (נוספה, סומנה
 * כנקראה, קיבלה תווית), והחלה של כל רשומה בנפרד הייתה מייצרת קריאות מיותרות
 * ל-Gmail ומצב ביניים שגוי על המסך.
 *
 * ⚠️ סדר העדיפויות בין סוגי השינוי אינו שרירותי:
 *   deleted גובר על הכל — אין טעם למשוך מטא-דאטה להודעה שאיננה.
 *   added גובר על labels — ממילא נמשכת המטא-דאטה המלאה, שכוללת תוויות.
 */
export function collapseHistory(pages: GmailHistoryPage[]): MessageChange[] {
  const byId = new Map<string, MessageChange>()

  const touch = (msgId: string, threadId: string | null, kind: MessageChange['kind']): MessageChange => {
    const cur = byId.get(msgId)
    if (!cur) {
      const fresh: MessageChange = { messageId: msgId, threadId, kind, labelsAdded: [], labelsRemoved: [] }
      byId.set(msgId, fresh)
      return fresh
    }
    const rank = { labels: 0, added: 1, deleted: 2 } as const
    if (rank[kind] > rank[cur.kind]) cur.kind = kind
    if (!cur.threadId && threadId) cur.threadId = threadId
    return cur
  }

  for (const page of pages) {
    for (const rec of page.history ?? []) {
      for (const a of rec.messagesAdded ?? []) {
        const id = idOf(a?.message)
        if (id) touch(id, threadOf(a?.message), 'added')
      }
      for (const d of rec.messagesDeleted ?? []) {
        const id = idOf(d?.message)
        if (id) touch(id, threadOf(d?.message), 'deleted')
      }
      for (const l of rec.labelsAdded ?? []) {
        const id = idOf(l?.message)
        if (!id) continue
        const c = touch(id, threadOf(l?.message), 'labels')
        for (const lb of l?.labelIds ?? []) if (!c.labelsAdded.includes(lb)) c.labelsAdded.push(lb)
      }
      for (const l of rec.labelsRemoved ?? []) {
        const id = idOf(l?.message)
        if (!id) continue
        const c = touch(id, threadOf(l?.message), 'labels')
        for (const lb of l?.labelIds ?? []) if (!c.labelsRemoved.includes(lb)) c.labelsRemoved.push(lb)
      }
    }
  }

  return [...byId.values()]
}

/**
 * בונה את תוכנית הסנכרון מהסמן השמור ומדפי ההיסטוריה.
 *
 * @param cursor ה-historyId האחרון שהוחל בהצלחה. ריק = מעולם לא סונכרן.
 */
export function planSync(cursor: string | null | undefined, pages: GmailHistoryPage[]): SyncPlan {
  if (!cursor) return { mode: 'full', reason: 'no-cursor' }

  // ⚠️ ה-historyId הבא נלקח מהדף האחרון שהוחזר, ולא מהשינוי האחרון: Gmail
  // מקדם את המונה גם על שינויים שאינם מעניינים אותנו, ושמירת מזהה של שינוי
  // בודד הייתה גורמת לסנכרון הבא לחזור על טווח שכבר טופל.
  const last = [...pages].reverse().find(p => p.historyId)
  return {
    mode: 'incremental',
    changes: collapseHistory(pages),
    nextHistoryId: last?.historyId ? String(last.historyId) : null,
  }
}

/**
 * מצב הנקרא אחרי החלת השינוי, או null אם השינוי אינו נוגע בו.
 *
 * זהו הציר שהופך את הסנכרון לדו-כיווני בעיני המשתמש: פתח בטלפון — ירד
 * UNREAD — והמערכת מסמנת כנקרא בלי שאיש לחץ בה כלום.
 */
export function readStateAfter(change: MessageChange): boolean | null {
  if (change.labelsRemoved.includes(UNREAD_LABEL)) return true   // נקרא
  if (change.labelsAdded.includes(UNREAD_LABEL)) return false    // סומן כלא-נקרא
  return null
}
